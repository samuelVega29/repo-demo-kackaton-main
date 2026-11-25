"""What-if layout simulation.

Re-projects the trajectories ALREADY measured for a completed analysis
against a hypothetical gondola layout (e.g. the one implied by a
recommendation), so the app can show "what would traffic/dwell/interaction
have looked like with this layout" without re-running YOLO/ByteTrack on the
video. It reuses the exact same proximity/engagement state machine as the
real pipeline (``InteractionEngine``), just fed with the stored floor
trajectories instead of live detections.

This is a re-simulation of REAL observed movement, not a crowd-behavior
prediction: the people did not actually move differently, so it answers
"how would these same real visits have engaged with this layout", never
"how many customers will come next month". Keep that framing in whatever
surfaces this to a user.

Limitations, kept honest on purpose:
- Hand/pose keypoints are not persisted in the stored trajectories, so
  pick-ups can't be re-derived: the simulation always reports 0 pickups.
  Traffic, dwell and inferred interaction (proximity + speed + time) ARE
  re-derived and are the meaningful output here.
- Trajectory points are sampled at a fixed ~5 Hz (see ``pipeline.py``,
  ``payload_every = round(fps / 5)``) with no per-point timestamp stored;
  a constant ``SAMPLE_DT`` is assumed between consecutive points of the
  same track. A track that briefly left the frame and came back looks
  continuous, so dwell is a close approximation, not an exact replay.
- Only available for analyses run in "advanced" mode (coordinate_system
  == "meters"); "fast" mode stores trajectories in normalized 0-1 space,
  which isn't directly comparable to a gondola layout in meters.
"""
from __future__ import annotations

from .interaction import InteractionEngine

SAMPLE_HZ = 5.0
SAMPLE_DT = 1.0 / SAMPLE_HZ

# Only used by the pose-fallback shelf-row proxy inside InteractionEngine;
# the simulation never supplies pose data, so this only picks a 3x3 matrix
# row/column bucket that this endpoint does not surface. The value is
# irrelevant to traffic/dwell/interaction, kept for the call signature.
_UNUSED_FRAME_HEIGHT = 1080


def _normalize_gondola(index: int, item: dict) -> dict:
    """Fills in what ``InteractionEngine`` requires (id/name, numeric geometry)
    so a hand-built layout from the client can't crash the simulation on a
    missing field; raises ValueError on geometry that can't be made sense of."""
    try:
        x, z = float(item["x"]), float(item["z"])
        width, depth = float(item["width"]), float(item["depth"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(
            f"Góndola #{index} del layout simulado no tiene geometría válida (x/z/width/depth)."
        ) from exc
    if width <= 0 or depth <= 0:
        raise ValueError(f"Góndola #{index} del layout simulado tiene ancho o profundidad en 0.")
    gondola_id = str(item.get("id") or f"sim-{index}")
    default_segments = {"rows": ["Superior", "Media", "Inferior"], "columns": ["Izquierda", "Centro", "Derecha"]}
    return {
        **item,
        "id": gondola_id,
        "name": item.get("name") or gondola_id,
        "x": x, "z": z, "width": width, "depth": depth,
        # InteractionEngine.results() reads these directly (no .get default).
        "segments": item.get("segments") or default_segments,
    }


def simulate_layout(result: dict, gondolas: list[dict]) -> dict:
    """Recomputes per-gondola traffic/dwell/interaction against ``gondolas``
    (a hypothetical layout, same shape the planogram editor produces) using
    the real trajectories stored in ``result``.

    Raises ``ValueError`` with a user-facing message when the analysis
    doesn't have what's needed (wrong coordinate system, no trajectories,
    empty layout) so the router can turn it into a clear 422.
    """
    if not gondolas:
        raise ValueError("El layout simulado no tiene góndolas.")
    gondolas = [_normalize_gondola(index, item) for index, item in enumerate(gondolas, start=1)]

    coordinate_system = result.get("coordinate_system")
    if coordinate_system not in (None, "meters"):
        raise ValueError(
            "La simulación solo está disponible para análisis en modo avanzado "
            "(coordenadas en metros); este análisis se corrió en modo rápido."
        )

    trajectories = result.get("trajectories") or []
    if not trajectories:
        raise ValueError("Este análisis no guardó trayectorias; no se puede simular.")

    thresholds = (
        result.get("site", {}).get("configuration", {}).get("thresholds") or {}
    )
    engine = InteractionEngine({"gondolas": gondolas, "thresholds": thresholds})

    sampled_tracks = 0
    for track in trajectories:
        points = track.get("points") or []
        if not points:
            continue
        track_id = track.get("track_id")
        sampled_tracks += 1
        timestamp = 0.0
        for point in points:
            if point and len(point) == 2:
                # body_center_y feeds InteractionEngine's shelf-row proxy (a 3x3 matrix
                # bucket we never read here); any constant works since no pose data is
                # available to do better in a simulation.
                detection = {"track_id": track_id, "floor_point": point, "keypoints_3d": None, "body_center_y": 0}
                engine.observe(detection, timestamp, SAMPLE_DT, _UNUSED_FRAME_HEIGHT, hand_point=None)
            timestamp += SAMPLE_DT

    return {
        "gondolas": engine.results(),
        "sampled_tracks": sampled_tracks,
        "sample_hz": SAMPLE_HZ,
        "note": "Pickups no se recalculan en la simulación (requieren datos de mano/pose no persistidos).",
    }
