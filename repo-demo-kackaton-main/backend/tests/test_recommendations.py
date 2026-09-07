"""Traceable recommendations (app/cv/recommendations.py).

Verifies the recommendation contract: deterministic, relative, derived only
from the analysis' own zones/gondolas/logs, with a ``trace`` that cites the
exact metrics that produced each rule. Also checks the /recommendations
endpoint prefers the stored traced list and falls back to findings.
"""
import pytest

from app.cv.recommendations import (
    SEVERITY_HIGH_MIN_HEAT,
    SEVERITY_MEDIUM_MIN_HEAT,
    build_recommendations,
)
from conftest import make_analysis


def zoned(id_, visits, dwell, avg_dwell, classification, heat, interactions=0, name=None):
    return {
        "zone_id": id_, "id": id_, "name": name or id_, "polygon": [],
        "visits": visits, "density": 1.0, "dwell_seconds": dwell,
        "avg_dwell_seconds": avg_dwell, "interactions": interactions,
        "heat_index": heat, "classification": classification, "source": "auto_grid",
    }


def gondola(id_, name, interactions, pickups, dwell=0.0, traffic=0):
    return {
        "id": id_, "name": name, "interactions": interactions, "pickups": pickups,
        "dwell_seconds": dwell, "traffic": traffic,
    }


def fast_zones_with_hot(hot_heat=0.5):
    """9 auto-grid zones; auto-6 hot, auto-2/3 normal, rest untouched cold."""
    zones = [zoned(f"auto-{i}", 0, 0.0, 0.0, "cold", 0.0) for i in range(9)]
    zones[2] = zoned("auto-2", 3, 3.48, 1.16, "normal", 0.416)
    zones[3] = zoned("auto-3", 4, 2.96, 0.74, "normal", 0.474)
    zones[6] = zoned("auto-6", 1, 4.0, 4.0, "hot", hot_heat)
    return zones


def test_recommendations_are_deterministic() -> None:
    zones = fast_zones_with_hot()
    gondolas = [gondola("g1", "Despensa", 3, 2, dwell=12.0, traffic=5)]
    logs = [{"t": 1.0, "track_id": 9, "gondola_id": "g1", "gondola_name": "Despensa"}]
    first = build_recommendations(zones, gondolas, "advanced", logs, logs)
    second = build_recommendations(zones, gondolas, "advanced", logs, logs)
    assert first == second


def test_fast_mode_only_zone_rules() -> None:
    zones = fast_zones_with_hot(hot_heat=0.5)
    recs = build_recommendations(zones, [], "fast")
    rules = {item["rule"] for item in recs}
    assert rules == {"zone_high_dwell", "zone_low_traffic"}
    assert all("gondola" not in item["rule"] for item in recs)
    severities = [item["severity"] for item in recs]
    assert severities == ["medium", "low"]  # sorted high -> low


def test_hot_zone_high_heat_is_high_severity() -> None:
    zones = fast_zones_with_hot(hot_heat=0.911)
    recs = build_recommendations(zones, [], "fast")
    high_dwell = next(item for item in recs if item["rule"] == "zone_high_dwell")
    assert high_dwell["severity"] == "high"
    assert high_dwell["trace"]["zone_id"] == "auto-6"
    assert high_dwell["trace"]["heat_index"] == 0.911
    assert high_dwell["trace"]["classification"] == "hot"
    assert high_dwell["trace"]["thresholds"]["severity_high_min_heat"] == SEVERITY_HIGH_MIN_HEAT


def test_zone_low_traffic_first_untouched_zone() -> None:
    zones = fast_zones_with_hot()
    recs = build_recommendations(zones, [], "fast")
    low_traffic = next(item for item in recs if item["rule"] == "zone_low_traffic")
    assert low_traffic["severity"] == "low"
    assert low_traffic["trace"]["zone_id"] == "auto-0"  # first cold empty in config order
    assert low_traffic["trace"]["visits"] == 0
    assert low_traffic["trace"]["dwell_seconds"] == 0
    assert low_traffic["trace"]["thresholds"] == {"visits": 0, "dwell_seconds": 0}


