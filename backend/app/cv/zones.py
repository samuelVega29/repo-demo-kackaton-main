"""Cold/hot zone classification derived only from the analysis's own data.

The tracking loop accumulates per-zone statistics (this module never re-runs
YOLO/ByteTrack) and ``compute_zone_metrics`` turns them into the exposed
``zones`` contract:

    zone_id, name, polygon, visits, density, dwell_seconds,
    avg_dwell_seconds, interactions, heat_index, classification, source

The heat index is relative to the SAME analysis (never compared against
hardcoded global baselines), always stays in 0..1, and its weights are the
single-source constants below. Classification is deterministic and never binds
a fixed label to a particular zone_id.

FORMULA
-------
    heat_index = HEAT_WEIGHT_VISITS       * norm(visits)
               + HEAT_WEIGHT_AVG_DWELL    * norm(avg_dwell_seconds)
               + HEAT_WEIGHT_INTERACTIONS * norm(interactions)

with norm(x) = x / max(x over the zones of this analysis), and 0 whenever that
max is 0. Because the weights sum to 1 and every norm(x) is in [0, 1], the
result is always in [0, 1].

    avg_dwell_seconds = dwell_seconds / visits  (0 when the zone had no visits)
    density           = visits per minute of analysis duration
                        (informational only; it does not feed the heat index)

Fast mode zones are the automatic 3x3 grid exposed in normalized 0..1
coordinates; advanced mode zones are the configured physical ones (meters).

CLASSIFICATION
--------------
Zones without activity (visits == 0 AND dwell_seconds == 0) are always cold.

Active zones are compared against each other, never against empties:

- 1 active zone          -> hot (there is a clear activity focus).
- 2 active zones         -> the greater is cold/hot-ranked ONLY when the gap
                            exceeds TWO_ACTIVE_SIGNIFICANT_GAP; when they are
                            practically equal both are normal.
- > 2 active zones       -> hot  = top third    of the heat-index ranking
                            cold = bottom third of the heat-index ranking
                            normal = the rest.
- All active zones equal -> all normal (no artificial hot/cold labels).

Ties at a boundary are broken by the zone's position in the configuration
(stable, deterministic) — never by data outside the analysis.
"""
from __future__ import annotations

# Single source of truth for the heat-index weights.
HEAT_WEIGHT_VISITS = 0.4
HEAT_WEIGHT_AVG_DWELL = 0.4
HEAT_WEIGHT_INTERACTIONS = 0.2

# Relative-classification shares (top/bottom third).
HOT_SHARE = 1 / 3
COLD_SHARE = 1 / 3

# Minimum heat-index gap to call one of only two active zones "hot".
# Below this the two zones are considered practically equal (both normal).
TWO_ACTIVE_SIGNIFICANT_GAP = 0.05

HEAT_PRECISION = 3
METRIC_PRECISION = 2


def compute_zone_metrics(
    zone_stats: dict,
    zones_config: list[dict],
    duration_seconds: float,
    mode: str = "fast",
) -> list[dict]:
    """Builds the exposed ``zones`` list from accumulated per-zone stats.

    Parameters
    ----------
    zone_stats : dict[str, dict]
        zone_id -> ``{"track_ids": set, "dwell_seconds": float, "interactions": int}``
        Accumulated during tracking; NOT recomputed here.
    zones_config : list[dict]
        Zone configuration. Polygons are normalized 0..1 in fast mode and
        meters in advanced mode; only ``id``/``name``/``polygon`` are read.
    duration_seconds : float
        Analysis duration; feeds only the informational ``density`` metric.
    mode : str
        ``"fast"`` or ``"advanced"``. Only affects the ``source`` field
        (``auto_grid`` vs ``configured``).
    """
    duration_minutes = max(float(duration_seconds), 0.01) / 60.0
    rows = []
    for index, zone in enumerate(zones_config):
        zone_id = zone.get("id") or f"zone-{index}"
        stats = zone_stats.get(zone_id, {"track_ids": set(), "dwell_seconds": 0.0, "interactions": 0})
        track_ids = stats.get("track_ids") or set()
        dwell_seconds = float(stats.get("dwell_seconds") or 0.0)
        interactions = int(stats.get("interactions") or 0)
        visits = len(track_ids)
        avg_dwell_seconds = (dwell_seconds / visits) if visits else 0.0
        rows.append({
            **zone,
            "zone_id": zone_id,
            "visits": visits,
            "density": round(visits / duration_minutes, METRIC_PRECISION),
            "dwell_seconds": round(dwell_seconds, METRIC_PRECISION),
            "avg_dwell_seconds": round(avg_dwell_seconds, METRIC_PRECISION),
            "interactions": interactions,
            "heat_index": 0.0,
            "classification": "cold",
            "source": zone.get("source") or ("auto_grid" if mode == "fast" else "configured"),
        })
    heat_indices = _heat_indices(rows)
    classifications = _classify(heat_indices)
    for row, heat, label in zip(rows, heat_indices, classifications):
        row["heat_index"] = heat
        row["classification"] = label
    return rows


def _heat_indices(rows: list[dict]) -> list[float]:
    """Relative (per-analysis) 0..1 heat index for every zone row."""

    def normalized(key: str) -> list[float]:
        values = [float(row.get(key) or 0.0) for row in rows]
        maximum = max(values) if values else 0.0
        return [value / maximum if maximum > 0 else 0.0 for value in values]

    norm_visits = normalized("visits")
    norm_dwell = normalized("avg_dwell_seconds")
    norm_interactions = normalized("interactions")
    indices = []
    for i in range(len(rows)):
        value = (
            HEAT_WEIGHT_VISITS * norm_visits[i]
            + HEAT_WEIGHT_AVG_DWELL * norm_dwell[i]
            + HEAT_WEIGHT_INTERACTIONS * norm_interactions[i]
        )
        indices.append(round(max(0.0, min(1.0, value)), HEAT_PRECISION))
    return indices


def _classify(heat_indices: list[float]) -> list[str]:
    """Deterministic hot/normal/cold labels from the heat-index list."""
    n = len(heat_indices)
    active = [index for index, value in enumerate(heat_indices) if value > 0]
    labels = ["cold"] * n
    if not active:
        return labels
    if len(active) == 1:
        labels[active[0]] = "hot"
        return labels
    active_values = [heat_indices[index] for index in active]
    if max(active_values) == min(active_values):
        for index in active:
            labels[index] = "normal"
        return labels
    if len(active) == 2:
        greater, lower = sorted(active, key=lambda index: heat_indices[index], reverse=True)
        if heat_indices[greater] - heat_indices[lower] <= TWO_ACTIVE_SIGNIFICANT_GAP:
            labels[greater] = "normal"
            labels[lower] = "normal"
        else:
            labels[greater] = "hot"
            labels[lower] = "cold"
        return labels
    ranking = sorted(active, key=lambda index: (-heat_indices[index], index))
    hot_count = max(1, round(HOT_SHARE * len(active)))
    cold_count = max(1, round(COLD_SHARE * len(active)))
    hot_count = min(hot_count, len(active) - 1)
    cold_count = min(cold_count, len(active) - hot_count)
    for rank, index in enumerate(ranking):
        if rank < hot_count:
            labels[index] = "hot"
        elif rank >= len(active) - cold_count:
            labels[index] = "cold"
        else:
            labels[index] = "normal"
    return labels
