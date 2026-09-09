from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

from ..database import SessionLocal
from ..models import Analysis, Site
from .detector import get_person_detector, inference_lock
from .heatmaps import create_floor_heatmap, overlay_heatmap_on_frame
from .interaction import InteractionEngine
from .recommendations import build_recommendations
from .spatial import SpatialEngine, with_homographies
from .track_stab import TrackStabilizer
from .video_utils import detect_black_bars
from .zones import compute_zone_metrics


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

# Fast-mode automatic spatial grid density (rows x cols). Configurable here on
# purpose: these are NOT camera-specific thresholds, just the grid granularity.
FAST_ZONE_ROWS = 3
FAST_ZONE_COLS = 3


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


def _valid_four_points(points: list | None) -> bool:
    """True when ``points`` are 4 finite, non-degenerate 2D coordinates.

    Used as a sanity gate for homography inputs; degeneracy is measured by the
    polygon area (shoelace). Points spanning the full frame edges are still valid
    calibrations, so identity is NOT treated as a business criterion.
    """
    if not points or not isinstance(points, (list, tuple)) or len(points) != 4:
        return False
    coords = []
    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            return False
        try:
            coords.append((float(point[0]), float(point[1])))
        except (TypeError, ValueError):
            return False
    for px, py in coords:
        if not (math.isfinite(px) and math.isfinite(py)):
            return False
    area = abs(
        sum(coords[i][0] * coords[(i + 1) % 4][1] - coords[(i + 1) % 4][0] * coords[i][1] for i in range(4))
    ) / 2.0
    return area > 1e-6


def camera_is_calibrated(configuration: dict) -> bool:
    """True when a real homography can be built from the persisted camera config.

    Advanced mode requires ``calibration_status == "calibrated"`` plus four
    non-degenerate source points, four non-degenerate target points and a
    computable perspective transform. Everything else falls back to fast mode.
    """
    camera = (configuration or {}).get("camera") or {}
    if camera.get("calibration_status") != "calibrated":
        return False
    if not _valid_four_points(camera.get("source_normalized")):
        return False
    if not _valid_four_points(camera.get("target_meters")):
        return False
    try:
        source = np.float32(camera["source_normalized"])
        target = np.float32(camera["target_meters"])
        cv2.getPerspectiveTransform(source, target)
        return True
    except cv2.error:
        return False


def analysis_mode(configuration: dict) -> str:
    """Decides ``"advanced"`` (real homography) or ``"fast"`` (normalized coords)."""
    return "advanced" if camera_is_calibrated(configuration) else "fast"


