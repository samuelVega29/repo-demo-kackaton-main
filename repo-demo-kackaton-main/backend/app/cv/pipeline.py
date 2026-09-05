from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

from ..database import SessionLocal
from ..models import Analysis, Site
from .detector import PersonDetector
from .heatmaps import create_floor_heatmap, overlay_heatmap_on_frame
from .interaction import InteractionEngine
from .spatial import SpatialEngine, with_homographies
from .track_stab import TrackStabilizer
from .video_utils import detect_black_bars


# Keypoint index → estimated height fraction (0=floor, 1=standing height ~1.75m)
# Used when we have pose keypoints to project them into 3D floor space.
KEYPOINT_HEIGHT_FRACTION: dict[int, float] = {
    0: 0.93,   # nose
    1: 0.94,   # left_eye
    2: 0.94,   # right_eye
    3: 0.91,   # left_ear
    4: 0.91,   # right_ear
    5: 0.78,   # left_shoulder
    6: 0.78,   # right_shoulder
    7: 0.62,   # left_elbow
    8: 0.62,   # right_elbow
    9: 0.48,   # left_wrist
    10: 0.48,  # right_wrist
    11: 0.53,  # left_hip
    12: 0.53,  # right_hip
    13: 0.28,  # left_knee
    14: 0.28,  # right_knee
    15: 0.04,  # left_ankle
    16: 0.04,  # right_ankle
}

STANDING_HEIGHT_M = 1.75


def project_keypoints_to_3d(
    keypoints: list[list[float] | None] | None,
    image_point: list[float],
    bbox: list[float],
    spatial: SpatialEngine,
) -> list[list[float] | None] | None:
    """
    Projects 2D pose keypoints into 3D floor space using the floor homography as the base.

    The floor homography (4 visual clicks) maps the feet of the person to the real floor
    plane [x, z, 0]. Each keypoint's *height* is derived from its vertical position inside
    the detection box, and its horizontal [x, z] position is lifted orthogonally from the
    floor along that same ground plane. This is the "raise a column from the floor" model:
    no separate camera-angle model is required, only the homography + the box proportions.

    Returns None if no keypoints available.
    """
    if not keypoints:
        return None

    x1, y1, x2, y2 = bbox
    bbox_height = y2 - y1
    bbox_width = max(1.0, x2 - x1)
    if bbox_height <= 0:
        return None

    cx = (x1 + x2) / 2
    # Feet ground point (bottom-center of box) through the floor homography -> [x, z] at height 0.
    feet_floor = spatial.project([cx, y2]) or spatial.project([image_point[0], image_point[1]])
    if feet_floor is None:
        return None
    feet_x, feet_z = feet_floor

    # Head "shadow" projected onto the floor plane (top-center of box). Because the head is
    # higher, its back-projection lands further along the floor plane; this gives the camera
    # tilt so that raising the body reads diagonally instead of straight up.
    head_floor = spatial.project([cx, y1]) or feet_floor
    head_x, head_z = head_floor

    # Real-world standing height (meters) that the full box represents at this depth.
    standing_m = STANDING_HEIGHT_M

    projected = []
    for idx, kp in enumerate(keypoints):
        if kp is None:
            projected.append(None)
            continue

        kp_x, kp_y = kp[0], kp[1]
        # Fraction of the box height this keypoint sits at, 1=top (head) -> 0=bottom (feet).
        fraction = max(0.0, min(1.0, (y2 - kp_y) / bbox_height))

        # Horizontal placement: blend from feet-horizon to head-horizon so off-axis keypoints
        # (hands to the side) move with body depth, and add lateral offset from box center.
        lateral = (kp_x - cx) / bbox_width  # -1..1 relative to the body width
        x = head_x + (feet_x - head_x) * fraction + lateral * (bbox_width / bbox_height) * 0.35 * standing_m
        z = head_z + (feet_z - head_z) * fraction

        height_m = fraction * standing_m
        projected.append([round(x, 3), round(z, 3), round(height_m, 3)])

    return projected


