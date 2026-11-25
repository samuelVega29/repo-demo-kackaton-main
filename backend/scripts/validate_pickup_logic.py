"""Validación unitaria de la lógica anti-falsos-positivos del pick-up.

No depende de YOLO ni del video: instancia InteractionEngine con la configuración
de la góndola real (g1 del seed) y simula frames sintéticos que reproducen los
escenarios que antes generaban falsos positivos:

Escenario A - mano oscilante durante una misma estancia:
    El cliente está quieto frente a la góndola (engaged) y su mano cruza el
    alcance (0.5m) dentro/fuera repetidamente. Antes esto producía un pick-up por
    cada entrada/salida; ahora debe producir exactamente 1 por estancia.

Comprueba además:
    - pickups <= interactions por góndola.
    - La posición registrada del pick-up cae dentro del AABB de la góndola.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.cv.interaction import InteractionEngine  # noqa: E402

# Gondola g1 del seed: x in [1.2, 4.6], z in [1.35, 2.0]
GONDOLA = {"id": "g1", "name": "Cuidado personal", "x": 1.2, "z": 1.35, "width": 3.4, "depth": 0.65,
           "segments": {"rows": ["Superior", "Media", "Inferior"], "columns": ["Izquierda", "Centro", "Derecha"]},
           "products": [["Shampoo", "Acondicionador", "Tratamientos"], ["Jabón", "Desodorante", "Cuidado oral"], ["Papel", "Pañitos", "Repuestos"]]}

CONFIG = {
    "floor": {"width": 12.0, "depth": 8.0},
    "gondolas": [GONDOLA],
    "thresholds": {
        "approach_m": 1.5,
        "engaged_m": 0.8,
        "engaged_seconds": 2.0,
        "interaction_seconds": 4.0,
        "minimum_track_seconds": 2.0,
        "pickup_reach_m": 0.5,
        "pickup_min_seconds": 0.6,
        "pickup_cooldown_s": None,  # por defecto: 1 pick por estancia
    },
}

# Pie quieto a 0.3m de la gondola -> engaged tras ~2s de frames a velocidad 0.
FOOT = [1.5, 1.3]  # dentro del AABB prolongado +0.3 en x
# Mano DENTRO del alcance: roza el radio (0.45m al borde) y se desliza al centro.
HAND_BOUNDARY = [2.9, 2.45]
HAND_IN = [2.9, 1.67]  # centro de la gondola (distancia 0) -> pico del alcance
# Mano FUERA del alcance: 1.5m al borde de la gondola.
HAND_OUT = [2.9, 3.2]

INTERACT_SECONDS = 4.0
DT = 0.1
FPS = int(1 / DT)
SWEEP_TICKS = 2  # frames que tarda la mano en deslizarse del borde al pico


def make_detection(track_id: int, hand: list[float]) -> dict:
    return {
        "track_id": track_id,
        "floor_point": FOOT,
        "body_center_y": 0.5,
        "hand_pose_verified": True,
    }


def reach_in(frame: int) -> list[float]:
    if frame < SWEEP_TICKS:
        return [2.9, HAND_BOUNDARY[1] - 0.39 * frame]
    return HAND_IN


def main() -> None:
    engine = InteractionEngine(CONFIG)

    # Escenario A: 30 segundos, pie quieto (engaged). La mano permanece DENTRO del alcance
    # 0.9s segundos continuos y sale 0.3s, repetidamente. Antes esto rearmaba el de-dupe
    # en cada salida -> decenas de picks por estancia. Ahora (cooldown None) -> 1 pick.
    ticks = int(30 / DT)
    hand = HAND_IN
    for i in range(ticks):
        period = int(1.2 / DT)  # 0.9 dentro + 0.3 fuera
        in_phase = int(0.9 / DT)
        phase = i % period
        hand = reach_in(phase) if phase < in_phase else HAND_OUT
        timestamp = i * DT
        detection = make_detection(track_id=71, hand=hand)
        engine.observe(detection, timestamp, DT, frame_height=720, hand_point=hand)

    results = engine.results()
    g = results[0]
    pickups = g["pickups"]
    interactions = g["interactions"]

    print("== Escenario A: mano 0.9s dentro / 0.3s fuera, misma estancia (30s) ==")
    print(f"  pickups    = {pickups}")
    print(f"  interactions= {interactions}")
    print(f"  pickup/inter % = {(pickups / interactions * 100) if interactions else 0:.0f}")

    ok = True
    if pickups > interactions:
        print("  FALLO: pickups > interactions")
        ok = False
    if pickups != 1:
        print(f"  FALLO: se esperaba 1 pick por estancia, hay {pickups}")
        ok = False

    # Posición de los picks dentro del AABB de la góndola
    from app.cv.spatial import SpatialEngine  # noqa: E402
    for ev in g["pickup_events"]:
        d = SpatialEngine.distance_to_gondola([ev["x"], ev["z"]], GONDOLA)
        if d > 0.001:
            print(f"  FALLO: pick en ({ev['x']},{ev['z']}) fuera del AABB (dist={d:.3f})")
            ok = False

    print("  RESULTADO:", "OK" if ok else "FAIL")
    print()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()