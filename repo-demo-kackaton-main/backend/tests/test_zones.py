"""Hot/cold zone derivation (app/cv/zones.py).

Covers the 10 required scenarios: empty zones, relative heat-index ordering,
0..1 range, no-interaction analyses, no artificial hot/cold when activity is
uniform, fast auto-grid (9 zones), advanced configured zones, per-analysis
variability, determinism, and NaN/division-by-zero safety.
"""
import math

import pytest

from app.cv.zones import (
    HEAT_PRECISION,
    compute_zone_metrics,
)


def make_stats(specs: list[tuple[int, float, int]]) -> dict:
    """specs = [(visits, dwell_seconds, interactions), ...] -> zone_stats."""
    stats = {}
    for index, (visits, dwell, interactions) in enumerate(specs):
        zone_id = f"z{index}"
        stats[zone_id] = {
            "track_ids": set(range(visits)),
            "dwell_seconds": dwell,
            "interactions": interactions,
        }
    return stats


DEFAULT_POLYGON = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]


def make_config(count: int, polygons: list[list[list[float]]] | None = None) -> list[dict]:
    source = polygons if polygons else [DEFAULT_POLYGON]
    return [
        {
            "id": f"z{index}",
            "name": f"Zona {index}",
            "polygon": source[index % len(source)],
        }
        for index in range(count)
    ]


def run(specs, config, mode="fast", duration_seconds=60.0):
    return compute_zone_metrics(make_stats(specs), config, duration_seconds=duration_seconds, mode=mode)


# ---------------------------------------------------------------------------
# 1. Zone without activity is cold
# ---------------------------------------------------------------------------
def test_empty_zone_is_cold() -> None:
    zones = run([(0, 0.0, 0)], make_config(1))
    assert zones[0]["classification"] == "cold"
    assert zones[0]["heat_index"] == 0.0
    assert zones[0]["visits"] == 0
    assert zones[0]["dwell_seconds"] == 0.0
    assert zones[0]["avg_dwell_seconds"] == 0.0


# ---------------------------------------------------------------------------
# 2. Busier zone has the higher heat index
# ---------------------------------------------------------------------------
def test_busier_zone_has_higher_heat_index() -> None:
    zones = run([(20, 60.0, 4), (5, 10.0, 0)], make_config(2))
    assert zones[0]["heat_index"] > zones[1]["heat_index"]
    assert zones[0]["heat_index"] > 0


# ---------------------------------------------------------------------------
# 3. Heat index is always in [0, 1]
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("specs", [
    [(0, 0.0, 0), (0, 0.0, 0)],
    [(13, 40.0, 2), (7, 22.0, 1), (1, 2.0, 0)],
    [(50, 100.0, 10), (2, 3.0, 0), (2, 3.0, 0), (2, 3.0, 0)],
    [(3, 9.0, 0), (3, 9.0, 0), (3, 9.0, 0)],
])
def test_heat_index_always_in_0_1(specs) -> None:
    zones = run(specs, make_config(len(specs)))
    for zone in zones:
        assert 0.0 <= zone["heat_index"] <= 1.0
        assert math.isfinite(zone["heat_index"])


# ---------------------------------------------------------------------------
# 4. Analysis without interactions keeps working (fast mode invents none)
# ---------------------------------------------------------------------------
def test_no_interactions_analysis_works() -> None:
    zones = run([(12, 36.0, 0), (5, 10.0, 0), (0, 0.0, 0)], make_config(3))
    assert all(zone["interactions"] == 0 for zone in zones)
    labels = {zone["classification"] for zone in zones}
    assert labels == {"hot", "cold"}
    assert zones[0]["heat_index"] > 0
    # 2 active zones with a real gap -> one hot, one cold (not invented by interactions).
    assert zones[0]["classification"] == "hot"
    assert zones[1]["classification"] == "cold"


# ---------------------------------------------------------------------------
# 5. Uniform activity -> no artificial hot/cold
# ---------------------------------------------------------------------------
def test_uniform_activity_has_no_false_hot_cold() -> None:
    zones = run([(5, 10.0, 2)] * 6 + [(0, 0.0, 0)] * 3, make_config(9))
    labels = {zone["classification"] for zone in zones}
    assert "hot" not in labels
    assert "cold" in labels  # the 3 empties stay cold
    heat = {zone["heat_index"] for zone in zones if zone["classification"] != "cold"}
    assert len(heat) == 1  # every active zone carries the exact same index
    for zone in zones:
        if zone["visits"] > 0:
            assert zone["classification"] == "normal"


def test_single_active_zone_is_hot() -> None:
    zones = run([(10, 30.0, 0), (0, 0.0, 0), (0, 0.0, 0)], make_config(3))
    assert zones[0]["classification"] == "hot"
    assert zones[1]["classification"] == "cold"
    assert zones[2]["classification"] == "cold"