def project_keypoints_to_3d_v2(
    keypoints: list[list[float] | None] | None,
    image_point: list[float],
    bbox: list[float],
    spatial: SpatialEngine,
) -> list[list[float] | None] | None:
    """
    Projects 2D pose keypoints into 3D floor space from the floor homography.

    The floor homography (set visually with 4 clicks on the video) is always the base. The
    "3D" part only raises each keypoint vertically from that floor plane according to its
    position inside the detection box — a straight column of the standing person. No separate
    camera-angle model is required, so this always works whenever pose keypoints are present.

    Returns None if no keypoints available.
    """
    return project_keypoints_to_3d(keypoints, image_point, bbox, spatial)


def update_analysis(analysis_id: str, **values) -> None:
    with SessionLocal() as database:
        analysis = database.get(Analysis, analysis_id)
        if analysis:
            for key, value in values.items():
                setattr(analysis, key, value)
            database.commit()


def project_hand(spatial: SpatialEngine, detection: dict) -> tuple[list[float] | None, bool]:
    """Projects the estimated hand points to the floor and returns the one closest to a gondola.

    When real wrist keypoints from the pose model are available they are preferred over the
    geometric estimate. The second element of the tuple reports whether the point comes from
    real pose keypoints (True) or the lateral bounding-box heuristic (False). Returns
    (point | None, pose_verified).
    """
    car = detection.get("floor_point")
    if not car or not spatial.configuration.get("gondolas"):
        return None, False
    active = min(
        spatial.configuration["gondolas"],
        key=lambda item: SpatialEngine.distance_to_gondola(car, item),
    )
    real_hands = detection.get("hand_points_real")
    if real_hands:
        real_candidates = []
        for hand in real_hands:
            if hand[0] <= 0 or hand[1] <= 0:
                continue
            projected = spatial.project(hand)
            if projected:
                real_candidates.append((SpatialEngine.distance_to_gondola(projected, active), projected))
        real_candidates.sort(key=lambda item: item[0])
        if real_candidates:
            return real_candidates[0][1], True
    candidates = []
    for hand in detection.get("hand_points", []):
        projected = spatial.project(hand)
        if projected:
            candidates.append((SpatialEngine.distance_to_gondola(projected, active), projected))
    candidates.sort(key=lambda item: item[0])
    return (candidates[0][1] if candidates else None), False


def build_findings(gondolas: list[dict], zones: list[dict], interactions: int, pickups: int = 0) -> list[dict]:
    findings = []
    active = max(gondolas, key=lambda item: item["dwell_seconds"], default=None)
    if active and active["dwell_seconds"] > 0:
        findings.append({"type": "evidence", "title": f"Mayor permanencia en {active['name']}", "detail": f"{active['dwell_seconds']:.1f} segundos acumulados de presencia detectada."})
    zone = max(zones, key=lambda item: item["dwell_seconds"], default=None)
    if zone and zone["dwell_seconds"] > 0:
        findings.append({"type": "evidence", "title": f"Zona dominante: {zone['name']}", "detail": f"Concentra {zone['dwell_seconds']:.1f} segundos de ocupación rastreada."})
    if pickups == 0:
        findings.append({"type": "quality", "title": "Sin pick-ups inferidos", "detail": "Ninguna mano estimada se acercó a las góndolas durante los engagement detectados. Solo presencia y posible revisión, sin extensión de brazo hacia el producto."})
    elif active:
        findings.append({"type": "recommendation", "title": f"{pickups} pick-ups probables detectados", "detail": f"Prevalecen en {active['name']}; revisar disposición, señalética y stock de los productos con más aproximaciones de mano."})
    if interactions == 0:
        findings.append({"type": "quality", "title": "Sin interacción inferible", "detail": "Ninguna trayectoria cumplió simultáneamente los umbrales configurados de proximidad, velocidad y tiempo."})
    elif active:
        findings.append({"type": "recommendation", "title": "Validar exhibición de mayor engagement", "detail": f"Revisar productos y reposición en {active['name']}; la recomendación se basa en permanencia e interacciones inferidas."})
    return findings