def test_advanced_gondola_stock_check_with_pickups() -> None:
    zones = list(fast_zones_with_hot())
    zones[0] = zoned("entrance", 7, 24.9, 3.56, "hot", 0.7, interactions=2, name="Acceso")
    gondolas = [
        gondola("g1", "Despensa", 3, 2, dwell=12.0, traffic=5),
        gondola("g2", "Lácteos", 1, 0, dwell=4.0, traffic=2),
    ]
    pickups = [
        {"t": 1.0, "track_id": 9, "gondola_id": "g1", "gondola_name": "Despensa"},
        {"t": 2.5, "track_id": 9, "gondola_id": "g1", "gondola_name": "Despensa"},
        {"t": 4.0, "track_id": 10, "gondola_id": "g2", "gondola_name": "Lácteos"},
    ]
    recs = build_recommendations(zones, gondolas, "advanced", pickup_events_log=pickups)
    stock = [item for item in recs if item["rule"] == "gondola_stock_check"]
    assert len(stock) == 1
    item = stock[0]
    assert item["severity"] == "high"
    assert item["trace"]["gondola_id"] == "g1"
    assert item["trace"]["pickups"] == 2
    assert item["trace"]["interactions"] == 3
    assert item["trace"]["evidence_source"] == "pickup_events_log"
    assert [ref["track_id"] for ref in item["trace"]["evidence_refs"]] == [9, 9]  # only g1, capped at 3
    assert item["trace"]["max_pickups_across_gondolas"] == 2


def test_advanced_gondola_display_check_without_pickups() -> None:
    zones = list(fast_zones_with_hot(hot_heat=0.0 - 0.0))
    zones[0] = zoned("entrance", 3, 6.0, 2.0, "normal", 0.5, interactions=0, name="Acceso")
    gondolas = [gondola("g1", "Despensa", 5, 0, dwell=12.0, traffic=5)]
    interactions = [{"t": 1.0, "track_id": 9, "gondola_id": "g1", "gondola_name": "Despensa"}]
    recs = build_recommendations(zones, gondolas, "advanced", interaction_events_log=interactions)
    display = [item for item in recs if item["rule"] == "gondola_display_check"]
    assert len(display) == 1
    assert display[0]["severity"] == "medium"
    assert display[0]["trace"]["gondola_id"] == "g1"
    assert display[0]["trace"]["evidence_source"] == "interaction_events_log"


def test_no_activity_no_recommendations() -> None:
    zones = [zoned("a", 0, 0.0, 0.0, "cold", 0.0), zoned("b", 0, 0.0, 0.0, "cold", 0.0)]
    assert build_recommendations(zones, [], "fast") == []
    assert build_recommendations(zones, [], "advanced") == []


def test_uniform_activity_no_false_congestion() -> None:
    zones = [zoned(f"auto-{i}", 5, 10.0, 2.0, "normal", 1.0) for i in range(9)]
    assert build_recommendations(zones, [], "fast") == []


def test_every_recommendation_carries_trace() -> None:
    zones = fast_zones_with_hot(hot_heat=0.911)
    gondolas = [gondola("g1", "Despensa", 3, 2, dwell=12.0, traffic=5)]
    logs = [{"t": 1.0, "track_id": 9, "gondola_id": "g1", "gondola_name": "Despensa"}]
    recs = build_recommendations(zones, gondolas, "advanced", logs, logs)
    assert recs
    for item in recs:
        assert item["type"] == "recommendation"
        assert item["rule"] and item["severity"] in ("high", "medium", "low")
        assert item["title"] and item["detail"]
        trace = item["trace"]
        assert "evidence_refs" in trace and "thresholds" in trace
        assert all(v is not None or isinstance(v, list) for v in trace.values())


def test_endpoint_prefers_stored_recommendations(client, state) -> None:
    from app.models import User

    make_analysis(state, "rec-stored", site_id=1, status="completed", result={
        "analysis_mode": "fast",
        "recommendations": [{
            "type": "recommendation", "rule": "zone_high_dwell", "severity": "medium",
            "title": "X", "detail": "Y", "trace": {"zone_id": "auto-6"},
        }],
        "findings": [{"type": "recommendation", "title": "legacy", "detail": "should not win"}],
    })
    state.user = state.session.get(User, 1)
    body = client.get("/api/analyses/rec-stored/recommendations").json()
    assert len(body["recommendations"]) == 1
    assert body["recommendations"][0]["rule"] == "zone_high_dwell"
    assert body["recommendations"][0]["trace"]["zone_id"] == "auto-6"


def test_endpoint_falls_back_to_findings(client, state) -> None:
    make_analysis(state, "rec-legacy", site_id=1, status="completed", result={
        "analysis_mode": "fast",
        "findings": [
            {"type": "quality", "title": "no-op", "detail": "x"},
            {"type": "recommendation", "title": "legacy rec", "detail": "y"},
        ],
    })
    from app.models import User

    state.user = state.session.get(User, 1)
    body = client.get("/api/analyses/rec-legacy/recommendations").json()
    assert len(body["recommendations"]) == 1
    assert "rule" not in body["recommendations"][0]