def test_two_active_practically_equal_are_both_normal() -> None:
    # 6.6% relative gap in avg dwell only: heat 0.4 + 0.4*~0.937 < 0.775 diff -> gap <= 0.05
    zones = run([(20, 60.0, 0), (20, 62.0, 0)], make_config(2))
    assert zones[0]["classification"] == "normal"
    assert zones[1]["classification"] == "normal"
    assert zones[0]["heat_index"] - zones[1]["heat_index"] <= 0.05 * 2


def test_two_active_with_big_gap_split_hot_cold() -> None:
    zones = run([(30, 90.0, 5), (2, 2.0, 0)], make_config(2))
    assert zones[0]["classification"] == "hot"
    assert zones[1]["classification"] == "cold"


# ---------------------------------------------------------------------------
# 6. Fast mode -> 9 automatic normalized zones
# ---------------------------------------------------------------------------
def test_fast_returns_nine_auto_grid_zones() -> None:
    specs = [(2, 3.5, 0)] * 2 + [(0, 0.0, 0)] * 7
    zones = run(specs, make_config(9), mode="fast")
    assert len(zones) == 9
    assert all(zone["source"] == "auto_grid" for zone in zones)
    for zone in zones:
        for px, pz in zone["polygon"]:
            assert 0.0 <= px <= 1.0 and 0.0 <= pz <= 1.0
        assert "zone_id" in zone and "density" in zone and "classification" in zone


# ---------------------------------------------------------------------------
# 7. Advanced mode -> configured zones preserved (physical coordinates)
# ---------------------------------------------------------------------------
def test_advanced_preserves_configured_zones() -> None:
    polygon = [[0.0, 6.8], [12.0, 6.8], [12.0, 8.0], [0.0, 8.0]]
    config = [{"id": "entrance", "name": "Acceso", "polygon": polygon}]
    stats = {"entrance": {"track_ids": {1, 2, 3, 4}, "dwell_seconds": 6.0, "interactions": 1}}
    zones = compute_zone_metrics(stats, config, duration_seconds=60.0, mode="advanced")
    assert zones[0]["zone_id"] == "entrance"
    assert zones[0]["name"] == "Acceso"
    assert zones[0]["polygon"] == polygon
    assert zones[0]["source"] == "configured"
    assert zones[0]["classification"] == "hot"


# ---------------------------------------------------------------------------
# 8. Two videos with different activity -> different hot/cold distribution
# ---------------------------------------------------------------------------
def test_different_activity_distributions_differ() -> None:
    dominant = [(50, 100.0, 10)] + [(2, 3.0, 0)] * 8
    uniform = [(5, 10.0, 2)] * 9
    zones_dominant = run(dominant, make_config(9))
    zones_uniform = run(uniform, make_config(9))
    assert any(zone["classification"] == "hot" for zone in zones_dominant)
    assert not any(zone["classification"] == "hot" for zone in zones_uniform)
    dominant_labels = {zone["classification"] for zone in zones_dominant}
    uniform_labels = {zone["classification"] for zone in zones_uniform}
    assert dominant_labels != uniform_labels


# ---------------------------------------------------------------------------
# 9. Deterministic classification: same data -> same result
# ---------------------------------------------------------------------------
def test_classification_is_deterministic() -> None:
    specs = [(30, 70.0, 4), (12, 30.0, 1), (7, 12.0, 0), (0, 0.0, 0), (0, 0.0, 0)]
    first = run(specs, make_config(5))
    second = run(specs, make_config(5))
    assert first == second
    assert [zone["classification"] for zone in first] == [zone["classification"] for zone in second]


# ---------------------------------------------------------------------------
# 10. No NaN / no division by zero
# ---------------------------------------------------------------------------
def test_no_nan_or_division_by_zero() -> None:
    zones = run([(0, 0.0, 0)] * 4, make_config(4), duration_seconds=0.0)
    for zone in zones:
        for key in ("density", "dwell_seconds", "avg_dwell_seconds", "heat_index"):
            assert math.isfinite(zone[key]), f"{key} is not finite: {zone[key]}"
        assert zone["classification"] == "cold"
        assert zone["heat_index"] == 0.0
    # Visits present, everything else zero, zero-duration analysis.
    only_visits = run([(3, 0.0, 0), (0, 0.0, 0)], make_config(2), duration_seconds=0.0)
    assert math.isfinite(only_visits[0]["density"])
    assert only_visits[0]["heat_index"] > 0
    assert only_visits[0]["classification"] == "hot"


def test_heat_precision_is_exposed_rounded() -> None:
    zones = run([(20, 60.0, 4), (5, 10.0, 0)], make_config(2))
    for zone in zones:
        decimals = str(zone["heat_index"]).split(".")
        if len(decimals) == 2:
            assert len(decimals[1]) <= HEAT_PRECISION
