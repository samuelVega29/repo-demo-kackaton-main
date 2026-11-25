from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

from ..config.settings import BLUR_FACES, FACE_BLUR_INTENSITY
from ..database import SessionLocal
from ..models import Analysis, Site
from .detector import get_person_detector, inference_lock
from .heatmaps import create_floor_heatmap, overlay_heatmap_on_frame
from .interaction import InteractionEngine
from .privacy import blur_detection_faces
from .recommendations import build_recommendations
from .spatial import SpatialEngine, with_homographies
from .track_stab import TrackStabilizer
from .video_utils import AnonymizedVideoWriter, detect_black_bars
from .zones import compute_zone_metrics


# =========================================================
# CANCELACIÓN
# =========================================================


class AnalysisCancelled(Exception):
    """
    Excepción interna utilizada para detener limpiamente
    el pipeline cuando el usuario solicita cancelar.
    """

    pass


def cancellation_requested(
    analysis_id: str,
) -> bool:
    """
    Consulta directamente la base de datos para saber si
    desde el frontend/backend se solicitó cancelar el análisis.
    """

    with SessionLocal() as database:
        analysis = database.get(
            Analysis,
            analysis_id,
        )

        if not analysis:
            return False

        return analysis.status in {
            "cancelling",
            "cancelled",
        }


def ensure_not_cancelled(
    analysis_id: str,
) -> None:
    """
    Detiene el pipeline lanzando una excepción controlada
    cuando el análisis se encuentra en estado cancelling
    o cancelled.
    """

    if cancellation_requested(
        analysis_id
    ):
        raise AnalysisCancelled(
            "Análisis cancelado por el usuario"
        )


def mark_analysis_cancelled(
    analysis_id: str,
) -> None:
    """
    Marca definitivamente el análisis como cancelado.

    Conserva el progreso alcanzado hasta el momento.
    """

    with SessionLocal() as database:
        analysis = database.get(
            Analysis,
            analysis_id,
        )

        if not analysis:
            return

        analysis.status = "cancelled"
        analysis.stage = "cancelled"
        analysis.message = (
            "Análisis cancelado por el usuario"
        )

        database.commit()


# =========================================================
# CONFIGURACIÓN GENERAL
# =========================================================


# Keypoint index → estimated height fraction
# (0=floor, 1=standing height ~1.75m)
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

FAST_ZONE_ROWS = 3
FAST_ZONE_COLS = 3


# =========================================================
# PROYECCIÓN 3D
# =========================================================


def project_keypoints_to_3d(
    keypoints: list[list[float] | None] | None,
    image_point: list[float],
    bbox: list[float],
    spatial: SpatialEngine,
) -> list[list[float] | None] | None:
    """
    Projects 2D pose keypoints into 3D floor space using
    the floor homography as the base.
    """

    if not keypoints:
        return None

    x1, y1, x2, y2 = bbox

    bbox_height = y2 - y1
    bbox_width = max(
        1.0,
        x2 - x1,
    )

    if bbox_height <= 0:
        return None

    cx = (
        x1 + x2
    ) / 2

    feet_floor = (
        spatial.project(
            [cx, y2]
        )
        or spatial.project(
            [
                image_point[0],
                image_point[1],
            ]
        )
    )

    if feet_floor is None:
        return None

    feet_x, feet_z = feet_floor

    head_floor = (
        spatial.project(
            [cx, y1]
        )
        or feet_floor
    )

    head_x, head_z = head_floor

    standing_m = STANDING_HEIGHT_M

    projected = []

    for idx, kp in enumerate(
        keypoints
    ):
        if kp is None:
            projected.append(
                None
            )
            continue

        kp_x, kp_y = (
            kp[0],
            kp[1],
        )

        fraction = max(
            0.0,
            min(
                1.0,
                (
                    y2 -
                    kp_y
                )
                /
                bbox_height,
            ),
        )

        lateral = (
            kp_x -
            cx
        ) / bbox_width

        x = (
            head_x
            + (
                feet_x -
                head_x
            )
            * fraction
            + lateral
            * (
                bbox_width /
                bbox_height
            )
            * 0.35
            * standing_m
        )

        z = (
            head_z
            + (
                feet_z -
                head_z
            )
            * fraction
        )

        height_m = (
            fraction *
            standing_m
        )

        projected.append(
            [
                round(x, 3),
                round(z, 3),
                round(
                    height_m,
                    3,
                ),
            ]
        )

    return projected


def project_keypoints_to_3d_v2(
    keypoints: list[list[float] | None] | None,
    image_point: list[float],
    bbox: list[float],
    spatial: SpatialEngine,
) -> list[list[float] | None] | None:
    """
    Projects 2D pose keypoints into 3D floor space
    from the floor homography.
    """

    return project_keypoints_to_3d(
        keypoints,
        image_point,
        bbox,
        spatial,
    )


# =========================================================
# HOMOGRAFÍA
# =========================================================


def _valid_four_points(
    points: list | None,
) -> bool:
    """
    True when points are 4 finite, non-degenerate
    2D coordinates.
    """

    if (
        not points
        or not isinstance(
            points,
            (list, tuple),
        )
        or len(points) != 4
    ):
        return False

    coords = []

    for point in points:
        if (
            not isinstance(
                point,
                (list, tuple),
            )
            or len(point) != 2
        ):
            return False

        try:
            coords.append(
                (
                    float(
                        point[0]
                    ),
                    float(
                        point[1]
                    ),
                )
            )

        except (
            TypeError,
            ValueError,
        ):
            return False

    for px, py in coords:
        if not (
            math.isfinite(px)
            and math.isfinite(py)
        ):
            return False

    area = abs(
        sum(
            coords[i][0]
            * coords[
                (i + 1) % 4
            ][1]
            -
            coords[
                (i + 1) % 4
            ][0]
            * coords[i][1]

            for i in range(4)
        )
    ) / 2.0

    return area > 1e-6


def camera_is_calibrated(
    configuration: dict,
) -> bool:
    """
    True when a real homography can be built from
    the persisted camera config.
    """

    camera = (
        (
            configuration
            or {}
        ).get(
            "camera"
        )
        or {}
    )

    if (
        camera.get(
            "calibration_status"
        )
        != "calibrated"
    ):
        return False

    if not _valid_four_points(
        camera.get(
            "source_normalized"
        )
    ):
        return False

    if not _valid_four_points(
        camera.get(
            "target_meters"
        )
    ):
        return False

    try:
        source = np.float32(
            camera[
                "source_normalized"
            ]
        )

        target = np.float32(
            camera[
                "target_meters"
            ]
        )

        cv2.getPerspectiveTransform(
            source,
            target,
        )

        return True

    except cv2.error:
        return False


def analysis_mode(
    configuration: dict,
) -> str:
    return (
        "advanced"
        if camera_is_calibrated(
            configuration
        )
        else "fast"
    )


# =========================================================
# ZONAS AUTOMÁTICAS
# =========================================================


def _auto_fast_zones(
    width: int,
    height: int,
    rows: int = FAST_ZONE_ROWS,
    cols: int = FAST_ZONE_COLS,
) -> list[dict]:

    zones = []

    for row in range(
        rows
    ):
        for column in range(
            cols
        ):
            x1 = (
                width *
                column /
                cols
            )

            x2 = (
                width *
                (
                    column +
                    1
                ) /
                cols
            )

            y1 = (
                height *
                row /
                rows
            )

            y2 = (
                height *
                (
                    row +
                    1
                ) /
                rows
            )

            zones.append(
                {
                    "id":
                        f"auto-{row * cols + column}",

                    "name":
                        f"Zona {row + 1}-{column + 1}",

                    "polygon": [
                        [x1, y1],
                        [x2, y1],
                        [x2, y2],
                        [x1, y2],
                    ],

                    "source":
                        "auto_grid",
                }
            )

    return zones


