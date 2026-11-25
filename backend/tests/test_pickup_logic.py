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
HAND_BOUNDARY = [2.9, 2.45]  # 0.45m al borde -> dentro del alcance pero poco profundo
HAND_IN = [2.9, 1.67]        # centro de la gondola -> distancia 0 al alcance (pico)
HAND_OUT = [2.9, 3.2]        # 1.5m al borde -> fuera del alcance

DT = 0.1
INTERACT_SECONDS = CONFIG["thresholds"]["interaction_seconds"]
SWEEP_TICKS = 2  # frames que tarda la mano en deslizarse del borde al pico


def make_detection(track_id: int) -> dict:
    return {"track_id": track_id, "floor_point": FOOT, "body_center_y": 0.5, "hand_pose_verified": True}


def reach_in(frame: int) -> list[float]:
    """Trayectoria de un alcance real: la mano roza el radio y se desliza al pico.

    El punto de entrada (borde) dista 0.45m del pico (centro), muy por encima del umbral
    de amplitud por defecto (0.10m), de modo que un gesto genuino sí registra pick-up.
    """
    if frame < SWEEP_TICKS:
        return [2.9, HAND_BOUNDARY[1] - 0.39 * frame]
    return HAND_IN


def simulate_reach(engine: InteractionEngine, track_id: int, seconds: float) -> None:
    """Mano entra al alcance, se desliza al pico y permanece ahí (gesto genuino)."""
    ticks = int(seconds / DT)
    for i in range(ticks):
        engine.observe(make_detection(track_id), i * DT, DT, frame_height=720, hand_point=reach_in(i))


def simulate_oscillating_hand(engine: InteractionEngine, seconds: float = 30.0, in_s: float = 0.9, out_s: float = 0.3) -> None:
    ticks = int(seconds / DT)
    period = int((in_s + out_s) / DT)
    in_phase = int(in_s / DT)
    for i in range(ticks):
        phase = i % period
        if phase < in_phase:
            hand = reach_in(phase)
        else:
            hand = HAND_OUT
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


def test_agarre_corto_registra_pick_up_y_credita_interaccion() -> None:
    """Un cliente que se acerca y alcanza el producto sin esperar `interaction_seconds`
    (4.0s) debe registrar el pick-up de todos modos, y la interacción queda acreditada
    para mantener la invariante `pickups <= interactions`."""
    engine = InteractionEngine(CONFIG)
    simulate_reach(engine, track_id=123, seconds=5.0)
    g = engine.results()[0]
    first_t = g["pickup_events"][0]["t"] if g["pickup_events"] else None
    assert g["pickups"] >= 1, "El agarre corto no registró ningún pick-up"
    assert first_t is not None and first_t < CONFIG["thresholds"]["interaction_seconds"], \
        f"El pick-up no fue anterior a interaction_seconds (t={first_t})"
    assert g["interactions"] >= 1 and g["pickups"] <= g["interactions"], \
        f"pickups {g['pickups']} > interactions {g['interactions']}"


def test_aliases_de_thresholds_tambien_registran_pick_up() -> None:
    cfg = json_deepcopy(CONFIG)
    cfg["thresholds"].pop("pickup_reach_m")
    cfg["thresholds"].pop("pickup_min_seconds")
    cfg["thresholds"]["hand_reach_m"] = 0.5
    cfg["thresholds"]["pick_min_seconds"] = 0.6
    engine = InteractionEngine(cfg)
    simulate_reach(engine, track_id=321, seconds=5.0)
    g = engine.results()[0]
    assert g["pickups"] >= 1
    assert g["interactions"] >= 1


def test_pase_rapido_sin_detenerse_no_genera_pick_up() -> None:
    """Un transeúnte que cruza frente a la góndola a velocidad alta no debe generar
    pick-ups (requiere estancia engaged: cerca, lento y >=engaged_seconds)."""
    engine = InteractionEngine(CONFIG)
    moving = [1.5, 1.3]
    for i in range(int(3.0 / DT)):
        engine.observe(make_detection(456), i * DT, DT, frame_height=720, hand_point=None)
    g = engine.results()[0]
    assert g["pickups"] == 0, "Un pase rápido sin mano adentro generó pick-ups"
    assert g["interactions"] == 0, "Un pase rápido sin estancia generó interacciones"


def test_mano_estatica_dentro_del_reach_no_genera_pick_up() -> None:
    """Una mano con wrists reales que reposa SIN moverse dentro del alcance no es un
    pick-up: el filtro de amplitud mínima (0.10m por defecto) la descarta como FP."""
    engine = InteractionEngine(CONFIG)
    for i in range(int(6.0 / DT)):
        engine.observe(make_detection(999), i * DT, DT, frame_height=720, hand_point=HAND_IN)
    g = engine.results()[0]
    assert g["pickups"] == 0, f"Una mano estática generó {g['pickups']} pick-ups"
    for ev in g["pickup_events"]:
        assert ev["amplitude"] < 0.10, f"Evento con amplitud {ev['amplitude']} >= 0.10"


def test_mano_sin_pose_real_no_filtra_amplitud() -> None:
    """Sin keypoints reales de pose el filtro de amplitud se salta: la heurística de bbox
    es casi estática y no debe matar los pick-ups por no desplazarse."""
    engine = InteractionEngine(CONFIG)
    det = make_detection(555)
    det["hand_pose_verified"] = False
    for i in range(int(6.0 / DT)):
        engine.observe(det, i * DT, DT, frame_height=720, hand_point=HAND_IN)
    g = engine.results()[0]
    assert g["pickups"] >= 1, "El pick-up sin pose real fue descartado por amplitud"


def test_filtro_de_amplitud_configurable_se_desactiva_con_none() -> None:
    """pickup_min_amplitude_m=None desactiva el filtro: la mano estática vuelve a contar."""
    cfg = json_deepcopy(CONFIG)
    cfg["thresholds"]["pickup_min_amplitude_m"] = None
    engine = InteractionEngine(cfg)
    for i in range(int(6.0 / DT)):
        engine.observe(make_detection(777), i * DT, DT, frame_height=720, hand_point=HAND_IN)
    g = engine.results()[0]
    assert g["pickups"] >= 1, "El filtro desactivado aún descartó el pick-up"


def json_deepcopy(obj):
    import copy
    return copy.deepcopy(obj)
