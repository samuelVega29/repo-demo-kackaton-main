"""Traceable recommendations derived only from real analysis data.

Every recommendation carries ``rule`` (a stable, documented identifier),
``severity`` and a ``trace`` object that points at the concrete metrics and
comparisons that produced it — it never cites fabricated numbers.

Recommendations are computed once when the pipeline finishes and stored inside
``Analysis.result`` (``result["recommendations"]``); the API endpoint only
reads them back, it never recomputes anything here.

RULES
-----
zone_high_dwell     hot zone with the maximum heat index -> congestion /
                    layout review. Only fires when a zone was classified hot
                    (so a uniform-traffic analysis emits nothing).
zone_low_traffic    first cold zone (visits == 0 and dwell == 0) in config
                    order, only when the rest of the analysis actually had
                    activity -> placement/signage opportunity. Positional and
                    deterministic, never keyed to a zone id.
gondola_stock_check advanced only; the gondola with the highest engagement
                    score (2*pickups + interactions) when it registered at
                    least one pickup -> stock/replenishment check.
gondola_display_check advanced only; the same top gondola when it only had
                    interactions (no pickups) -> display validation.

SEVERITY
--------
Bands applied over per-analysis normalized (0..1) values — documented,
deterministic, and not a comparison between analyses:
    high    heat_index >= 0.6  |  gondola with pickups > 0
    medium  heat_index >= 0.4  |  gondola with only interactions
    low     informational (untouched cold zone)

Both ``build_recommendations`` and the sorting are deterministic (ties are
broken by config order / rule name, never by random or global data).
"""
from __future__ import annotations

SEVERITY_HIGH_MIN_HEAT = 0.6
SEVERITY_MEDIUM_MIN_HEAT = 0.4
GONDOLA_PICKUP_WEIGHT = 2
EVIDENCE_REFS_LIMIT = 3

_SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _active_zones(zones: list[dict]) -> list[dict]:
    return [zone for zone in zones if zone.get("visits", 0) > 0 or zone.get("dwell_seconds", 0) > 0]


def _zone_trace(zone: dict, active_count: int, hot_count: int) -> dict:
    return {
        "zone_id": zone.get("zone_id"),
        "zone_name": zone.get("name"),
        "classification": zone.get("classification"),
        "heat_index": zone.get("heat_index"),
        "visits": zone.get("visits"),
        "dwell_seconds": zone.get("dwell_seconds"),
        "avg_dwell_seconds": zone.get("avg_dwell_seconds"),
        "density": zone.get("density"),
        "interactions": zone.get("interactions"),
        "active_zones": active_count,
        "hot_zones": hot_count,
        "evidence_refs": [],
    }


def _gondola_trace(gondola: dict, logs: list[dict], list_key: str) -> dict:
    refs = [
        {"t": event.get("t"), "track_id": event.get("track_id")}
        for event in logs
        if event.get("gondola_id") == gondola.get("id")
    ][:EVIDENCE_REFS_LIMIT]
    return {
        "gondola_id": gondola.get("id"),
        "gondola_name": gondola.get("name"),
        "interactions": gondola.get("interactions"),
        "pickups": gondola.get("pickups"),
        "dwell_seconds": gondola.get("dwell_seconds"),
        "traffic": gondola.get("traffic"),
        "evidence_refs": refs,
        "evidence_source": list_key,
    }


def build_recommendations(
    zones: list[dict],
    gondolas: list[dict],
    mode: str,
    interaction_events_log: list[dict] | None = None,
    pickup_events_log: list[dict] | None = None,
) -> list[dict]:
    """Deterministic, traceable recommendations for a finished analysis.

    Pure function over the analysis' own data; ``zones`` must already carry the
    Phase-4 classification (hot/normal/cold + heat_index).
    """
    recommendations: list[dict] = []
    active_zones = _active_zones(zones)
    hot_zones = [zone for zone in active_zones if zone.get("classification") == "hot"]

    if hot_zones:
        target = max(hot_zones, key=lambda zone: zone["heat_index"])
        heat = float(target["heat_index"] or 0.0)
        severity = "high" if heat >= SEVERITY_HIGH_MIN_HEAT else "medium"
        avg_dwell = target.get("avg_dwell_seconds", 0.0)
        recommendations.append({
            "type": "recommendation",
            "rule": "zone_high_dwell",
            "severity": severity,
            "title": f"Congestión en {target['name']}",
            "detail": (
                f"Zona caliente con heat_index {heat:.3f} y permanencia media de {avg_dwell} s. "
                "Revisar disposición de góndolas, señalética y flujo de clientes."
            ),
            "trace": {
                **_zone_trace(target, len(active_zones), len(hot_zones)),
                "rule_rank": "max heat among hot zones",
                "thresholds": {
                    "severity_high_min_heat": SEVERITY_HIGH_MIN_HEAT,
                    "severity_medium_min_heat": SEVERITY_MEDIUM_MIN_HEAT,
                },
            },
        })

    untouched = [
        zone for zone in zones
        if zone.get("classification") == "cold" and zone.get("visits", 0) == 0 and zone.get("dwell_seconds", 0) == 0
    ]
    if active_zones and untouched:
        target = untouched[0]  # first one in config order -> deterministic
        recommendations.append({
            "type": "recommendation",
            "rule": "zone_low_traffic",
            "severity": "low",
            "title": f"Zona sin visitas: {target['name']}",
            "detail": (
                "Zona fría sin actividad registrada pese a haber tráfico en el resto del análisis. "
                "Valorar señalética, promo o exhibición para atraer recorrido."
            ),
            "trace": {
                **_zone_trace(target, len(active_zones), len(hot_zones)),
                "thresholds": {"visits": 0, "dwell_seconds": 0},
            },
        })

    if mode == "advanced":
        engaged = [gondola for gondola in gondolas if gondola.get("interactions", 0) > 0 or gondola.get("pickups", 0) > 0]
        if engaged:
            target = max(engaged, key=lambda item: GONDOLA_PICKUP_WEIGHT * item.get("pickups", 0) + item.get("interactions", 0))
            pickups = int(target.get("pickups", 0))
            interactions = int(target.get("interactions", 0))
            if pickups > 0:
                rule = "gondola_stock_check"
                severity = "high"
                title = f"Revisar stock en {target['name']}"
                detail = f"{pickups} pick-ups probables y {interactions} interacciones inferidas; validar stock y reposición de la exhibición."
                log = pickup_events_log or []
                log_key = "pickup_events_log"
            else:
                rule = "gondola_display_check"
                severity = "medium"
                title = f"Validar exhibición de {target['name']}"
                detail = f"{interactions} interacciones inferidas sin pick-ups; revisar visibilidad, señalética y disposición."
                log = interaction_events_log or []
                log_key = "interaction_events_log"
            recommendations.append({
                "type": "recommendation",
                "rule": rule,
                "severity": severity,
                "title": title,
                "detail": detail,
                "trace": {
                    **_gondola_trace(target, log, log_key),
                    "max_pickups_across_gondolas": max((g.get("pickups", 0) for g in gondolas), default=0),
                    "max_interactions_across_gondolas": max((g.get("interactions", 0) for g in gondolas), default=0),
                    "thresholds": {"min_activity_to_consider": 1, "pickup_weight": GONDOLA_PICKUP_WEIGHT},
                },
            })

    recommendations.sort(key=lambda item: (_SEVERITY_ORDER.get(item.get("severity"), 9), item.get("rule", "")))
    return recommendations