def _auto_gondola_zones(
    gondolas: list[dict],
    margin_x: float = 1.5,
    margin_z: float | None = None,
) -> list[dict]:

    zone_margin_z = (
        margin_z
        if margin_z
        is not None
        else margin_x
    )

    zones = []

    for gondola in gondolas:

        gx = float(
            gondola["x"]
        )

        gz = float(
            gondola["z"]
        )

        width = float(
            gondola.get(
                "width",
                1.0,
            )
            or 1.0
        )

        depth = float(
            gondola.get(
                "depth",
                1.0,
            )
            or 1.0
        )

        rotation = float(
            gondola.get(
                "rotation"
            )
            or 0.0
        )

        cx = (
            gx +
            width / 2.0
        )

        cz = (
            gz +
            depth / 2.0
        )

        half_w = (
            width / 2.0
            + margin_x
        )

        half_d = (
            depth / 2.0
            + zone_margin_z
        )

        theta = math.radians(
            rotation
        )

        cos_t = math.cos(
            theta
        )

        sin_t = math.sin(
            theta
        )

        corners = []

        for u, v in (
            (
                -half_w,
                -half_d,
            ),
            (
                half_w,
                -half_d,
            ),
            (
                half_w,
                half_d,
            ),
            (
                -half_w,
                half_d,
            ),
        ):

            dx = (
                u * cos_t
                - v * sin_t
            )

            dz = (
                u * sin_t
                + v * cos_t
            )

            corners.append(
                [
                    round(
                        cx + dx,
                        3,
                    ),
                    round(
                        cz + dz,
                        3,
                    ),
                ]
            )

        zones.append(
            {
                "id":
                    f"zone-{gondola['id']}",

                "name":
                    gondola.get(
                        "name"
                    )
                    or (
                        f"Zona de "
                        f"{gondola['id']}"
                    ),

                "polygon":
                    corners,

                "source":
                    "auto_gondola",
            }
        )

    return zones


def _fast_zones(
    gondolas: list[dict],
    thresholds: dict,
    sx: float,
    sz: float,
    width: int,
    height: int,
) -> list[dict]:

    if gondolas:

        approach_m = float(
            thresholds.get(
                "approach_m",
                1.5,
            )
            or 1.5
        )

        return _auto_gondola_zones(
            gondolas,
            margin_x=
                approach_m
                * sx,

            margin_z=
                approach_m
                * sz,
        )

    return _auto_fast_zones(
        width,
        height,
    )


# =========================================================
# CONFIGURACIÓN FAST
# =========================================================


def _fast_process_configuration(
    configuration: dict,
    width: int,
    height: int,
) -> dict:

    camera_name = (
        (
            configuration.get(
                "camera"
            )
            or {}
        ).get(
            "name",
            "Cámara",
        )
    )

    raw_thresholds = dict(
        configuration.get(
            "thresholds"
        )
        or {
            "approach_m":
                1.5,

            "engaged_m":
                0.8,

            "engaged_seconds":
                2.0,

            "interaction_seconds":
                4.0,

            "max_speed_m_s":
                1.2,

            "minimum_track_seconds":
                2.0,

            "pickup_reach_m":
                0.5,

            "pickup_min_seconds":
                0.6,

            "pickup_cooldown_s":
                None,
        }
    )

    floor_m = (
        configuration.get(
            "floor"
        )
        or {}
    )

    floor_w = float(
        floor_m.get(
            "width",
            1.0,
        )
        or 1.0
    )

    floor_d = float(
        floor_m.get(
            "depth",
            1.0,
        )
        or 1.0
    )

    sx = (
        width /
        floor_w
    )

    sz = (
        height /
        floor_d
    )

    scale = (
        sx + sz
    ) / 2.0

    thresholds = {
        **raw_thresholds,

        "approach_m":
            float(
                raw_thresholds.get(
                    "approach_m",
                    1.5,
                )
                or 1.5
            )
            * scale,

        "engaged_m":
            float(
                raw_thresholds.get(
                    "engaged_m",
                    0.8,
                )
                or 0.8
            )
            * scale,

        "pickup_reach_m":
            float(
                raw_thresholds.get(
                    "pickup_reach_m",
                    raw_thresholds.get(
                        "hand_reach_m",
                        0.5,
                    ),
                )
                or 0.5
            )
            * scale,

        "max_speed_m_s":
            float(
                raw_thresholds.get(
                    "max_speed_m_s",
                    1.2,
                )
                or 1.2
            )
            * scale,
    }

    gondolas = []

    for item in configuration.get(
        "gondolas",
        [],
    ):

        x = item["x"]
        z = item["z"]

        gwidth = item.get(
            "width",
            1.0,
        )

        gdepth = item.get(
            "depth",
            1.0,
        )

        if (
            x is None
            or z is None
        ):
            continue

        gondolas.append(
            {
                **item,

                "x":
                    x * sx,

                "z":
                    z * sz,

                "width":
                    gwidth * sx,

                "depth":
                    gdepth * sz,

                "tier_heights": [
                    tier * sz
                    for tier
                    in (
                        item.get(
                            "tier_heights"
                        )
                        or [
                            0.25,
                            0.73,
                            1.20,
                        ]
                    )
                ],
            }
        )

    return {
        "version":
            configuration.get(
                "version",
                1,
            ),

        "units":
            "normalized",

        "analysis_mode":
            "fast",

        "floor": {
            "width":
                float(width),

            "depth":
                float(height),

            "unit":
                "pixels",

            "normalized":
                True,
        },

        "camera": {
            "name":
                camera_name,

            "source_normalized": [
                [0.0, 0.0],
                [1.0, 0.0],
                [1.0, 1.0],
                [0.0, 1.0],
            ],

            "target_meters": [
                [0.0, 0.0],
                [
                    float(
                        width
                    ),
                    0.0,
                ],
                [
                    float(
                        width
                    ),
                    float(
                        height
                    ),
                ],
                [
                    0.0,
                    float(
                        height
                    ),
                ],
            ],

            "calibration_status":
                "fast",

            "model_3d":
                None,
        },

        "zones":
            _fast_zones(
                gondolas,
                raw_thresholds,
                sx,
                sz,
                width,
                height,
            ),

        "gondolas":
            gondolas,

        "thresholds":
            thresholds,

        "auto_zones":
            True,
    }


def _fast_output_configuration(
    process_config: dict,
    width: int,
    height: int,
) -> dict:

    zones = []

    for zone in process_config.get(
        "zones",
        [],
    ):

        polygon = (
            zone.get(
                "polygon"
            )
            or []
        )

        zones.append(
            {
                **zone,

                "polygon": [
                    [
                        round(
                            x / width,
                            6,
                        ),
                        round(
                            y / height,
                            6,
                        ),
                    ]

                    for x, y
                    in polygon
                ],
            }
        )

    gondolas = []

    for gondola in process_config.get(
        "gondolas",
        [],
    ):

        gondolas.append(
            {
                **gondola,

                "x":
                    round(
                        gondola["x"]
                        / width,
                        6,
                    ),

                "z":
                    round(
                        gondola["z"]
                        / height,
                        6,
                    ),

                "width":
                    round(
                        gondola["width"]
                        / width,
                        6,
                    ),

                "depth":
                    round(
                        gondola["depth"]
                        / height,
                        6,
                    ),

                "tier_heights": [
                    round(
                        tier /
                        height,
                        6,
                    )

                    for tier
                    in gondola.get(
                        "tier_heights",
                        [],
                    )
                ],
            }
        )

    return {
        "version":
            process_config.get(
                "version",
                1,
            ),

        "units":
            "normalized",

        "analysis_mode":
            "fast",

        "floor": {
            "width":
                1.0,

            "depth":
                1.0,

            "units":
                "normalized",
        },

        "camera": {
            "name":
                (
                    process_config.get(
                        "camera"
                    )
                    or {}
                ).get(
                    "name",
                    "Cámara",
                ),

            "source_normalized": [
                [0.0, 0.0],
                [1.0, 0.0],
                [1.0, 1.0],
                [0.0, 1.0],
            ],

            "target_meters": [
                [0.0, 0.0],
                [1.0, 0.0],
                [1.0, 1.0],
                [0.0, 1.0],
            ],

            "calibration_status":
                "fast",

            "model_3d":
                None,
        },

        "zones":
            zones,

        "gondolas":
            gondolas,

        "thresholds":
            process_config.get(
                "thresholds",
                {},
            ),

        "auto_zones":
            True,
    }


