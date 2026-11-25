"""Heuristic shelf candidate detection for demo calibration workflows.

These are suggestions, not guarantees: the detector finds large rectangular groups of
straight edges in a captured frame and projects them to the floor using the configured
homography. The user decides whether to accept them as gondolas.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from .spatial import SpatialEngine


def _angle(segment: tuple[tuple[int, int], tuple[int, int]]) -> float:
    (x1, y1), (x2, y2) = segment
    return math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180.0


def _cluster(values: list[float], tolerance: float) -> list[float]:
    groups: list[list[float]] = []
    for value in sorted(values):
        if groups and abs(value - groups[-1][-1]) <= tolerance:
            groups[-1].append(value)
        else:
            groups.append([value])
    return [(min(group) + max(group)) / 2.0 for group in groups]


def _detect_edge_lines(frame: np.ndarray) -> tuple[list, list, int, int]:
    height, width = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 9, 55, 55)
    edges = cv2.Canny(gray, 45, 140)
    min_length = int(0.11 * min(width, height))
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=55, minLineLength=min_length, maxLineGap=7
    )
    segments: list[tuple[tuple[int, int], tuple[int, int]]] = []
    if lines is not None:
        for x1, y1, x2, y2 in lines.reshape(-1, 4):
            segments.append(((int(x1), int(y1)), (int(x2), int(y2))))
    vertical = [seg for seg in segments if abs(_angle(seg) - 90.0) <= 18.0]
    horizontal = [seg for seg in segments if _angle(seg) <= 18.0 or _angle(seg) >= 162.0]
    return vertical, horizontal, width, height


def _rect_score(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    vertical_clusters: list[float],
    horizontal_clusters: list[float],
    v_tol: float,
    h_tol: float,
) -> float:
    left = 1.0 if any(abs(c - x1) <= v_tol for c in vertical_clusters) else 0.0
    right = 1.0 if any(abs(c - x2) <= v_tol for c in vertical_clusters) else 0.0
    top = 1.0 if any(abs(c - y1) <= h_tol for c in horizontal_clusters) else 0.0
    bottom = 1.0 if any(abs(c - y2) <= h_tol for c in horizontal_clusters) else 0.0
    return (left + right + top + bottom) / 4.0


def suggest_gondolas(
    configuration: dict,
    image_bytes: bytes,
    image_width: int,
    image_height: int,
    max_candidates: int = 12,
) -> list[dict]:
    del image_width, image_height
    data = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if frame is None:
        return []
    height, width = frame.shape[:2]
    vertical, horizontal, _, _ = _detect_edge_lines(frame)

    vertical_x = [int((a[0] + b[0]) / 2) for a, b in vertical]
    horizontal_y = [int((a[1] + b[1]) / 2) for a, b in horizontal]
    v_clusters = _cluster(map(float, vertical_x), max(14.0, width * 0.015))
    h_clusters = _cluster(map(float, horizontal_y), max(10.0, height * 0.012))
    if len(v_clusters) < 2 or len(h_clusters) < 2:
        return []

    min_gap_w = max(30.0, width * 0.04)
    max_gap_w = width * 0.5
    min_gap_h = max(22.0, height * 0.035)
    max_gap_h = height * 0.5
    v_tol = max(12.0, width * 0.012)
    h_tol = max(9.0, height * 0.010)

    candidates: list[dict] = []
    used: list[tuple[float, float, float, float]] = []
    for xi, x1 in enumerate(v_clusters):
        for x2 in v_clusters[xi + 1 :]:
            if not (min_gap_w <= (x2 - x1) <= max_gap_w):
                continue
            for yi, y1 in enumerate(h_clusters):
                for y2 in h_clusters[yi + 1 :]:
                    if not (min_gap_h <= (y2 - y1) <= max_gap_h):
                        continue
                    score = _rect_score(x1, y1, x2, y2, v_clusters, h_clusters, v_tol, h_tol)
                    if score < 0.5:
                        continue
                    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
                    area = (x2 - x1) * (y2 - y1)
                    merged = False
                    for (ux1, uy1, ux2, uy2) in used:
                        overlap_w = max(0.0, min(x2, ux2) - max(x1, ux1))
                        overlap_h = max(0.0, min(y2, uy2) - max(y1, uy1))
                        if overlap_w * overlap_h / min(area, (ux2 - ux1) * (uy2 - uy1)) > 0.3:
                            merged = True
                            break
                    if merged:
                        continue
                    used.append((x1, y1, x2, y2))
                    candidates.append(
                        {
                            "cx": cx,
                            "cy": cy,
                            "x1": x1,
                            "y1": y1,
                            "x2": x2,
                            "y2": y2,
                            "score": score,
                            "area": area,
                        }
                    )

    if not candidates:
        return []

    camera = configuration.get("camera") or {}
    if not camera.get("source_normalized") or not camera.get("target_meters"):
        return []
    try:
        forward, _ = SpatialEngine.normalized_pair(camera)
    except cv2.error:
        return []
    floor = configuration["floor"]
    normalized = np.float32([[[c["x1"] / width, c["y1"] / height] for _ in range(4)] for c in candidates])
    for index, candidate in enumerate(candidates):
        corners = (
            (candidate["x1"] / width, candidate["y1"] / height),
            (candidate["x2"] / width, candidate["y1"] / height),
            (candidate["x2"] / width, candidate["y2"] / height),
            (candidate["x1"] / width, candidate["y2"] / height),
        )
        points = np.float32([[corner] for corner in corners])
        projected = cv2.perspectiveTransform(points, forward)[:, 0, :]
        xs = [float(point[0]) for point in projected]
        zs = [float(point[1]) for point in projected]
        x, z = min(xs), min(zs)
        g_width, g_depth = max(xs) - x, max(zs) - z
        if g_width < 0.5 or g_depth < 0.4:
            continue
        if (
            x < -0.5
            or z < -0.5
            or x + g_width > floor["width"] + 0.5
            or z + g_depth > floor["depth"] + 0.5
        ):
            continue
        candidates[index] = {
            "x": round(x, 2),
            "z": round(z, 2),
            "width": round(min(g_width, floor["width"]), 2),
            "depth": round(min(g_depth, floor["depth"]), 2),
            "confidence": round(candidate["score"], 3),
            "image_box": [round(candidate["x1"]), round(candidate["y1"]), round(candidate["x2"]), round(candidate["y2"])],
        }
    result = [candidate for candidate in candidates if candidate.get("x") is not None]
    result.sort(key=lambda item: item["confidence"], reverse=True)
    return result[:max_candidates]