def run_analysis(analysis_id: str) -> None:
    capture = None
    try:
        with SessionLocal() as database:
            analysis = database.get(Analysis, analysis_id)
            site = database.get(Site, analysis.site_id) if analysis else None
            if not analysis or not site:
                raise ValueError("El análisis o la sede ya no existen")
            video_path = Path(analysis.video_path)
            configuration = site.configuration

        update_analysis(analysis_id, status="processing", stage="metadata", progress=2, message="Leyendo metadatos del video")
        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            raise ValueError("OpenCV no pudo abrir el MP4")
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if fps <= 0 or total_frames <= 0 or width <= 0 or height <= 0:
            raise ValueError("El video no contiene FPS, duración o resolución válidos")

        update_analysis(analysis_id, stage="model", progress=5, message="Cargando YOLO y ByteTrack")
        # Try pose model first; fall back to detection-only if unavailable
        try:
            detector = PersonDetector(detection_only=False)
            has_pose = True
        except Exception:
            detector = PersonDetector(detection_only=True)
            has_pose = False

        # Detect black bars only to remember where the "real" content is, so detections that
        # land inside the black bars (where there is no real person) can be ignored. We do NOT
        # crop the frame or adjust the calibration: the user calibrates over the video exactly
        # as it is shown, so cropping would misalign every overlay.
        capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ret, first_frame = capture.read()
        if ret:
            bars_info = detect_black_bars(first_frame)
            if bars_info["has_bars"]:
                update_analysis(
                    analysis_id,
                    stage="preprocessing",
                    progress=7,
                    message=f"Márgenes negros detectados: {bars_info['top']}/{bars_info['bottom']}/{bars_info['left']}/{bars_info['right']}px - se ignorarán las detecciones en los márgenes"
                )
                configuration = {
                    **configuration,
                    "camera": {**configuration["camera"], "crop_info": bars_info},
                }
            capture.set(cv2.CAP_PROP_POS_FRAMES, 0)

        spatial = SpatialEngine(configuration, width, height)
        interactions = InteractionEngine(configuration)
        # Stabilizer merges fragmented ByteTrack ids into stable people identities.
        track_stabilizer = TrackStabilizer()
        result_dir = Path(__file__).resolve().parents[2] / "data" / "results" / analysis_id
        result_dir.mkdir(parents=True, exist_ok=True)

        trajectories: dict[int, list[list[float]]] = defaultdict(list)
        track_frames: dict[int, int] = defaultdict(int)
        zone_dwell: dict[str, float] = defaultdict(float)
        traffic_points: list[dict] = []
        dwell_points: list[dict] = []
        interaction_points: list[dict] = []
        pickup_points: list[dict] = []
        interaction_events: list[dict] = []
        pickup_events: list[dict] = []
        last_interaction: dict[int, bool] = defaultdict(bool)
        gondola_names = {item["id"]: item.get("name", item["id"]) for item in configuration.get("gondolas", [])}
        frame_samples: list[dict] = []
        evidence: list[str] = []
        evidence_frames: list = []
        evidence_targets = {round(index * max(0, total_frames - 1) / 5) for index in range(6)}
        payload_every = max(1, round(fps / 5))
        total_detections = 0
        peak_presence = 0

        slice_count = max(1, min(8, round(total_frames / max(1, round(fps * 5)))))
        slice_size = total_frames / slice_count
        slice_buckets = {
            "traffic": [[] for _ in range(slice_count)],
            "dwell": [[] for _ in range(slice_count)],
            "interaction": [[] for _ in range(slice_count)],
            "pickup": [[] for _ in range(slice_count)],
        }

        # Black-bar exclusion zone (pixels where there is no real content). Detections whose
        # bottom-center lands inside these bars are ignored - they are spurious/stretched.
        crop_info = configuration["camera"].get("crop_info")
        bar_left = crop_info["left"] if crop_info and crop_info["has_bars"] else 0
        bar_right = (width - crop_info["right"]) if crop_info and crop_info["has_bars"] else width
        bar_top = crop_info["top"] if crop_info and crop_info["has_bars"] else 0
        bar_bottom = (height - crop_info["bottom"]) if crop_info and crop_info["has_bars"] else height

        frame_index = 0
        while True:
            ok, frame = capture.read()
            if not ok:
                break

            prediction, detections = detector.track(frame)
            timestamp = frame_index / fps
            dt = 1 / fps
            active_this_frame = set()
            sample_detections = []
            # First pass: project floor points for every valid detection, skipping any whose
            # feet fall inside the black bars (those have no real content).
            valid_detections = []
            for detection in detections:
                feet_x, feet_y = detection["image_point"]
                if not (bar_left < feet_x < bar_right and bar_top < feet_y < bar_bottom):
                    continue
                floor_point = spatial.project(detection["image_point"])
                if not floor_point:
                    continue
                detection["floor_point"] = floor_point
                valid_detections.append(detection)
            # Second pass: unify fragmented ByteTrack ids into stable people identities
            # and rewrite track_id so all downstream state is keyed by the stable person.
            track_stabilizer.update(valid_detections, timestamp, frame_index, frame)
            for detection in valid_detections:
                detection["track_id"] = detection["person_id"]
            for detection in valid_detections:
                hand_point, pose_verified = project_hand(spatial, detection)
                detection["hand_pose_verified"] = pose_verified
                behavior = interactions.observe(detection, timestamp, dt, height, hand_point=hand_point)
                total_detections += 1
                active_this_frame.add(detection["track_id"])
                track_frames[detection["track_id"]] += 1
                zone = spatial.zone_at(detection["floor_point"])
                if zone:
                    zone_dwell[zone["id"]] += dt
                if frame_index % payload_every == 0:
                    timestamped = {**{"x": detection["floor_point"][0], "z": detection["floor_point"][1]}}
                    trajectories[detection["track_id"]].append(detection["floor_point"])
                    traffic_points.append({**timestamped, "weight": 1})
                    dwell_points.append({**timestamped, "weight": max(dt, 0.01) * (1.5 if behavior["speed"] < 0.6 else 0.5)})
                    slice_index = min(slice_count - 1, int(frame_index / slice_size))
                    slice_buckets["traffic"][slice_index].append({**timestamped, "weight": 1})
                    slice_buckets["dwell"][slice_index].append({**timestamped, "weight": max(dt, 0.01) * (1.5 if behavior["speed"] < 0.6 else 0.5)})
                    sample_detections.append({
                        "track_id": detection["track_id"], "bbox": detection["bbox"],
                        "confidence": detection["confidence"], "floor_point": detection["floor_point"],
                        "state": behavior["state"], "gondola_id": behavior["gondola_id"],
                        "keypoints_3d": project_keypoints_to_3d_v2(
                            detection.get("keypoints"), detection["image_point"],
                            detection["bbox"], spatial,
                        ) if has_pose else None,
                    })
                if behavior["interaction"]:
                    interaction_points.append({"x": detection["floor_point"][0], "z": detection["floor_point"][1], "weight": 1, "t": round(timestamp, 2)})
                    if not last_interaction[detection["track_id"]]:
                        interaction_events.append({
                            "t": round(timestamp, 2),
                            "track_id": detection["track_id"],
                            "x": detection["floor_point"][0],
                            "z": detection["floor_point"][1],
                            "gondola_id": behavior["gondola_id"],
                            "gondola_name": gondola_names.get(behavior["gondola_id"], behavior["gondola_id"]),
                        })
                    last_interaction[detection["track_id"]] = True
                    slice_buckets["interaction"][min(slice_count - 1, int(frame_index / slice_size))].append({"x": detection["floor_point"][0], "z": detection["floor_point"][1], "weight": 1})
                else:
                    last_interaction[detection["track_id"]] = False
                if behavior["pickup"] and hand_point is not None:
                    pickup_points.append({"x": hand_point[0], "z": hand_point[1], "weight": 1, "t": round(timestamp, 2)})
                    slice_buckets["pickup"][min(slice_count - 1, int(frame_index / slice_size))].append({"x": hand_point[0], "z": hand_point[1], "weight": 1})
                    pickup_events.append({
                        "t": round(timestamp, 2),
                        "track_id": detection["track_id"],
                        "x": hand_point[0],
                        "z": hand_point[1],
                        "gondola_id": behavior["gondola_id"],
                        "gondola_name": gondola_names.get(behavior["gondola_id"], behavior["gondola_id"]),
                        "pose_verified": bool(pose_verified),
                    })

            peak_presence = max(peak_presence, len(active_this_frame))
            if sample_detections:
                frame_samples.append({"frame": frame_index, "timestamp": round(timestamp, 2), "detections": sample_detections})
            if frame_index in evidence_targets:
                name = f"frame_{len(evidence) + 1}.jpg"
                cv2.imwrite(str(result_dir / name), prediction.plot())
                evidence.append(name)
                evidence_frames.append(frame.copy())
            if frame_index % max(1, round(fps)) == 0:
                progress = min(88, 8 + int((frame_index + 1) / total_frames * 80))
                update_analysis(analysis_id, stage="tracking", progress=progress, message=f"YOLO + ByteTrack · frame {frame_index + 1}/{total_frames}")
            frame_index += 1

        update_analysis(analysis_id, stage="heatmaps", progress=92, message="Generando mapas espaciales")
        create_floor_heatmap(traffic_points, configuration["floor"], result_dir / "traffic.png")
        create_floor_heatmap(dwell_points, configuration["floor"], result_dir / "dwell.png")
        create_floor_heatmap(interaction_points, configuration["floor"], result_dir / "interaction.png")
        create_floor_heatmap(pickup_points, configuration["floor"], result_dir / "pickup.png")

        homography_inv = spatial.homography_norm_inv.round(6).tolist()
        overlay_names: dict[str, list[str]] = {}
        for index, raw_frame in enumerate(evidence_frames, start=1):
            for mode, point_source in (
                ("traffic", traffic_points),
                ("dwell", dwell_points),
                ("interaction", interaction_points),
                ("pickup", pickup_points),
            ):
                if mode in ("interaction", "pickup") and not point_source:
                    continue
                blended = overlay_heatmap_on_frame(point_source, configuration["floor"], homography_inv, raw_frame)
                filename = f"overlay_{mode}_{index}.jpg"
                cv2.imwrite(str(result_dir / filename), blended)
                overlay_names.setdefault(mode, []).append(filename)

        slices_meta: list[dict] = []
        for index in range(slice_count):
            start = round(index * slice_size / fps, 1)
            end = round(min((index + 1) * slice_size, total_frames) / fps, 1)
            entry = {"index": index, "start": start, "end": end}
            for mode in ("traffic", "dwell", "interaction", "pickup"):
                filename = f"time_{index}_{mode}.png"
                create_floor_heatmap(slice_buckets[mode][index], configuration["floor"], result_dir / filename)
                entry[mode] = filename if slice_buckets[mode][index] else None
            slices_meta.append(entry)

        gondolas = interactions.results()

        # Add height and tier_heights to gondola results from configuration
        gondola_config = {item["id"]: item for item in configuration.get("gondolas", [])}
        for gondola in gondolas:
            config = gondola_config.get(gondola["id"], {})
            gondola["height"] = config.get("height", 1.45)
            gondola["tier_heights"] = config.get("tier_heights", [0.25, 0.73, 1.20])
        zones = [
            {**zone, "dwell_seconds": round(zone_dwell[zone["id"]], 2)}
            for zone in configuration.get("zones", [])
        ]
        minimum_track_frames = max(2, round(fps * configuration.get("thresholds", {}).get("minimum_track_seconds", 2.0)))
        valid_track_ids = {track_id for track_id, count in track_frames.items() if count >= minimum_track_frames}
        trajectory_payload = [
            {"track_id": track_id, "points": points}
            for track_id, points in trajectories.items()
            if track_id in valid_track_ids and len(points) > 1
        ]
        interaction_count = sum(item["interactions"] for item in gondolas)

        duration_seconds = total_frames / fps
        histogram = None
        if interaction_events:
            bucket_s = max(10, round(duration_seconds / 12))
            bucket_count = max(1, math.ceil(duration_seconds / bucket_s))
            counts = [0] * bucket_count
            for event in interaction_events:
                counts[min(bucket_count - 1, int(event["t"] // bucket_s))] += 1
            histogram = {
                "bucket_seconds": bucket_s,
                "buckets": [
                    {"index": index, "start": index * bucket_s, "end": min((index + 1) * bucket_s, duration_seconds), "count": count}
                    for index, count in enumerate(counts)
                ],
            }
        interaction_events.sort(key=lambda event: event["t"])
        interaction_events_log = interaction_events[:400]

        pickup_count = sum(item["pickups"] for item in gondolas)
        pickup_histogram = None
        if pickup_events:
            bucket_s = max(10, round(duration_seconds / 12))
            bucket_count = max(1, math.ceil(duration_seconds / bucket_s))
            counts = [0] * bucket_count
            for event in pickup_events:
                counts[min(bucket_count - 1, int(event["t"] // bucket_s))] += 1
            pickup_histogram = {
                "bucket_seconds": bucket_s,
                "buckets": [
                    {"index": index, "start": index * bucket_s, "end": min((index + 1) * bucket_s, duration_seconds), "count": count}
                    for index, count in enumerate(counts)
                ],
            }
        pickup_events.sort(key=lambda event: event["t"])
        pickup_events_log = pickup_events[:400]

        sample_dt = payload_every / fps
        track_speeds = []
        for points in trajectories.values():
            if len(points) < 2:
                continue
            speeds = [math.dist(points[i], points[i - 1]) / sample_dt for i in range(1, len(points)) if points[i] != points[i - 1]]
            if speeds:
                track_speeds.append(sum(speeds) / len(speeds))
        average_speed = round(sum(track_speeds) / len(track_speeds), 2) if track_speeds else 0.0
        duration_minutes = max(0.01, (total_frames / fps) / 60.0)

        result = {
            "site": {"id": site.id, "name": site.name, "city": site.city, "configuration": with_homographies(configuration)},
            "video": {"fps": round(fps, 2), "duration_seconds": round(total_frames / fps, 2), "width": width, "height": height, "total_frames": total_frames, "processed_frames": frame_index},
            "model": {"detector": "YOLO11n COCO person", "pose": "yolov8n-pose" if has_pose else None, "tracker": "ByteTrack", "privacy": "temporary_ids_only", "custom_behavior_model": False, "has_pose": has_pose},
            "metrics": {
                "people_detected": len(valid_track_ids),
                "tracked_presences": len(valid_track_ids),
                "track_fragments": len(track_frames),
                "minimum_track_seconds": round(minimum_track_frames / fps, 2),
                "detections": total_detections,
                "trajectories": len(trajectory_payload),
                "interaction_events": interaction_count,
                "pickup_events": pickup_count,
                "average_speed_m_s": average_speed,
                "flow_per_minute": round(len(valid_track_ids) / duration_minutes, 1),
                "peak_presence": peak_presence,
                "time_slices": slice_count,
            },
            "trajectories": trajectory_payload,
            "frame_detections": frame_samples,
            "interaction_events_log": interaction_events_log,
            "interaction_histogram": histogram,
            "pickup_events_log": pickup_events_log,
            "pickup_histogram": pickup_histogram,
            "gondolas": gondolas,
            "zones": zones,
            "heatmaps": {
                "traffic": "traffic.png", "dwell": "dwell.png", "interaction": "interaction.png" if interaction_points else None,
                "pickup": "pickup.png" if pickup_points else None,
                "overlays": overlay_names,
                "slices": slices_meta,
            },
            "annotated_frames": evidence,
            "findings": build_findings(gondolas, zones, interaction_count, pickup_count),
            "quality": {"calibration": configuration["camera"].get("calibration_status", "unknown"), "vertical_analysis": "pose_refined_when_available", "interaction": "inferred_from_proximity_speed_and_time" if interaction_points else "insufficient_evidence", "pickup": "hand_reach_with_pose_keypoints_when_available"},
        }
        update_analysis(analysis_id, status="completed", stage="results", progress=100, message="Análisis espacial completado", result=result, duration_seconds=result["video"]["duration_seconds"])
    except Exception as exc:
        update_analysis(analysis_id, status="failed", stage="failed", progress=100, message=str(exc)[:300])
    finally:
        if capture is not None:
            capture.release()