# =========================================================
# ROI
# =========================================================


def _roi_to_pixel_polygon(
    roi: list[list[float]],
    width: int,
    height: int,
) -> np.ndarray:

    return np.float32(
        [
            [
                x * width,
                y * height,
            ]

            for x, y
            in roi
        ]
    )


# =========================================================
# SALIDA
# =========================================================


def _exposed_point(
    point: list[float],
    mode: str,
    width: int,
    height: int,
) -> list[float]:

    if mode == "fast":
        return [
            round(
                float(
                    point[0]
                )
                / width,
                6,
            ),

            round(
                float(
                    point[1]
                )
                / height,
                6,
            ),
        ]

    return [
        float(
            point[0]
        ),

        float(
            point[1]
        ),
    ]


def _exposed_gondola(
    gondola: dict,
    mode: str,
    width: int,
    height: int,
) -> dict:

    if mode != "fast":
        return gondola

    return {
        **gondola,

        "x":
            round(
                float(
                    gondola["x"]
                )
                / width,
                6,
            ),

        "z":
            round(
                float(
                    gondola["z"]
                )
                / height,
                6,
            ),

        "width":
            round(
                float(
                    gondola["width"]
                )
                / width,
                6,
            ),

        "depth":
            round(
                float(
                    gondola["depth"]
                )
                / height,
                6,
            ),

        "height":
            0.22,

        "tier_heights": [
            0.06,
            0.13,
            0.2,
        ],

        "pickup_events": [
            {
                **event,

                "x":
                    round(
                        float(
                            event["x"]
                        )
                        / width,
                        6,
                    ),

                "z":
                    round(
                        float(
                            event["z"]
                        )
                        / height,
                        6,
                    ),
            }

            for event
            in gondola.get(
                "pickup_events",
                [],
            )
        ],
    }


# =========================================================
# ACTUALIZAR ANÁLISIS
# =========================================================


def update_analysis(
    analysis_id: str,
    **values,
) -> None:
    """
    Actualiza un análisis.

    IMPORTANTE:
    Si ya existe una solicitud de cancelación,
    evita que el pipeline vuelva accidentalmente
    a poner status='processing'.
    """

    with SessionLocal() as database:

        analysis = database.get(
            Analysis,
            analysis_id,
        )

        if not analysis:
            return

        # -------------------------------------------------
        # PROTEGER ESTADO DE CANCELACIÓN
        # -------------------------------------------------

        if (
            analysis.status
            in {
                "cancelling",
                "cancelled",
            }
            and values.get(
                "status"
            )
            not in {
                "cancelled",
            }
        ):
            return

        for key, value in values.items():
            setattr(
                analysis,
                key,
                value,
            )

        database.commit()


# =========================================================
# MANOS
# =========================================================


def project_hand(
    spatial: SpatialEngine,
    detection: dict,
) -> tuple[
    list[float] | None,
    bool,
]:

    car = detection.get(
        "floor_point"
    )

    if (
        not car
        or not spatial.configuration.get(
            "gondolas"
        )
    ):
        return (
            None,
            False,
        )

    active = min(
        spatial.configuration[
            "gondolas"
        ],
        key=lambda item:
            SpatialEngine
            .distance_to_gondola(
                car,
                item,
            ),
    )

    real_hands = detection.get(
        "hand_points_real"
    )

    if real_hands:

        real_candidates = []

        for hand in real_hands:

            if (
                hand[0] <= 0
                or hand[1] <= 0
            ):
                continue

            projected = spatial.project(
                hand
            )

            if projected:
                real_candidates.append(
                    (
                        SpatialEngine
                        .distance_to_gondola(
                            projected,
                            active,
                        ),

                        projected,
                    )
                )

        real_candidates.sort(
            key=lambda item:
                item[0]
        )

        if real_candidates:
            return (
                real_candidates[
                    0
                ][1],
                True,
            )

    candidates = []

    for hand in detection.get(
        "hand_points",
        [],
    ):

        projected = spatial.project(
            hand
        )

        if projected:
            candidates.append(
                (
                    SpatialEngine
                    .distance_to_gondola(
                        projected,
                        active,
                    ),

                    projected,
                )
            )

    candidates.sort(
        key=lambda item:
            item[0]
    )

    if candidates:

        best_distance, best_point = (
            candidates[0]
        )

        if (
            best_distance
            <= float(
                spatial.configuration
                .get(
                    "thresholds",
                    {},
                )
                .get(
                    "approach_m",
                    1.5,
                )
                or 1.5
            )
        ):
            return (
                best_point,
                False,
            )

    body_distance = (
        SpatialEngine
        .distance_to_gondola(
            car,
            active,
        )
    )

    proxy_reach = max(
        0.25,

        float(
            spatial.configuration
            .get(
                "thresholds",
                {},
            )
            .get(
                "engaged_m",
                0.8,
            )
            or 0.8
        )
        * 0.55,
    )

    if (
        body_distance
        <= proxy_reach
    ):
        return (
            SpatialEngine
            .nearest_point_on_gondola(
                car,
                active,
            ),

            False,
        )

    return (
        None,
        False,
    )


# =========================================================
# FINDINGS
# =========================================================


def build_findings(
    gondolas: list[dict],
    zones: list[dict],
    interactions: int,
    pickups: int = 0,
) -> list[dict]:

    findings = []

    active = max(
        gondolas,
        key=lambda item:
            item[
                "dwell_seconds"
            ],
        default=None,
    )

    if (
        active
        and active[
            "dwell_seconds"
        ] > 0
    ):
        findings.append(
            {
                "type":
                    "evidence",

                "title":
                    (
                        "Mayor permanencia en "
                        f"{active['name']}"
                    ),

                "detail":
                    (
                        f"{active['dwell_seconds']:.1f} "
                        "segundos acumulados de "
                        "presencia detectada."
                    ),
            }
        )

    zone = max(
        zones,
        key=lambda item:
            item[
                "dwell_seconds"
            ],
        default=None,
    )

    if (
        zone
        and zone[
            "dwell_seconds"
        ] > 0
    ):
        findings.append(
            {
                "type":
                    "evidence",

                "title":
                    (
                        "Zona dominante: "
                        f"{zone['name']}"
                    ),

                "detail":
                    (
                        f"Concentra {zone['dwell_seconds']:.1f} "
                        "segundos de ocupación rastreada."
                    ),
            }
        )

    if pickups == 0:

        findings.append(
            {
                "type":
                    "quality",

                "title":
                    "Sin pick-ups inferidos",

                "detail":
                    (
                        "Ninguna mano estimada se acercó "
                        "a las góndolas durante los engagement "
                        "detectados. Solo presencia y posible "
                        "revisión, sin extensión de brazo hacia "
                        "el producto."
                    ),
            }
        )

    elif active:

        findings.append(
            {
                "type":
                    "recommendation",

                "title":
                    (
                        f"{pickups} pick-ups "
                        "probables detectados"
                    ),

                "detail":
                    (
                        f"Prevalecen en {active['name']}; "
                        "revisar disposición, señalética y "
                        "stock de los productos con más "
                        "aproximaciones de mano."
                    ),
            }
        )

    if interactions == 0:

        findings.append(
            {
                "type":
                    "quality",

                "title":
                    "Sin interacción inferible",

                "detail":
                    (
                        "Ninguna trayectoria cumplió "
                        "simultáneamente los umbrales "
                        "configurados de proximidad, "
                        "velocidad y tiempo."
                    ),
            }
        )

    return findings


