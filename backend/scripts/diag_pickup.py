"""Diagnóstico interactivo del pick-up sobre un video real.

Corre detección+tracking (ByteTrack) y el InteractionEngine con la configuración
del sitio, submuestreado, y reporta dónde se pierde el pick-up:

  * has_pose (modelo pose disponible y wrists reales)
  * distribución de distancia mínima mano->góndola (m)
  * frames con mano dentro del reach (pickup_reach)
  * estados APPROACH/ENGAGED y transición de interacción
  * agrega interactions / pickups por góndola

Uso (desde repo root):
  backend\.venv\Scripts\python.exe -u backend\scripts\diag_pickup.py <video> <site_id> [--stride N] [--max-frames N]
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import cv2  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import Site  # noqa: E402
from app.cv.detector import get_person_detector  # noqa: E402
from app.cv.pipeline import analysis_mode, _fast_process_configuration  # noqa: E402
from app.cv.spatial import SpatialEngine  # noqa: E402
from app.cv.interaction import InteractionEngine  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=str)
    parser.add_argument("site_id", type=int)
    parser.add_argument("--stride", type=int, default=3)
    parser.add_argument("--max-frames", type=int, default=1500)
    args = parser.parse_args()

    with SessionLocal() as db:
        site = db.get(Site, args.site_id)
        if not site:
            print("Sitio no encontrado")
            return 2
        configuration = site.configuration

    print("=== CONFIG ===")
    cam = configuration.get("camera", {})
    gs = configuration.get("gondolas", [])
    print(f"calibration={cam.get('calibration_status')} mode={analysis_mode(configuration)}")
    print(f"gondolas={len(gs)} shapes =", [(g['name'], g['x'], g['z'], g['width'], g['depth']) for g in gs])
    print("thresholds =", json.dumps(configuration.get("thresholds", {})))
    print(f"floor = {configuration.get('floor', {}).get('width')}x{configuration.get('floor', {}).get('depth')}")

    capture = cv2.VideoCapture(args.video)
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"video: {total} frames @ {fps:.2f}fps {width}x{height}")

    mode = analysis_mode(configuration)
    if mode == "fast":
        process_config = _fast_process_configuration(configuration, width, height)
    else:
        process_config = configuration
    spatial = SpatialEngine(process_config, width, height)
    interactions = InteractionEngine(process_config)

    detector = get_person_detector(detection_only=False)
    detector.reset_tracker()
    has_pose = not detector.detection_only
    print("detector pose:", has_pose)

    print("\n=== RUN ===")
    reach = interactions.pickup_reach
    frame_index = 0
    det_ok = 0
    hand_dist_min = float("inf")
    hand_dist_close = 0          # frames con al menos una mano a <= reach
    engaged_frames = 0
    interaction_frames = 0
    pickup_frames = 0
    footer = None
    with_car = set()
    n_eviden = 0
    samples: list[tuple[float, float]] = []
    # Amplitud de mano por segmento dentro del reach: desplazamiento desde la entrada
    # al radio hasta el pico de acercamiento (misma métrica que el filtro del engine).
    reach_state: dict[int, dict] = {}
    amplitudes: list[float] = []

    def _track_amplitude(track_id: int, hand_point: list[float], active: dict) -> None:
        d = SpatialEngine.distance_to_gondola(hand_point, active)
        st = reach_state.get(track_id)
        if d <= reach + 0.001:
            if st is None:
                reach_state[track_id] = {"entry": hand_point, "peak": hand_point, "peak_d": d}
            elif d < st["peak_d"]:
                st["peak_d"] = d
                st["peak"] = hand_point
        elif st is not None:
            amplitudes.append(math.dist(st["entry"], st["peak"]))
            reach_state.pop(track_id, None)

    while True:
        ok, frame = capture.read()
        if not ok or frame_index > args.max_frames:
            break
        timestamp = frame_index / fps
        dt = 1 / fps
        if frame_index % args.stride == 0:
            _, detections = detector.track(frame)
            for detection in detections:
                floor_point = spatial.project(detection["image_point"])
                if not floor_point:
                    continue
                detection["floor_point"] = floor_point
                active = min(
                    process_config["gondolas"],
                    key=lambda item: SpatialEngine.distance_to_gondola(floor_point, item),
                ) if process_config["gondolas"] else None
                if active is None:
                    continue
                det_ok += 1
                hand_point, pose_verified = (None, False)
                real = detection.get("hand_points_real")
                if real:
                    cands = []
                    for hand in real:
                        if hand[0] <= 0 or hand[1] <= 0:
                            continue
                        p = spatial.project(hand)
                        if p and active:
                            cands.append((SpatialEngine.distance_to_gondola(p, active), p))
                    cands.sort()
                    if cands:
                        hand_point = cands[0][1]
                        pose_verified = True
                if hand_point is None and active:
                    cands = []
                    for hand in detection.get("hand_points", []):
                        p = spatial.project(hand)
                        if p:
                            cands.append((SpatialEngine.distance_to_gondola(p, active), p))
                    cands.sort()
                    if cands:
                        hand_point = cands[0][1]
                if hand_point is not None and active:
                    d = SpatialEngine.distance_to_gondola(hand_point, active)
                    hand_dist_min = min(hand_dist_min, d)
                    if d <= reach + 0.001:
                        hand_dist_close += 1
                    if len(samples) < 4000:
                        samples.append((d, 1.0 if pose_verified else 0.0))
                    _track_amplitude(detection["track_id"], hand_point, active)
                behavior = interactions.observe(detection, timestamp, dt, height, hand_point=hand_point)
                if behavior["state"] == "ENGAGED" or behavior["state"] == "INTERACTION":
                    engaged_frames += 1
                if behavior["interaction"]:
                    interaction_frames += 1
                if behavior["pickup"]:
                    pickup_frames += 1
                    n_eviden += 1
                with_car.add(behavior.get("gondola_id"))
        footer = (frame_index, timestamp)
        frame_index += 1

    print(f"frames procesados: {footer[0] if footer else 0}, detecciones válidas: {det_ok}")
    print(f"góndolas con algún acercamiento: {sorted(filter(None, with_car))}")
    print(f"min distancia mano->góndola: {hand_dist_min:.3f} m")
    print(f"frames con mano dentro reach ({reach} m): {hand_dist_close}")
    print(f"frames ENGAGED: {engaged_frames} | frames interaction: {interaction_frames} | frames pickup: {pickup_frames}")
    print(f"hand dists (first {len(samples)}): <=0.2:{sum(1 for d, _ in samples if d <= 0.2)} "
          f"<=0.5:{sum(1 for d, _ in samples if d <= 0.5)} <=1.0:{sum(1 for d, _ in samples if d <= 1.0)}")
    pose_ok = sum(1 for _, p in samples if p)
    print(f"samples con wrists reales: {pose_ok}/{len(samples)}")
    # Volcar segmentos de alcance que quedaron abiertos al terminar el video.
    for st in reach_state.values():
        amplitudes.append(math.dist(st["entry"], st["peak"]))
    if amplitudes:
        over = sum(1 for a in amplitudes if a >= 0.10)
        amps = sorted(amplitudes)
        print(f"amplitudes mano en reach: n={len(amps)} "
              f"min={amps[0]:.3f} mediana={amps[len(amps)//2]:.3f} max={amps[-1]:.3f} "
              f">=0.10m:{over} ({over/len(amps)*100:.0f}%)")
    else:
        print("amplitudes mano en reach: sin segmentos dentro del alcance")
    print("\n=== RESULTADO ENGINE ===")
    for g in interactions.results():
        print(f"  {g['name']:<18} vis={g['visitors']:<4} int={g['interactions']:<4} pick={g['pickups']} "
              f"ev={len(g['pickup_events'])}, ratio={g['pickup_ratio_percent']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())