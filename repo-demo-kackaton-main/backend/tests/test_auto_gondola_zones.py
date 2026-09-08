"""Auto gondola-centered zones (app/cv/pipeline.py).

Sites without configured zones still need a non-empty ``zones`` list so
zone-derived metrics (hot zones, cards, recommendations) keep working.
These tests cover the per-gondola rectangle (inflation, rotation, ids) and the
fast/advanced fallbacks.
"""
from app.cv.pipeline import _auto_fast_zones, _auto_gondola_zones, _fast_process_configuration, _fast_zones
from app.cv.zones import compute_zone_metrics


def gondola(**overrides):
    base = {
        "id": "g1",
        "name": "Góndola 1",
        "x": 2.0,
        "z": 3.0,
        "width": 2.0,
        "depth": 1.0,
    }
    base.update(overrides)
    return base


def test_one_inflated_rect_per_gondola() -> None:
    zones = _auto_gondola_zones([gondola()], margin_x=1.0, margin_z=0.5)
    assert len(zones) == 1
    zone = zones[0]
    assert zone["id"] == "zone-g1"
    assert zone["name"] == "Góndola 1"
    assert zone["source"] == "auto_gondola"
    xs = [point[0] for point in zone["polygon"]]
    zs = [point[1] for point in zone["polygon"]]
    assert round(min(xs), 3) == 1.0
    assert round(max(xs), 3) == 5.0
    assert round(min(zs), 3) == 2.5
    assert round(max(zs), 3) == 4.5


def test_rotated_gondola_matches_local_offset_convention() -> None:
    zones = _auto_gondola_zones([gondola(rotation=90.0)], margin_x=1.0, margin_z=0.5)
    assert zones[0]["polygon"] == [[4.0, 1.5], [4.0, 5.5], [2.0, 5.5], [2.0, 1.5]]


def test_fast_falls_back_to_grid_without_gondolas() -> None:
    zones = _fast_zones([], {"approach_m": 1.5}, 1.0, 1.0, 576, 360)
    assert len(zones) == 9
    assert all(zone["source"] == "auto_grid" for zone in zones)


def test_fast_scales_margins_per_axis() -> None:
    zones = _fast_zones([gondola()], {"approach_m": 1.5}, 2.0, 4.0, 100, 100)
    xs = [point[0] for point in zones[0]["polygon"]]
    zs = [point[1] for point in zones[0]["polygon"]]
    assert round(min(xs), 3) == -1.0
    assert round(max(xs), 3) == 7.0
    assert round(min(zs), 3) == -3.0
    assert round(max(zs), 3) == 10.0


def test_fast_process_scales_interaction_thresholds_to_pixels() -> None:
    config = {
        "version": 1,
        "floor": {"width": 10.0, "depth": 5.0},
        "camera": {"name": "Camara", "calibration_status": "uncalibrated"},
        "gondolas": [gondola(x=1.0, z=1.0, width=2.0, depth=1.0)],
        "thresholds": {
            "approach_m": 1.5,
            "engaged_m": 0.8,
            "interaction_seconds": 4.0,
            "pickup_reach_m": 0.5,
            "pickup_min_seconds": 0.6,
            "max_speed_m_s": 1.2,
        },
    }
    process_config = _fast_process_configuration(config, width=1000, height=500)
    thresholds = process_config["thresholds"]

    assert thresholds["approach_m"] == 150.0
    assert thresholds["engaged_m"] == 80.0
    assert thresholds["pickup_reach_m"] == 50.0
    assert thresholds["max_speed_m_s"] == 120.0
    assert thresholds["interaction_seconds"] == 4.0
    assert thresholds["pickup_min_seconds"] == 0.6


def test_compute_zone_metrics_preserves_auto_source() -> None:
    zone = {
        "id": "zone-g1",
        "name": "Góndola 1",
        "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
        "source": "auto_gondola",
    }
    stats = {"zone-g1": {"track_ids": {1}, "dwell_seconds": 5.0, "interactions": 1}}
    rows = compute_zone_metrics(stats, [zone], duration_seconds=60.0, mode="advanced")
    assert rows[0]["source"] == "auto_gondola"
    assert rows[0]["classification"] != "cold"
    assert rows[0]["heat_index"] > 0