# =========================================================
# PIPELINE PRINCIPAL
# =========================================================


def run_analysis(
    analysis_id: str,
    configuration: dict | None = None,
    site_id: int | None = None,
    roi: list[list[float]] | None = None,
) -> None:
    """
    Procesa un análisis.

    La cancelación se comprueba:
    - antes de iniciar;
    - antes y después de cargar el modelo;
    - al adquirir el lock de inferencia;
    - durante el procesamiento de frames;
    - antes de generar heatmaps;
    - antes de construir resultados;
    - antes de marcar como completado.
    """

    capture = None
    anonymized_writer = None

    try:
        # =================================================
        # CANCELACIÓN ANTES DE COMENZAR
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        # =================================================
        # CARGAR ANÁLISIS Y SEDE
        # =================================================

        with SessionLocal() as database:

            analysis = database.get(
                Analysis,
                analysis_id,
            )

            sort_site = (
                database.get(
                    Site,
                    site_id,
                )
                if site_id
                else (
                    database.get(
                        Site,
                        analysis.site_id,
                    )
                    if analysis
                    else None
                )
            )

            if (
                not analysis
                or not sort_site
            ):
                raise ValueError(
                    "El análisis o la sede ya no existen"
                )

            video_path = Path(
                analysis.video_path
            )

            site = sort_site

            site_configuration = (
                configuration
                if configuration
                is not None
                else site.configuration
            )

            configuration = (
                site_configuration
            )

        # =================================================
        # CANCELACIÓN ANTES DE METADATOS
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        update_analysis(
            analysis_id,
            status="processing",
            stage="metadata",
            progress=2,
            message=(
                "Leyendo metadatos del video"
            ),
        )

        # =================================================
        # ABRIR VIDEO
        # =================================================

        capture = cv2.VideoCapture(
            str(
                video_path
            )
        )

        if not capture.isOpened():
            raise ValueError(
                "OpenCV no pudo abrir el MP4"
            )

        fps = float(
            capture.get(
                cv2.CAP_PROP_FPS
            )
        )

        total_frames = int(
            capture.get(
                cv2.CAP_PROP_FRAME_COUNT
            )
        )

        width = int(
            capture.get(
                cv2.CAP_PROP_FRAME_WIDTH
            )
        )

        height = int(
            capture.get(
                cv2.CAP_PROP_FRAME_HEIGHT
            )
        )

        if (
            fps <= 0
            or total_frames <= 0
            or width <= 0
            or height <= 0
        ):
            raise ValueError(
                (
                    "El video no contiene FPS, "
                    "duración o resolución válidos"
                )
            )

        ensure_not_cancelled(
            analysis_id
        )

        # =================================================
        # MODO DE ANÁLISIS
        # =================================================

        mode = analysis_mode(
            configuration
        )

        advanced = (
            mode == "advanced"
        )

        process_config = (
            configuration
            if advanced
            else _fast_process_configuration(
                configuration,
                width,
                height,
            )
        )

        output_config = (
            configuration
            if advanced
            else _fast_output_configuration(
                process_config,
                width,
                height,
            )
        )

        # =================================================
        # ZONAS AUTOMÁTICAS ADVANCED
        # =================================================

        if (
            advanced
            and not (
                process_config.get(
                    "zones"
                )
                or []
            )
        ):

            thresholds = (
                configuration.get(
                    "thresholds"
                )
                or {}
            )

            approach_m = float(
                thresholds.get(
                    "approach_m",
                    1.5,
                )
                or 1.5
            )

            floor = (
                configuration.get(
                    "floor"
                )
                or {}
            )

            auto_zones = (
                _auto_gondola_zones(
                    configuration.get(
                        "gondolas",
                        [],
                    ),
                    margin_x=
                        approach_m,
                )
            )

            if not auto_zones:

                auto_zones = (
                    _auto_fast_zones(
                        float(
                            floor.get(
                                "width",
                                12.0,
                            )
                            or 12.0
                        ),

                        float(
                            floor.get(
                                "depth",
                                8.0,
                            )
                            or 8.0
                        ),
                    )
                )

            process_config = {
                **configuration,

                "zones":
                    auto_zones,

                "auto_zones":
                    True,
            }

            output_config = (
                process_config
            )

        roi_pixels = (
            _roi_to_pixel_polygon(
                roi,
                width,
                height,
            )
            if roi
            else None
        )

        # =================================================
        # PREPARAR MODELO
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        update_analysis(
            analysis_id,
            stage="model",
            progress=5,
            message=(
                "Preparando detección y seguimiento "
                "(YOLO + ByteTrack)"
            ),
        )

        ensure_not_cancelled(
            analysis_id
        )

        try:
            detector = (
                get_person_detector(
                    detection_only=False
                )
            )

            has_pose = True

        except Exception:
            detector = (
                get_person_detector(
                    detection_only=True
                )
            )

            has_pose = False

        ensure_not_cancelled(
            analysis_id
        )

        detector.reset_tracker()

        # =================================================
        # BARRAS NEGRAS
        # =================================================

        capture.set(
            cv2.CAP_PROP_POS_FRAMES,
            0,
        )

        ret, first_frame = (
            capture.read()
        )

        if ret:

            bars_info = (
                detect_black_bars(
                    first_frame
                )
            )

            if bars_info[
                "has_bars"
            ]:

                update_analysis(
                    analysis_id,
                    stage="preprocessing",
                    progress=7,
                    message=(
                        "Márgenes negros detectados: "
                        f"{bars_info['top']}/"
                        f"{bars_info['bottom']}/"
                        f"{bars_info['left']}/"
                        f"{bars_info['right']}px - "
                        "se ignorarán las detecciones "
                        "en los márgenes"
                    ),
                )

                process_config = {
                    **process_config,

                    "camera": {
                        **process_config[
                            "camera"
                        ],

                        "crop_info":
                            bars_info,
                    },
                }

                if advanced:
                    output_config = (
                        process_config
                    )

            capture.set(
                cv2.CAP_PROP_POS_FRAMES,
                0,
            )

        ensure_not_cancelled(
            analysis_id
        )

        # =================================================
        # ENGINES
        # =================================================

        spatial = SpatialEngine(
            process_config,
            width,
            height,
        )

        interactions = (
            InteractionEngine(
                process_config
            )
        )

        track_stabilizer = (
            TrackStabilizer()
        )

        result_dir = (
            Path(__file__)
            .resolve()
            .parents[2]
            / "data"
            / "results"
            / analysis_id
        )

        result_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        anonymized_video_name = "anonymized.mp4"
        anonymized_video_path = (
            result_dir
            / anonymized_video_name
        )

        if BLUR_FACES:
            anonymized_writer = AnonymizedVideoWriter(
                anonymized_video_path,
                fps,
                width,
                height,
            )

        # =================================================
        # ACUMULADORES
        # =================================================

        trajectories: dict[
            int,
            list[list[float]],
        ] = defaultdict(
            list
        )

        track_frames: dict[
            int,
            int,
        ] = defaultdict(
            int
        )

        zone_stats: dict[
            str,
            dict,
        ] = {
            zone["id"]: {
                "track_ids":
                    set(),

                "dwell_seconds":
                    0.0,

                "interactions":
                    0,
            }

            for zone
            in process_config.get(
                "zones",
                [],
            )
        }

        traffic_points: list[dict] = []
        dwell_points: list[dict] = []
        interaction_points: list[dict] = []
        pickup_points: list[dict] = []

        interaction_events: list[dict] = []
        pickup_events: list[dict] = []

        behavior_trace = {
            "zone_hits":
                0,

            "near_gondola_frames":
                0,

            "engaged_frames":
                0,

            "interaction_frames":
                0,

            "hand_candidate_frames":
                0,

            "pickup_frames":
                0,
        }

        last_interaction: dict[
            int,
            bool,
        ] = defaultdict(
            bool
        )

        gondola_names = {
            item["id"]:
                item.get(
                    "name",
                    item["id"],
                )

            for item
            in process_config.get(
                "gondolas",
                [],
            )
        }

        frame_samples: list[dict] = []

        evidence: list[str] = []

        evidence_frames: list = []

        evidence_targets = {
            round(
                index
                * max(
                    0,
                    total_frames - 1,
                )
                / 5
            )

            for index
            in range(6)
        }

        payload_every = max(
            1,
            round(
                fps / 5
            ),
        )

        total_detections = 0
        peak_presence = 0

        slice_count = max(
            1,

            min(
                8,

                round(
                    total_frames
                    /
                    max(
                        1,
                        round(
                            fps * 5
                        ),
                    )
                ),
            ),
        )

        slice_size = (
            total_frames
            / slice_count
        )

        slice_buckets = {
            "traffic": [
                []
                for _
                in range(
                    slice_count
                )
            ],

            "dwell": [
                []
                for _
                in range(
                    slice_count
                )
            ],

            "interaction": [
                []
                for _
                in range(
                    slice_count
                )
            ],

            "pickup": [
                []
                for _
                in range(
                    slice_count
                )
            ],
        }

        crop_info = (
            process_config[
                "camera"
            ].get(
                "crop_info"
            )
        )

        bar_left = (
            crop_info["left"]
            if (
                crop_info
                and crop_info[
                    "has_bars"
                ]
            )
            else 0
        )

        bar_right = (
            width
            - crop_info[
                "right"
            ]
            if (
                crop_info
                and crop_info[
                    "has_bars"
                ]
            )
            else width
        )

        bar_top = (
            crop_info["top"]
            if (
                crop_info
                and crop_info[
                    "has_bars"
                ]
            )
            else 0
        )

        bar_bottom = (
            height
            - crop_info[
                "bottom"
            ]
            if (
                crop_info
                and crop_info[
                    "has_bars"
                ]
            )
            else height
        )

        # =================================================
        # FRECUENCIA DE REVISIÓN DE CANCELACIÓN
        # =================================================
        #
        # Se consulta aproximadamente cada medio segundo
        # para no golpear SQLite en absolutamente cada frame.
        # =================================================

        cancel_check_every = max(
            1,
            round(
                fps / 2
            ),
        )

        frame_index = 0

        # =================================================
        # INFERENCIA
        # =================================================

        with inference_lock:

            # Es posible que haya solicitado cancelar
            # mientras esperaba el lock.
            ensure_not_cancelled(
                analysis_id
            )

            while True:

                # -----------------------------------------
                # REVISAR CANCELACIÓN
                # -----------------------------------------

                if (
                    frame_index
                    % cancel_check_every
                    == 0
                ):
                    ensure_not_cancelled(
                        analysis_id
                    )

                ok, frame = (
                    capture.read()
                )

                if not ok:
                    break

                prediction, detections = (
                    detector.track(
                        frame
                    )
                )

                privacy_frame = (
                    blur_detection_faces(
                        frame,
                        detections,
                    )
                    if BLUR_FACES
                    else frame
                )

                if anonymized_writer is not None:
                    anonymized_writer.write(
                        privacy_frame
                    )

                timestamp = (
                    frame_index /
                    fps
                )

                dt = (
                    1 /
                    fps
                )

                active_this_frame = set()

                sample_detections = []

                valid_detections = []

                # =================================================
                # PRIMERA PASADA
                # =================================================

                for detection in detections:

                    feet_x, feet_y = (
                        detection[
                            "image_point"
                        ]
                    )

                    if not (
                        bar_left
                        < feet_x
                        < bar_right

                        and

                        bar_top
                        < feet_y
                        < bar_bottom
                    ):
                        continue

                    if (
                        roi_pixels
                        is not None
                        and cv2.pointPolygonTest(
                            roi_pixels,
                            (
                                feet_x,
                                feet_y,
                            ),
                            False,
                        )
                        < 0
                    ):
                        continue

                    floor_point = (
                        spatial.project(
                            detection[
                                "image_point"
                            ]
                        )
                    )

                    if not floor_point:
                        continue

                    detection[
                        "floor_point"
                    ] = floor_point

                    valid_detections.append(
                        detection
                    )

                # =================================================
                # ESTABILIZAR TRACKS
                # =================================================

                track_stabilizer.update(
                    valid_detections,
                    timestamp,
                    frame_index,
                    frame,
                )

                for detection in valid_detections:

                    detection[
                        "track_id"
                    ] = detection[
                        "person_id"
                    ]

                # =================================================
                # PROCESAR DETECCIONES
                # =================================================

                for detection in valid_detections:

                    if (
                        has_pose
                        and mode
                        == "advanced"
                    ):

                        detection[
                            "keypoints_3d"
                        ] = (
                            project_keypoints_to_3d_v2(
                                detection.get(
                                    "keypoints"
                                ),

                                detection[
                                    "image_point"
                                ],

                                detection[
                                    "bbox"
                                ],

                                spatial,
                            )
                        )

                    else:

                        detection[
                            "keypoints_3d"
                        ] = None

                    (
                        hand_point,
                        pose_verified,
                    ) = project_hand(
                        spatial,
                        detection,
                    )

                    detection[
                        "hand_pose_verified"
                    ] = pose_verified

                    behavior = (
                        interactions.observe(
                            detection,
                            timestamp,
                            dt,
                            height,
                            hand_point=
                                hand_point,
                        )
                    )

                    total_detections += 1

                    active_this_frame.add(
                        detection[
                            "track_id"
                        ]
                    )

                    track_frames[
                        detection[
                            "track_id"
                        ]
                    ] += 1

                    zone = (
                        spatial.zone_at(
                            detection[
                                "floor_point"
                            ]
                        )
                    )

                    if zone:

                        behavior_trace[
                            "zone_hits"
                        ] += 1

                        zone_entry = (
                            zone_stats.setdefault(
                                zone["id"],
                                {
                                    "track_ids":
                                        set(),

                                    "dwell_seconds":
                                        0.0,

                                    "interactions":
                                        0,
                                },
                            )
                        )

                        zone_entry[
                            "dwell_seconds"
                        ] += dt

                        zone_entry[
                            "track_ids"
                        ].add(
                            detection[
                                "track_id"
                            ]
                        )

                    if behavior[
                        "gondola_id"
                    ]:

                        behavior_trace[
                            "near_gondola_frames"
                        ] += 1

                    if behavior[
                        "state"
                    ] in (
                        "ENGAGED",
                        "INTERACTION",
                    ):

                        behavior_trace[
                            "engaged_frames"
                        ] += 1

                    if behavior[
                        "interaction"
                    ]:

                        behavior_trace[
                            "interaction_frames"
                        ] += 1

                    if (
                        hand_point
                        is not None
                    ):

                        behavior_trace[
                            "hand_candidate_frames"
                        ] += 1

                    # =============================================
                    # MUESTREO DE PAYLOAD
                    # =============================================

                    if (
                        frame_index
                        % payload_every
                        == 0
                    ):

                        timestamped = {
                            "x":
                                detection[
                                    "floor_point"
                                ][0],

                            "z":
                                detection[
                                    "floor_point"
                                ][1],
                        }

                        trajectories[
                            detection[
                                "track_id"
                            ]
                        ].append(
                            detection[
                                "floor_point"
                            ]
                        )

                        traffic_points.append(
                            {
                                **timestamped,
                                "weight":
                                    1,
                            }
                        )

                        dwell_weight = (
                            max(
                                dt,
                                0.01,
                            )
                            * (
                                1.5
                                if behavior[
                                    "speed"
                                ] < 0.6
                                else 0.5
                            )
                        )

                        dwell_points.append(
                            {
                                **timestamped,
                                "weight":
                                    dwell_weight,
                            }
                        )

                        slice_index = min(
                            slice_count - 1,

                            int(
                                frame_index
                                /
                                slice_size
                            ),
                        )

                        slice_buckets[
                            "traffic"
                        ][
                            slice_index
                        ].append(
                            {
                                **timestamped,
                                "weight":
                                    1,
                            }
                        )

                        slice_buckets[
                            "dwell"
                        ][
                            slice_index
                        ].append(
                            {
                                **timestamped,
                                "weight":
                                    dwell_weight,
                            }
                        )

                        sample_detections.append(
                            {
                                "track_id":
                                    detection[
                                        "track_id"
                                    ],

                                "bbox":
                                    detection[
                                        "bbox"
                                    ],

                                "confidence":
                                    detection[
                                        "confidence"
                                    ],

                                "floor_point":
                                    _exposed_point(
                                        detection[
                                            "floor_point"
                                        ],
                                        mode,
                                        width,
                                        height,
                                    ),

                                "state":
                                    behavior[
                                        "state"
                                    ],

                                "gondola_id":
                                    behavior[
                                        "gondola_id"
                                    ],

                                "keypoints_3d":
                                    detection[
                                        "keypoints_3d"
                                    ],
                            }
                        )

                    # =============================================
                    # INTERACCIONES
                    # =============================================

                    if behavior[
                        "interaction"
                    ]:

                        if zone:

                            zone_stats.setdefault(
                                zone["id"],
                                {
                                    "track_ids":
                                        set(),

                                    "dwell_seconds":
                                        0.0,

                                    "interactions":
                                        0,
                                },
                            )[
                                "interactions"
                            ] += 1

                        interaction_points.append(
                            {
                                "x":
                                    detection[
                                        "floor_point"
                                    ][0],

                                "z":
                                    detection[
                                        "floor_point"
                                    ][1],

                                "weight":
                                    1,

                                "t":
                                    round(
                                        timestamp,
                                        2,
                                    ),
                            }
                        )

                        if not last_interaction[
                            detection[
                                "track_id"
                            ]
                        ]:

                            interaction_events.append(
                                {
                                    "t":
                                        round(
                                            timestamp,
                                            2,
                                        ),

                                    "track_id":
                                        detection[
                                            "track_id"
                                        ],

                                    "x":
                                        detection[
                                            "floor_point"
                                        ][0],

                                    "z":
                                        detection[
                                            "floor_point"
                                        ][1],

                                    "gondola_id":
                                        behavior[
                                            "gondola_id"
                                        ],

                                    "gondola_name":
                                        gondola_names.get(
                                            behavior[
                                                "gondola_id"
                                            ],

                                            behavior[
                                                "gondola_id"
                                            ],
                                        ),
                                }
                            )

                        last_interaction[
                            detection[
                                "track_id"
                            ]
                        ] = True

                        slice_buckets[
                            "interaction"
                        ][
                            min(
                                slice_count - 1,

                                int(
                                    frame_index
                                    /
                                    slice_size
                                ),
                            )
                        ].append(
                            {
                                "x":
                                    detection[
                                        "floor_point"
                                    ][0],

                                "z":
                                    detection[
                                        "floor_point"
                                    ][1],

                                "weight":
                                    1,
                            }
                        )

                    else:

                        last_interaction[
                            detection[
                                "track_id"
                            ]
                        ] = False

                    # =============================================
                    # PICKUPS
                    # =============================================

                    if (
                        behavior[
                            "pickup"
                        ]
                        and hand_point
                        is not None
                    ):

                        behavior_trace[
                            "pickup_frames"
                        ] += 1

                        pickup_points.append(
                            {
                                "x":
                                    hand_point[
                                        0
                                    ],

                                "z":
                                    hand_point[
                                        1
                                    ],

                                "weight":
                                    1,

                                "t":
                                    round(
                                        timestamp,
                                        2,
                                    ),
                            }
                        )

                        slice_buckets[
                            "pickup"
                        ][
                            min(
                                slice_count - 1,

                                int(
                                    frame_index
                                    /
                                    slice_size
                                ),
                            )
                        ].append(
                            {
                                "x":
                                    hand_point[
                                        0
                                    ],

                                "z":
                                    hand_point[
                                        1
                                    ],

                                "weight":
                                    1,
                            }
                        )

                        pickup_events.append(
                            {
                                "t":
                                    round(
                                        timestamp,
                                        2,
                                    ),

                                "track_id":
                                    detection[
                                        "track_id"
                                    ],

                                "x":
                                    hand_point[
                                        0
                                    ],

                                "z":
                                    hand_point[
                                        1
                                    ],

                                "gondola_id":
                                    behavior[
                                        "gondola_id"
                                    ],

                                "gondola_name":
                                    gondola_names.get(
                                        behavior[
                                            "gondola_id"
                                        ],

                                        behavior[
                                            "gondola_id"
                                        ],
                                    ),

                                "pose_verified":
                                    bool(
                                        pose_verified
                                    ),
                            }
                        )

                # =================================================
                # ESTADÍSTICAS DEL FRAME
                # =================================================

                peak_presence = max(
                    peak_presence,
                    len(
                        active_this_frame
                    ),
                )

                if sample_detections:

                    frame_samples.append(
                        {
                            "frame":
                                frame_index,

                            "timestamp":
                                round(
                                    timestamp,
                                    2,
                                ),

                            "detections":
                                sample_detections,
                        }
                    )

                # =================================================
                # FRAMES DE EVIDENCIA
                # =================================================

                if (
                    frame_index
                    in evidence_targets
                ):

                    name = (
                        f"frame_{len(evidence) + 1}.jpg"
                    )

                    evidence_frame = (
                        prediction.plot()
                    )

                    if BLUR_FACES:
                        evidence_frame = blur_detection_faces(
                            evidence_frame,
                            detections,
                        )

                    cv2.imwrite(
                        str(
                            result_dir
                            / name
                        ),

                        evidence_frame,
                    )

                    evidence.append(
                        name
                    )

                    evidence_frames.append(
                        privacy_frame.copy()
                    )

                # =================================================
                # ACTUALIZAR PROGRESO
                # =================================================

                if (
                    frame_index
                    % max(
                        1,
                        round(
                            fps
                        ),
                    )
                    == 0
                ):

                    ensure_not_cancelled(
                        analysis_id
                    )

                    progress = min(
                        88,

                        8
                        + int(
                            (
                                frame_index
                                + 1
                            )
                            /
                            total_frames
                            *
                            80
                        ),
                    )

                    update_analysis(
                        analysis_id,
                        stage="tracking",
                        progress=
                            progress,

                        message=(
                            "YOLO + ByteTrack · "
                            f"frame {frame_index + 1}/"
                            f"{total_frames}"
                        ),
                    )

                frame_index += 1

        if anonymized_writer is not None:
            anonymized_writer.release()
            anonymized_writer = None

        # =================================================
        # CANCELACIÓN ANTES DE HEATMAPS
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        update_analysis(
            analysis_id,
            stage="heatmaps",
            progress=92,
            message=(
                "Generando mapas espaciales"
            ),
        )

        # =================================================
        # HEATMAPS
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        create_floor_heatmap(
            traffic_points,
            process_config[
                "floor"
            ],
            result_dir
            / "traffic.png",
        )

        ensure_not_cancelled(
            analysis_id
        )

        create_floor_heatmap(
            dwell_points,
            process_config[
                "floor"
            ],
            result_dir
            / "dwell.png",
        )

        ensure_not_cancelled(
            analysis_id
        )

        create_floor_heatmap(
            interaction_points,
            process_config[
                "floor"
            ],
            result_dir
            / "interaction.png",
        )

        ensure_not_cancelled(
            analysis_id
        )

        create_floor_heatmap(
            pickup_points,
            process_config[
                "floor"
            ],
            result_dir
            / "pickup.png",
        )

        # =================================================
        # OVERLAYS
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        homography_inv = (
            spatial
            .homography_norm_inv
            .round(6)
            .tolist()
        )

        overlay_names: dict[
            str,
            list[str],
        ] = {}

        for index, raw_frame in enumerate(
            evidence_frames,
            start=1,
        ):

            ensure_not_cancelled(
                analysis_id
            )

            for metric, point_source in (
                (
                    "traffic",
                    traffic_points,
                ),
                (
                    "dwell",
                    dwell_points,
                ),
                (
                    "interaction",
                    interaction_points,
                ),
                (
                    "pickup",
                    pickup_points,
                ),
            ):

                if (
                    metric
                    in (
                        "interaction",
                        "pickup",
                    )
                    and not point_source
                ):
                    continue

                blended = (
                    overlay_heatmap_on_frame(
                        point_source,
                        process_config[
                            "floor"
                        ],
                        homography_inv,
                        raw_frame,
                    )
                )

                filename = (
                    f"overlay_{metric}_{index}.jpg"
                )

                cv2.imwrite(
                    str(
                        result_dir
                        / filename
                    ),
                    blended,
                )

                overlay_names.setdefault(
                    metric,
                    [],
                ).append(
                    filename
                )

        # =================================================
        # SLICES
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        slices_meta: list[
            dict
        ] = []

        for index in range(
            slice_count
        ):

            ensure_not_cancelled(
                analysis_id
            )

            start = round(
                index
                * slice_size
                / fps,
                1,
            )

            end = round(
                min(
                    (
                        index +
                        1
                    )
                    * slice_size,

                    total_frames,
                )
                / fps,
                1,
            )

            entry = {
                "index":
                    index,

                "start":
                    start,

                "end":
                    end,
            }

            for metric in (
                "traffic",
                "dwell",
                "interaction",
                "pickup",
            ):

                filename = (
                    f"time_{index}_{metric}.png"
                )

                create_floor_heatmap(
                    slice_buckets[
                        metric
                    ][
                        index
                    ],

                    process_config[
                        "floor"
                    ],

                    result_dir
                    / filename,
                )

                entry[
                    metric
                ] = (
                    filename
                    if slice_buckets[
                        metric
                    ][
                        index
                    ]
                    else None
                )

            slices_meta.append(
                entry
            )

        # =================================================
        # RESULTADOS GÓNDOLAS
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        gondolas = (
            interactions.results()
        )

        gondola_config = {
            item["id"]:
                item

            for item
            in process_config.get(
                "gondolas",
                [],
            )
        }

        for gondola in gondolas:

            config = (
                gondola_config.get(
                    gondola[
                        "id"
                    ],
                    {},
                )
            )

            gondola[
                "height"
            ] = config.get(
                "height",
                1.45,
            )

            gondola[
                "tier_heights"
            ] = config.get(
                "tier_heights",
                [
                    0.25,
                    0.73,
                    1.20,
                ],
            )

        gondolas = [
            _exposed_gondola(
                gondola,
                mode,
                width,
                height,
            )

            for gondola
            in gondolas
        ]

        # =================================================
        # ZONAS
        # =================================================

        duration_seconds = (
            total_frames /
            fps
        )

        zones = (
            compute_zone_metrics(
                zone_stats,
                output_config.get(
                    "zones",
                    [],
                ),
                duration_seconds=
                    duration_seconds,
                mode=
                    mode,
            )
        )

        minimum_track_frames = max(
            2,

            round(
                fps
                *
                process_config
                .get(
                    "thresholds",
                    {},
                )
                .get(
                    "minimum_track_seconds",
                    2.0,
                )
            ),
        )

        valid_track_ids = {
            track_id

            for track_id, count
            in track_frames.items()

            if count
            >= minimum_track_frames
        }

        trajectory_payload = [
            {
                "track_id":
                    track_id,

                "points": [
                    _exposed_point(
                        point,
                        mode,
                        width,
                        height,
                    )

                    for point
                    in points
                ],
            }

            for track_id, points
            in trajectories.items()

            if (
                track_id
                in valid_track_ids

                and

                len(points) > 1
            )
        ]

        interaction_count = sum(
            item[
                "interactions"
            ]

            for item
            in gondolas
        )

        # =================================================
        # HISTOGRAMA INTERACCIONES
        # =================================================

        histogram = None

        if interaction_events:

            bucket_s = max(
                10,

                round(
                    duration_seconds
                    / 12
                ),
            )

            bucket_count = max(
                1,

                math.ceil(
                    duration_seconds
                    / bucket_s
                ),
            )

            counts = [
                0
            ] * bucket_count

            for event in interaction_events:

                counts[
                    min(
                        bucket_count - 1,

                        int(
                            event[
                                "t"
                            ]
                            //
                            bucket_s
                        ),
                    )
                ] += 1

            histogram = {
                "bucket_seconds":
                    bucket_s,

                "buckets": [
                    {
                        "index":
                            index,

                        "start":
                            index
                            * bucket_s,

                        "end":
                            min(
                                (
                                    index +
                                    1
                                )
                                * bucket_s,

                                duration_seconds,
                            ),

                        "count":
                            count,
                    }

                    for index, count
                    in enumerate(
                        counts
                    )
                ],
            }

        interaction_events.sort(
            key=lambda event:
                event["t"]
        )

        interaction_events_log = (
            interaction_events[
                :400
            ]
        )

        # =================================================
        # PICKUPS
        # =================================================

        pickup_count = sum(
            item[
                "pickups"
            ]

            for item
            in gondolas
        )

        pickup_events = []

        for gondola in gondolas:

            for event in gondola.get(
                "pickup_events",
                [],
            ):

                pickup_events.append(
                    {
                        **event,

                        "gondola_id":
                            gondola[
                                "id"
                            ],

                        "gondola_name":
                            gondola.get(
                                "name",
                                gondola[
                                    "id"
                                ],
                            ),
                    }
                )

        pickup_histogram = None

        if pickup_events:

            bucket_s = max(
                10,

                round(
                    duration_seconds
                    / 12
                ),
            )

            bucket_count = max(
                1,

                math.ceil(
                    duration_seconds
                    / bucket_s
                ),
            )

            counts = [
                0
            ] * bucket_count

            for event in pickup_events:

                counts[
                    min(
                        bucket_count - 1,

                        int(
                            event[
                                "t"
                            ]
                            //
                            bucket_s
                        ),
                    )
                ] += 1

            pickup_histogram = {
                "bucket_seconds":
                    bucket_s,

                "buckets": [
                    {
                        "index":
                            index,

                        "start":
                            index
                            * bucket_s,

                        "end":
                            min(
                                (
                                    index +
                                    1
                                )
                                * bucket_s,

                                duration_seconds,
                            ),

                        "count":
                            count,
                    }

                    for index, count
                    in enumerate(
                        counts
                    )
                ],
            }

        pickup_events.sort(
            key=lambda event:
                event["t"]
        )

        pickup_events_log = (
            pickup_events[
                :400
            ]
        )

        # =================================================
        # VELOCIDAD
        # =================================================

        sample_dt = (
            payload_every /
            fps
        )

        track_speeds = []

        for points in trajectories.values():

            if len(points) < 2:
                continue

            speeds = [
                math.dist(
                    points[i],
                    points[
                        i - 1
                    ],
                )
                /
                sample_dt

                for i in range(
                    1,
                    len(points),
                )

                if (
                    points[i]
                    != points[
                        i - 1
                    ]
                )
            ]

            if speeds:

                track_speeds.append(
                    sum(
                        speeds
                    )
                    /
                    len(
                        speeds
                    )
                )

        average_speed = (
            round(
                sum(
                    track_speeds
                )
                /
                len(
                    track_speeds
                ),
                2,
            )
            if track_speeds
            else 0.0
        )

        if mode == "fast":

            average_speed_normalized = (
                round(
                    average_speed
                    /
                    max(
                        width,
                        height,
                    ),
                    6,
                )
                if average_speed
                else 0.0
            )

        else:

            average_speed_normalized = (
                None
            )

        duration_minutes = max(
            0.01,

            (
                total_frames /
                fps
            )
            / 60.0,
        )

        # =================================================
        # RECOMENDACIONES
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        recommendations = (
            build_recommendations(
                zones,
                gondolas,
                mode,
                interaction_events_log=
                    interaction_events_log,
                pickup_events_log=
                    pickup_events_log,
            )
        )

        findings = (
            build_findings(
                gondolas,
                zones,
                interaction_count,
                pickup_count,
            )
            +
            list(
                recommendations
            )
        )

        # =================================================
        # RESULTADO FINAL
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        result = {
            "analysis_mode":
                mode,

            "coordinate_system":
                (
                    "normalized"
                    if mode
                    == "fast"
                    else "meters"
                ),

            "roi":
                roi,

            "site": {
                "id":
                    site.id,

                "name":
                    site.name,

                "city":
                    site.city,

                "configuration":
                    with_homographies(
                        output_config
                    ),
            },

            "video": {
                "fps":
                    round(
                        fps,
                        2,
                    ),

                "duration_seconds":
                    round(
                        total_frames
                        / fps,
                        2,
                    ),

                "width":
                    width,

                "height":
                    height,

                "total_frames":
                    total_frames,

                "processed_frames":
                    frame_index,

                "anonymized":
                    bool(
                        BLUR_FACES
                        and anonymized_video_path.exists()
                    ),

                "served_file":
                    (
                        anonymized_video_name
                        if (
                            BLUR_FACES
                            and anonymized_video_path.exists()
                        )
                        else Path(video_path).name
                    ),
            },

            "model": {
                "detector":
                    "YOLO11n COCO person",

                "pose":
                    (
                        "yolov8n-pose"
                        if has_pose
                        else None
                    ),

                "tracker":
                    "ByteTrack",

                "privacy":
                    "temporary_ids_only",

                "face_anonymization":
                    (
                        "pixelated"
                        if BLUR_FACES
                        else "disabled"
                    ),

                "face_anonymization_intensity":
                    (
                        FACE_BLUR_INTENSITY
                        if BLUR_FACES
                        else 0.0
                    ),

                "custom_behavior_model":
                    False,

                "has_pose":
                    has_pose,
            },

            "metrics": {
                "people_detected":
                    len(
                        valid_track_ids
                    ),

                "tracked_presences":
                    len(
                        valid_track_ids
                    ),

                "track_fragments":
                    len(
                        track_frames
                    ),

                "minimum_track_seconds":
                    round(
                        minimum_track_frames
                        / fps,
                        2,
                    ),

                "detections":
                    total_detections,

                "trajectories":
                    len(
                        trajectory_payload
                    ),

                "interaction_events":
                    interaction_count,

                "pickup_events":
                    pickup_count,

                "average_speed_m_s":
                    (
                        average_speed
                        if mode
                        == "advanced"
                        else 0.0
                    ),

                "average_speed_normalized":
                    (
                        average_speed_normalized
                        if mode
                        == "fast"
                        else None
                    ),

                "flow_per_minute":
                    round(
                        len(
                            valid_track_ids
                        )
                        /
                        duration_minutes,
                        1,
                    ),

                "peak_presence":
                    peak_presence,

                "time_slices":
                    slice_count,

                "behavior_trace":
                    behavior_trace,
            },

            "trajectories":
                trajectory_payload,

            "frame_detections":
                frame_samples,

            "interaction_events_log":
                interaction_events_log,

            "interaction_histogram":
                histogram,

            "pickup_events_log":
                pickup_events_log,

            "pickup_histogram":
                pickup_histogram,

            "gondolas":
                gondolas,

            "zones":
                zones,

            "heatmaps": {
                "traffic":
                    "traffic.png",

                "dwell":
                    "dwell.png",

                "interaction":
                    (
                        "interaction.png"
                        if interaction_points
                        else None
                    ),

                "pickup":
                    (
                        "pickup.png"
                        if pickup_points
                        else None
                    ),

                "overlays":
                    overlay_names,

                "slices":
                    slices_meta,
            },

            "annotated_frames":
                evidence,

            "recommendations":
                recommendations,

            "findings":
                findings,

            "quality": {
                "calibration":
                    process_config[
                        "camera"
                    ].get(
                        "calibration_status",
                        "unknown",
                    ),

                "analysis_mode":
                    mode,

                "coordinate_system":
                    (
                        "normalized"
                        if mode
                        == "fast"
                        else "meters"
                    ),

                "vertical_analysis":
                    "pose_refined_when_available",

                "interaction":
                    (
                        "inferred_from_proximity_speed_and_time"
                        if interaction_points
                        else "insufficient_evidence"
                    ),

                "pickup":
                    "hand_reach_with_pose_keypoints_when_available",
            },
        }

        # =================================================
        # ÚLTIMA COMPROBACIÓN ANTES DE COMPLETAR
        # =================================================

        ensure_not_cancelled(
            analysis_id
        )

        update_analysis(
            analysis_id,
            status="completed",
            stage="results",
            progress=100,
            message=(
                "Análisis espacial completado"
            ),
            result=result,
            duration_seconds=
                result[
                    "video"
                ][
                    "duration_seconds"
                ],
        )

    # =====================================================
    # CANCELACIÓN CONTROLADA
    # =====================================================

    except AnalysisCancelled:

        mark_analysis_cancelled(
            analysis_id
        )

    # =====================================================
    # ERROR REAL
    # =====================================================

    except Exception as exc:

        # Si mientras ocurría el error también se solicitó
        # cancelar, conservamos cancelled y no failed.
        if cancellation_requested(
            analysis_id
        ):
            mark_analysis_cancelled(
                analysis_id
            )

        else:
            update_analysis(
                analysis_id,
                status="failed",
                stage="failed",
                progress=100,
                message=
                    str(exc)[
                        :300
                    ],
            )

    # =====================================================
    # LIBERAR VIDEO
    # =====================================================

    finally:

        if capture is not None:
            capture.release()

        if anonymized_writer is not None:
            anonymized_writer.release()