def _auto_fast_zones(width: int, height: int, rows: int = FAST_ZONE_ROWS, cols: int = FAST_ZONE_COLS) -> list[dict]:
    """Builds the default fast-mode zone grid in internal pixel space."""
    zones = []
    for row in range(rows):
        for column in range(cols):
            x1 = width * column / cols
            x2 = width * (column + 1) / cols
            y1 = height * row / rows
            y2 = height * (row + 1) / rows
            zones.append({
                "id": f"auto-{row * cols + column}",
                "name": f"Zona {row + 1}-{column + 1}",
                "polygon": [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
                "source": "auto_grid",
            })
    return zones


def _auto_gondola_zones(gondolas: list[dict], margin_x: float = 1.5, margin_z: float | None = None) -> list[dict]:
    """Builds one zone per gondola, centered on its footprint and inflated by a margin.

    The gondola ``x``/``z`` are the top-left corner of its footprint. Rotated gondolas use
    the same rotation convention as ``SpatialEngine.local_offset`` (degrees, clockwise), so
    the zone matches exactly what the interaction logic considers "near the gondola". The
    margin can differ per axis (fast mode rescales pixels with different sx/sz factors).
    """
    zone_margin_z = margin_z if margin_z is not None else margin_x
    zones = []
    for gondola in gondolas:
        gx = float(gondola["x"])
        gz = float(gondola["z"])
        width = float(gondola.get("width", 1.0) or 1.0)
        depth = float(gondola.get("depth", 1.0) or 1.0)
        rotation = float(gondola.get("rotation") or 0.0)
        cx = gx + width / 2.0
        cz = gz + depth / 2.0
        half_w = width / 2.0 + margin_x
        half_d = depth / 2.0 + zone_margin_z
        theta = math.radians(rotation)
        cos_t, sin_t = math.cos(theta), math.sin(theta)
        corners = []
        for u, v in ((-half_w, -half_d), (half_w, -half_d), (half_w, half_d), (-half_w, half_d)):
            dx = u * cos_t - v * sin_t
            dz = u * sin_t + v * cos_t
            corners.append([round(cx + dx, 3), round(cz + dz, 3)])
        zones.append({
            "id": f"zone-{gondola['id']}",
            "name": gondola.get("name") or f"Zona de {gondola['id']}",
            "polygon": corners,
            "source": "auto_gondola",
        })
    return zones


def _fast_zones(gondolas: list[dict], thresholds: dict, sx: float, sz: float, width: int, height: int) -> list[dict]:
    """Auto zones for fast mode: one inflated rectangle per gondola when the site
    has gondolas, otherwise the classic 3x3 grid.
    """
    if gondolas:
        approach_m = float(thresholds.get("approach_m", 1.5) or 1.5)
        return _auto_gondola_zones(gondolas, margin_x=approach_m * sx, margin_z=approach_m * sz)
    return _auto_fast_zones(width, height)


def _fast_process_configuration(configuration: dict, width: int, height: int) -> dict:
    """Pixel-space working config for fast mode (identity projection, no false calibration).

    This exists ONLY so the existing heatmap/zone/dwell pipeline can run unchanged.
    Nothing here is exposed as meters or 3D; external contracts stay normalized 0..1.

    Gondolas are carried over from the site (drawn planogram) and rescaled from the
    physical floor (meters) into the internal pixel space proportionally, so interaction
    and pick-up inference keep working for uncalibrated sites instead of silently
    producing zeroes because ``gondolas`` was emptied.
    """
    camera_name = (configuration.get("camera") or {}).get("name", "Cámara")
    raw_thresholds = dict(configuration.get("thresholds") or {
        "approach_m": 1.5, "engaged_m": 0.8, "engaged_seconds": 2.0,
        "interaction_seconds": 4.0, "max_speed_m_s": 1.2, "minimum_track_seconds": 2.0,
        "pickup_reach_m": 0.5, "pickup_min_seconds": 0.6, "pickup_cooldown_s": None,
    })
    floor_m = configuration.get("floor") or {}
    floor_w = float(floor_m.get("width", 1.0) or 1.0)
    floor_d = float(floor_m.get("depth", 1.0) or 1.0)
    sx, sz = width / floor_w, height / floor_d
    scale = (sx + sz) / 2.0
    thresholds = {
        **raw_thresholds,
        "approach_m": float(raw_thresholds.get("approach_m", 1.5) or 1.5) * scale,
        "engaged_m": float(raw_thresholds.get("engaged_m", 0.8) or 0.8) * scale,
        "pickup_reach_m": float(
            raw_thresholds.get("pickup_reach_m", raw_thresholds.get("hand_reach_m", 0.5))
            or 0.5
        ) * scale,
        "max_speed_m_s": float(raw_thresholds.get("max_speed_m_s", 1.2) or 1.2) * scale,
    }
    gondolas = []
    for item in configuration.get("gondolas", []):
        x, z, gwidth, gdepth = item["x"], item["z"], item.get("width", 1.0), item.get("depth", 1.0)
        if x is None or z is None:
            continue
        gondolas.append({
            **item,
            "x": x * sx,
            "z": z * sz,
            "width": gwidth * sx,
            "depth": gdepth * sz,
            "tier_heights": [tier * sz for tier in (item.get("tier_heights") or [0.25, 0.73, 1.20])],
        })
    return {
        "version": configuration.get("version", 1),
        "units": "normalized",
        "analysis_mode": "fast",
        "floor": {"width": float(width), "depth": float(height), "unit": "pixels", "normalized": True},
        "camera": {
            "name": camera_name,
            "source_normalized": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
            "target_meters": [[0.0, 0.0], [float(width), 0.0], [float(width), float(height)], [0.0, float(height)]],
            "calibration_status": "fast",
            "model_3d": None,
        },
        "zones": _fast_zones(gondolas, raw_thresholds, sx, sz, width, height),
        "gondolas": gondolas,
        "thresholds": thresholds,
        "auto_zones": True,
    }


def _fast_output_configuration(process_config: dict, width: int, height: int) -> dict:
    """Normalized 0..1 copy of the fast config for external contracts.

    Never presents pixel width/height as if they were meters; floor is 1x1,
    zones are re-normalized, gondolas are re-normalized and 3D is absent.
    """
    zones = []
    for zone in process_config.get("zones", []):
        polygon = zone.get("polygon") or []
        zones.append({
            **zone,
            "polygon": [[round(x / width, 6), round(y / height, 6)] for x, y in polygon],
        })
    gondolas = []
    for gondola in process_config.get("gondolas", []):
        gondolas.append({
            **gondola,
            "x": round(gondola["x"] / width, 6),
            "z": round(gondola["z"] / height, 6),
            "width": round(gondola["width"] / width, 6),
            "depth": round(gondola["depth"] / height, 6),
            "tier_heights": [round(tier / height, 6) for tier in gondola.get("tier_heights", [])],
        })
    return {
        "version": process_config.get("version", 1),
        "units": "normalized",
        "analysis_mode": "fast",
        "floor": {"width": 1.0, "depth": 1.0, "units": "normalized"},
        "camera": {
            "name": (process_config.get("camera") or {}).get("name", "Cámara"),
            "source_normalized": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
            "target_meters": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
            "calibration_status": "fast",
            "model_3d": None,
        },
        "zones": zones,
        "gondolas": gondolas,
        "thresholds": process_config.get("thresholds", {}),
        "auto_zones": True,
    }


def _roi_to_pixel_polygon(roi: list[list[float]], width: int, height: int) -> np.ndarray:
    """Converts a normalized ROI polygon (0..1) into pixel coordinates."""
    return np.float32([[x * width, y * height] for x, y in roi])


def _exposed_point(point: list[float], mode: str, width: int, height: int) -> list[float]:
    """Point space for external contracts: normalized 0..1 in fast, meters in advanced."""
    if mode == "fast":
        return [round(float(point[0]) / width, 6), round(float(point[1]) / height, 6)]
    return [float(point[0]), float(point[1])]


def _exposed_gondola(gondola: dict, mode: str, width: int, height: int) -> dict:
    if mode != "fast":
        return gondola
    return {
        **gondola,
        "x": round(float(gondola["x"]) / width, 6),
        "z": round(float(gondola["z"]) / height, 6),
        "width": round(float(gondola["width"]) / width, 6),
        "depth": round(float(gondola["depth"]) / height, 6),
        "height": 0.22,
        "tier_heights": [0.06, 0.13, 0.2],
        "pickup_events": [
            {
                **event,
                "x": round(float(event["x"]) / width, 6),
                "z": round(float(event["z"]) / height, 6),
            }
            for event in gondola.get("pickup_events", [])
        ],
    }


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
    if candidates:
        best_distance, best_point = candidates[0]
        if best_distance <= float(spatial.configuration.get("thresholds", {}).get("approach_m", 1.5) or 1.5):
            return best_point, False

    # Without reliable pose, hand pixels are projected as if they were on the floor, which
    # can push the estimated reach away from the shelf. If the body is already engaged
    # very close to the gondola, use the nearest shelf point as a low-confidence proxy.
    body_distance = SpatialEngine.distance_to_gondola(car, active)
    proxy_reach = max(0.25, float(spatial.configuration.get("thresholds", {}).get("engaged_m", 0.8) or 0.8) * 0.55)
    if body_distance <= proxy_reach:
        return SpatialEngine.nearest_point_on_gondola(car, active), False

    return None, False


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
    return findings


def run_analysis(analysis_id: str, configuration: dict | None = None, site_id: int | None = None, roi: list[list[float]] | None = None) -> None:
    """Processes `analysis_id`. Optionally override the site configuration (useful to
    replay an analysis with the layout that was in place when it was created), the site id
    reported in the result payload, and/or restrict the processing to a region (roi).
    """
    capture = None
    try:
        with SessionLocal() as database:
            analysis = database.get(Analysis, analysis_id)
            sort_site = database.get(Site, site_id) if site_id else (database.get(Site, analysis.site_id) if analysis else None)
            if not analysis or not sort_site:
                raise ValueError("El análisis o la sede ya no existen")
            video_path = Path(analysis.video_path)
            site = sort_site
            site_configuration = configuration if configuration is not None else site.configuration
            configuration = site_configuration

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

        # Decide the real analysis mode from the persisted camera configuration.
        # Fast mode never fabricates a physical calibration: it works on the full
        # frame with normalized coordinates and an internal auto grid.
        mode = analysis_mode(configuration)
        advanced = mode == "advanced"
        process_config = configuration if advanced else _fast_process_configuration(configuration, width, height)
        output_config = configuration if advanced else _fast_output_configuration(process_config, width, height)
        # Advanced mode without any configured zone would produce an empty zones list,
        # silently zeroing every zone-derived metric (hot zones, recommendations...).
        # Mirror fast mode: auto-create one zone per gondola when there are gondolas,
        # falling back to a floor grid when the site has neither zones nor gondolas.
        if advanced and not (process_config.get("zones") or []):
            thresholds = configuration.get("thresholds") or {}
            approach_m = float(thresholds.get("approach_m", 1.5) or 1.5)
            floor = configuration.get("floor") or {}
            auto_zones = _auto_gondola_zones(configuration.get("gondolas", []), margin_x=approach_m)
            if not auto_zones:
                auto_zones = _auto_fast_zones(
                    float(floor.get("width", 12.0) or 12.0),
                    float(floor.get("depth", 8.0) or 8.0),
                )
            process_config = {**configuration, "zones": auto_zones, "auto_zones": True}
            output_config = process_config
        roi_pixels = _roi_to_pixel_polygon(roi, width, height) if roi else None

        update_analysis(analysis_id, stage="model", progress=5, message="Preparando detección y seguimiento (YOLO + ByteTrack)")
        # Reuse the process-wide detector: weights are loaded once per process instead of
        # once per analysis. The pose model is preferred; fall back to detection-only.
        try:
            detector = get_person_detector(detection_only=False)
            has_pose = True
        except Exception:
            detector = get_person_detector(detection_only=True)
            has_pose = False
        detector.reset_tracker()

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
                process_config = {
                    **process_config,
                    "camera": {**process_config["camera"], "crop_info": bars_info},
                }
                if advanced:
                    output_config = process_config
            capture.set(cv2.CAP_PROP_POS_FRAMES, 0)

        spatial = SpatialEngine(process_config, width, height)
        interactions = InteractionEngine(process_config)
        # Stabilizer merges fragmented ByteTrack ids into stable people identities.
        track_stabilizer = TrackStabilizer()
        result_dir = Path(__file__).resolve().parents[2] / "data" / "results" / analysis_id
        result_dir.mkdir(parents=True, exist_ok=True)

        trajectories: dict[int, list[list[float]]] = defaultdict(list)
        track_frames: dict[int, int] = defaultdict(int)
        zone_stats: dict[str, dict] = {
            zone["id"]: {"track_ids": set(), "dwell_seconds": 0.0, "interactions": 0}
            for zone in process_config.get("zones", [])
        }
        traffic_points: list[dict] = []
        dwell_points: list[dict] = []
        interaction_points: list[dict] = []
        pickup_points: list[dict] = []
        interaction_events: list[dict] = []
        pickup_events: list[dict] = []
        behavior_trace = {
            "zone_hits": 0,
            "near_gondola_frames": 0,
            "engaged_frames": 0,
            "interaction_frames": 0,
            "hand_candidate_frames": 0,
            "pickup_frames": 0,
        }
        last_interaction: dict[int, bool] = defaultdict(bool)
        gondola_names = {item["id"]: item.get("name", item["id"]) for item in process_config.get("gondolas", [])}
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
        crop_info = process_config["camera"].get("crop_info")
        bar_left = crop_info["left"] if crop_info and crop_info["has_bars"] else 0
        bar_right = (width - crop_info["right"]) if crop_info and crop_info["has_bars"] else width
        bar_top = crop_info["top"] if crop_info and crop_info["has_bars"] else 0
        bar_bottom = (height - crop_info["bottom"]) if crop_info and crop_info["has_bars"] else height

        frame_index = 0
        with inference_lock:
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
                    if roi_pixels is not None and cv2.pointPolygonTest(roi_pixels, (feet_x, feet_y), False) < 0:
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
                    if has_pose and mode == "advanced":
                        detection["keypoints_3d"] = project_keypoints_to_3d_v2(
                            detection.get("keypoints"), detection["image_point"],
                            detection["bbox"], spatial,
                        )
                    else:
                        detection["keypoints_3d"] = None
                    hand_point, pose_verified = project_hand(spatial, detection)
                    detection["hand_pose_verified"] = pose_verified
                    behavior = interactions.observe(detection, timestamp, dt, height, hand_point=hand_point)
                    total_detections += 1
                    active_this_frame.add(detection["track_id"])
                    track_frames[detection["track_id"]] += 1
                    zone = spatial.zone_at(detection["floor_point"])
                    if zone:
                        behavior_trace["zone_hits"] += 1
                        zone_entry = zone_stats.setdefault(zone["id"], {"track_ids": set(), "dwell_seconds": 0.0, "interactions": 0})
                        zone_entry["dwell_seconds"] += dt
                        zone_entry["track_ids"].add(detection["track_id"])
                    if behavior["gondola_id"]:
                        behavior_trace["near_gondola_frames"] += 1
                    if behavior["state"] in ("ENGAGED", "INTERACTION"):
                        behavior_trace["engaged_frames"] += 1
                    if behavior["interaction"]:
                        behavior_trace["interaction_frames"] += 1
                    if hand_point is not None:
                        behavior_trace["hand_candidate_frames"] += 1
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
                            "confidence": detection["confidence"],
                            "floor_point": _exposed_point(detection["floor_point"], mode, width, height),
                            "state": behavior["state"], "gondola_id": behavior["gondola_id"],
                            "keypoints_3d": detection["keypoints_3d"],
                        })
                    if behavior["interaction"]:
                        if zone:
                            zone_stats.setdefault(zone["id"], {"track_ids": set(), "dwell_seconds": 0.0, "interactions": 0})["interactions"] += 1
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
                        behavior_trace["pickup_frames"] += 1
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
        create_floor_heatmap(traffic_points, process_config["floor"], result_dir / "traffic.png")
        create_floor_heatmap(dwell_points, process_config["floor"], result_dir / "dwell.png")
        create_floor_heatmap(interaction_points, process_config["floor"], result_dir / "interaction.png")
        create_floor_heatmap(pickup_points, process_config["floor"], result_dir / "pickup.png")

        homography_inv = spatial.homography_norm_inv.round(6).tolist()
        overlay_names: dict[str, list[str]] = {}
        for index, raw_frame in enumerate(evidence_frames, start=1):
            for metric, point_source in (
                ("traffic", traffic_points),
                ("dwell", dwell_points),
                ("interaction", interaction_points),
                ("pickup", pickup_points),
            ):
                if metric in ("interaction", "pickup") and not point_source:
                    continue
                blended = overlay_heatmap_on_frame(point_source, process_config["floor"], homography_inv, raw_frame)
                filename = f"overlay_{metric}_{index}.jpg"
                cv2.imwrite(str(result_dir / filename), blended)
                overlay_names.setdefault(metric, []).append(filename)

        slices_meta: list[dict] = []
        for index in range(slice_count):
            start = round(index * slice_size / fps, 1)
            end = round(min((index + 1) * slice_size, total_frames) / fps, 1)
            entry = {"index": index, "start": start, "end": end}
            for metric in ("traffic", "dwell", "interaction", "pickup"):
                filename = f"time_{index}_{metric}.png"
                create_floor_heatmap(slice_buckets[metric][index], process_config["floor"], result_dir / filename)
                entry[metric] = filename if slice_buckets[metric][index] else None
            slices_meta.append(entry)

        gondolas = interactions.results()

        # Add height and tier_heights to gondola results from configuration
        gondola_config = {item["id"]: item for item in process_config.get("gondolas", [])}
        for gondola in gondolas:
            config = gondola_config.get(gondola["id"], {})
            gondola["height"] = config.get("height", 1.45)
            gondola["tier_heights"] = config.get("tier_heights", [0.25, 0.73, 1.20])

        gondolas = [
            _exposed_gondola(gondola, mode, width, height)
            for gondola in gondolas
        ]

        duration_seconds = total_frames / fps
        zones = compute_zone_metrics(
            zone_stats,
            output_config.get("zones", []),
            duration_seconds=duration_seconds,
            mode=mode,
        )
        minimum_track_frames = max(2, round(fps * process_config.get("thresholds", {}).get("minimum_track_seconds", 2.0)))
        valid_track_ids = {track_id for track_id, count in track_frames.items() if count >= minimum_track_frames}
        trajectory_payload = [
            {"track_id": track_id, "points": [_exposed_point(point, mode, width, height) for point in points]}
            for track_id, points in trajectories.items()
            if track_id in valid_track_ids and len(points) > 1
        ]
        interaction_count = sum(item["interactions"] for item in gondolas)

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
        pickup_events = []
        for gondola in gondolas:
            for event in gondola.get("pickup_events", []):
                pickup_events.append({
                    **event,
                    "gondola_id": gondola["id"],
                    "gondola_name": gondola.get("name", gondola["id"]),
                })
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
        if mode == "fast":
            # Pixels per second, normalized by the frame's largest edge. Real data, but
            # explicitly NOT meters per second (no calibration exists to justify that).
            average_speed_normalized = round(average_speed / max(width, height), 6) if average_speed else 0.0
        else:
            average_speed_normalized = None
        duration_minutes = max(0.01, (total_frames / fps) / 60.0)

        recommendations = build_recommendations(
            zones,
            gondolas,
            mode,
            interaction_events_log=interaction_events_log,
            pickup_events_log=pickup_events_log,
        )
        findings = build_findings(gondolas, zones, interaction_count, pickup_count) + list(recommendations)

        result = {
            "analysis_mode": mode,
            "coordinate_system": "normalized" if mode == "fast" else "meters",
            "roi": roi,
            "site": {"id": site.id, "name": site.name, "city": site.city, "configuration": with_homographies(output_config)},
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
                "average_speed_m_s": average_speed if mode == "advanced" else 0.0,
                "average_speed_normalized": average_speed_normalized if mode == "fast" else None,
                "flow_per_minute": round(len(valid_track_ids) / duration_minutes, 1),
                "peak_presence": peak_presence,
                "time_slices": slice_count,
                "behavior_trace": behavior_trace,
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
            "recommendations": recommendations,
            "findings": findings,
            "quality": {"calibration": process_config["camera"].get("calibration_status", "unknown"), "analysis_mode": mode, "coordinate_system": "normalized" if mode == "fast" else "meters", "vertical_analysis": "pose_refined_when_available", "interaction": "inferred_from_proximity_speed_and_time" if interaction_points else "insufficient_evidence", "pickup": "hand_reach_with_pose_keypoints_when_available"},
        }
        update_analysis(analysis_id, status="completed", stage="results", progress=100, message="Análisis espacial completado", result=result, duration_seconds=result["video"]["duration_seconds"])
    except Exception as exc:
        update_analysis(analysis_id, status="failed", stage="failed", progress=100, message=str(exc)[:300])
    finally:
        if capture is not None:
            capture.release()
