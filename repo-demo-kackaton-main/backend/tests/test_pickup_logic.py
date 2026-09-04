"""Regresión anti falsos positivos del pick-up.

Recrea los escenarios que antes inflaban pick-ups y verifica la corrección:

A) Mano dentro del alcance 0.9s / fuera 0.3s durante una misma estancia
   (persona quieta y engaged frente a la góndola). Antes producía un pick-up
   por cada re-armado; ahora debe dar EXACTAMENTE 1 por estancia.

Además se verifica:
   - pickups <= interactions por góndola.
   - La posición registrada del pick-up cae dentro del AABB de la góndola.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cv.interaction import InteractionEngine  # noqa: E402
from app.cv.spatial import SpatialEngine  # noqa: E402

# Gondola g1 del seed: x in [1.2, 4.6], z in [1.35, 2.0]
GONDOLA = {
    "id": "g1",
    "name": "Cuidado personal",
    "x": 1.2,
    "z": 1.35,
    "width": 3.4,
    "depth": 0.65,
    "segments": {"rows": ["Superior", "Media", "Inferior"], "columns": ["Izquierda", "Centro", "Derecha"]},
    "products": [["Shampoo", "Acondicionador", "Tratamientos"], ["Jabón", "Desodorante", "Cuidado oral"], ["Papel", "Pañitos", "Repuestos"]],
}

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

# Pie quieto a 0.3m de la gondola -> engaged tras ~2s a velocidad 0.
FOOT = [1.5, 1.3]
HAND_IN = [2.9, 1.67]   # centro de la gondola -> distancia 0 al alcance
HAND_OUT = [2.9, 3.2]   # 1.5m al borde -> fuera del alcance

DT = 0.1
INTERACT_SECONDS = CONFIG["thresholds"]["interaction_seconds"]


def make_detection(track_id: int) -> dict:
    return {"track_id": track_id, "floor_point": FOOT, "body_center_y": 0.5, "hand_pose_verified": True}


def simulate_oscillating_hand(engine: InteractionEngine, seconds: float = 30.0, in_s: float = 0.9, out_s: float = 0.3) -> None:
    ticks = int(seconds / DT)
    period = int((in_s + out_s) / DT)
    in_phase = int(in_s / DT)
    for i in range(ticks):
        hand = HAND_IN if (i % period) < in_phase else HAND_OUT
        engine.observe(
            make_detection(71), i * DT, DT, frame_height=720, hand_point=hand
        )


def test_una_sola_estancia_engaged_da_exactamente_un_pick_up() -> None:
    engine = InteractionEngine(CONFIG)
    simulate_oscillating_hand(engine)
    g = engine.results()[0]
    assert g["pickups"] == 1, f"Se esperaba 1 pick por estancia, hay {g['pickups']}"


def test_pickups_no_exceden_interactions() -> None:
    engine = InteractionEngine(CONFIG)
    simulate_oscillating_hand(engine)
    g = engine.results()[0]
    assert g["pickups"] <= g["interactions"], f"pickups {g['pickups']} > interactions {g['interactions']}"


def test_posicion_del_pick_up_dentro_del_aabb_de_la_gondola() -> None:
    engine = InteractionEngine(CONFIG)
    simulate_oscillating_hand(engine)
    g = engine.results()[0]
    for ev in g["pickup_events"]:
        d = SpatialEngine.distance_to_gondola([ev["x"], ev["z"]], GONDOLA)
        assert d <= 1e-3, f"Pick en ({ev['x']},{ev['z']}) fuera del AABB (dist={d:.4f})"


def test_cooldown_time_based_permite_varios_picks() -> None:
    """Si se configura pickup_cooldown_s>0, un cliente que vuelve a meter la mano
    pasado el cooldown puede registrar más de un pick (comportamiento opcional)."""
    cfg = json_deepcopy(CONFIG)
    cfg["thresholds"]["pickup_cooldown_s"] = 0.2
    engine = InteractionEngine(cfg)
    simulate_oscillating_hand(engine, in_s=0.9, out_s=0.4)
    g = engine.results()[0]
    # Con cooldown de 0.2s y huecos de 0.4s fuera, la misma interacción puede
    # registrar varias subidas de mano -> varios picks (opt-in, no por defecto).
    assert g["pickups"] >= 2, f"Con cooldown se esperaban >=2 picks, hay {g['pickups']}"


def json_deepcopy(obj):
    import copy
    return copy.deepcopy(obj)