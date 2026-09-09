"""Face anonymization utilities.

Blurs the face of every detected person so no artifact (evidence frames,
overlays or the served video) exposes their identity. Face locations come
from the pose keypoints already computed by the pipeline (nose/eyes/ears);
when only a detection-only model is available a fallback head region derived
from the bounding box is used instead.
"""
from __future__ import annotations

import cv2
import numpy as np

# COCO pose keypoint indices that delimit the face (nose, eyes, ears).
FACE_KEYPOINT_INDICES = (0, 1, 2, 3, 4)

# Fallback head region inside the bounding box (top fraction of the box height).
_HEAD_FALLBACK_TOP = 0.02
_HEAD_FALLBACK_BOTTOM = 0.42

_MIN_FACE_PIXELS = 24.0


def estimate_face_box(
    keypoints: list[list[float] | None] | None,
    bbox: list[float],
    frame_shape: tuple[int, int, int],
) -> tuple[int, int, int, int] | None:
    """Estimates a face rectangle for one detection.

    Prefers the face pose keypoints (indices 0-4) when available; otherwise
    falls back to the head region at the top of the bounding box. The box is
    clamped to frame bounds and returned as (x1, y1, x2, y2).

    Returns None when the bbox is empty or anchors are not present.
    """
    if bbox is None or len(bbox) != 4:
        return None
    x1, y1, x2, y2 = [float(value) for value in bbox]
    box_w = x2 - x1
    box_h = y2 - y1
    if box_w <= 0 or box_h <= 0:
        return None

    pts = _face_anchor_points(keypoints)
    if pts:
        xs = [point[0] for point in pts]
        ys = [point[1] for point in pts]
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)
        span = max(xs) - min(xs)
        width = max(span * 1.6, box_w * 0.3, _MIN_FACE_PIXELS)
        height = width * 1.4
    else:
        width = max(box_w * 0.4, _MIN_FACE_PIXELS)
        height = width * 1.4
        cx = (x1 + x2) / 2.0
        cy = y1 + box_h * (_HEAD_FALLBACK_TOP + _HEAD_FALLBACK_BOTTOM) / 2.0

    return _clamp_box(
        (round(cx - width / 2), round(cy - height / 2), round(cx + width / 2), round(cy + height / 2)),
        frame_shape,
    )


def blur_detection_faces(frame: np.ndarray, detections: list[dict] | None) -> np.ndarray:
    """Returns a blurred copy of ``frame`` with the face of each detection smeared.

    The input frame is never mutated. Detections may carry ``keypoints`` (pose
    mode) or only ``bbox`` (detection-only mode, head fallback is used).
    """
    if frame is None or frame.size == 0:
        return frame
    output = frame.copy()
    for detection in detections or []:
        bbox = detection.get("bbox")
        if not bbox:
            continue
        box = estimate_face_box(detection.get("keypoints"), bbox, frame.shape)
        if box is None:
            continue
        _blur_box(output, box)
    return output


def _face_anchor_points(keypoints: list[list[float] | None] | None) -> list[list[float]]:
    """Filters usable (x, y) pose anchors among the face keypoint indices."""
    if not keypoints:
        return []
    points = []
    for index in FACE_KEYPOINT_INDICES:
        if index >= len(keypoints):
            continue
        point = keypoints[index]
        if not point or len(point) < 2:
            continue
        try:
            x = float(point[0])
            y = float(point[1])
        except (TypeError, ValueError):
            continue
        if np.isfinite(x) and np.isfinite(y) and y > 0:
            points.append([x, y])
    return points


def _clamp_box(box: tuple[int, int, int, int], frame_shape: tuple[int, int, int]) -> tuple[int, int, int, int]:
    height, width = frame_shape[:2]
    x1, y1, x2, y2 = box
    if x2 - x1 <= 0 or y2 - y1 <= 0:
        return None
    return (
        max(0, x1),
        max(0, y1),
        min(width, x2),
        min(height, y2),
    )


def _blur_box(frame: np.ndarray, box: tuple[int, int, int, int]) -> None:
    """Applies a strong Gaussian blur inside ``box`` in place with edge padding."""
    x1, y1, x2, y2 = box
    if x2 <= x1 or y2 <= y1:
        return
    roi = frame[y1:y2, x1:x2]
    width = x2 - x1
    height = y2 - y1
    kernel = max(15, (round(min(width, height) / 10) * 2 + 1))
    # Replicate border avoids dark halos at the box edges produced by GaussianBlur.
    padded = cv2.copyMakeBorder(roi, 1, 1, 1, 1, cv2.BORDER_REPLICATE)
    blurred = cv2.GaussianBlur(padded, (kernel, kernel), 0)
    frame[y1:y2, x1:x2] = blurred[1:-1, 1:-1]