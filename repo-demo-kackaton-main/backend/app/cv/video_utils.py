"""Video preprocessing utilities for black bar detection and cropping.

Detects and removes black margins (letterbox/pillarbox) from video frames
to ensure accurate calibration and projection.
"""
from __future__ import annotations

import cv2
import numpy as np


def detect_black_bars(frame: np.ndarray, threshold: int = 10, min_bar_ratio: float = 0.02) -> dict:
    """Detect black bars (letterbox/pillarbox) in a video frame.

    Args:
        frame: BGR image (OpenCV format)
        threshold: Pixel intensity threshold to consider a row/column as black (0-255)
        min_bar_ratio: Minimum fraction of frame dimension to consider as a bar

    Returns:
        dict with keys:
            - top: pixels to crop from top
            - bottom: pixels to crop from bottom
            - left: pixels to crop from left
            - right: pixels to crop from right
            - content_width: width of actual content
            - content_height: height of actual content
            - has_bars: bool indicating if any bars were detected
    """
    if frame is None or frame.size == 0:
        return {"top": 0, "bottom": 0, "left": 0, "right": 0,
                "content_width": 0, "content_height": 0, "has_bars": False}

    height, width = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Detect horizontal bars (top/bottom)
    row_means = np.mean(gray, axis=1)
    top = 0
    bottom = height

    # Find top bar
    for y in range(height):
        if row_means[y] > threshold:
            top = y
            break

    # Find bottom bar
    for y in range(height - 1, -1, -1):
        if row_means[y] > threshold:
            bottom = y + 1
            break

    # Detect vertical bars (left/right)
    col_means = np.mean(gray, axis=0)
    left = 0
    right = width

    # Find left bar
    for x in range(width):
        if col_means[x] > threshold:
            left = x
            break

    # Find right bar
    for x in range(width - 1, -1, -1):
        if col_means[x] > threshold:
            right = x + 1
            break

    # Check if bars are significant
    min_bar_pixels_h = height * min_bar_ratio
    min_bar_pixels_w = width * min_bar_ratio

    has_top = top > min_bar_pixels_h
    has_bottom = (height - bottom) > min_bar_pixels_h
    has_left = left > min_bar_pixels_w
    has_right = (width - right) > min_bar_pixels_w

    return {
        "top": top if has_top else 0,
        "bottom": height - bottom if has_bottom else 0,
        "left": left if has_left else 0,
        "right": width - right if has_right else 0,
        "content_width": right - left if (has_left or has_right) else width,
        "content_height": bottom - top if (has_top or has_bottom) else height,
        "has_bars": has_top or has_bottom or has_left or has_right,
    }


def crop_frame(frame: np.ndarray, bars: dict) -> np.ndarray:
    """Crop black bars from a frame based on detected bar positions.

    Args:
        frame: BGR image
        bars: dict from detect_black_bars()

    Returns:
        Cropped frame
    """
    if not bars["has_bars"]:
        return frame

    height, width = frame.shape[:2]
    top = bars["top"]
    bottom = height - bars["bottom"]
    left = bars["left"]
    right = width - bars["right"]

    return frame[top:bottom, left:right]


def adjust_calibration_for_crop(
    source_normalized: list[list[float]],
    bars: dict,
    original_width: int,
    original_height: int,
) -> list[list[float]]:
    """Adjust calibration points to account for cropped video.

    Transforms normalized coordinates from the original frame (with bars)
    to normalized coordinates of the cropped content area.

    Args:
        source_normalized: 4 points in original normalized coords (0-1)
        bars: dict from detect_black_bars()
        original_width: original video width
        original_height: original video height

    Returns:
        Adjusted points in cropped normalized coords (0-1)
    """
    if not bars["has_bars"]:
        return source_normalized

    content_width = bars["content_width"]
    content_height = bars["content_height"]

    adjusted = []
    for x_norm, y_norm in source_normalized:
        # Convert to original pixels
        x_px = x_norm * original_width
        y_px = y_norm * original_height

        # Subtract crop offset
        x_cropped = x_px - bars["left"]
        y_cropped = y_px - bars["top"]

        # Convert to cropped normalized coords
        x_new = x_cropped / content_width
        y_new = y_cropped / content_height

        # Clamp to 0-1
        x_new = max(0, min(1, x_new))
        y_new = max(0, min(1, y_new))

        adjusted.append([round(x_new, 4), round(y_new, 4)])

    return adjusted


def crop_and_adjust_calibration(
    frame: np.ndarray,
    source_normalized: list[list[float]],
    threshold: int = 10,
) -> tuple[np.ndarray, list[list[float]], dict]:
    """Detect bars, crop frame, and adjust calibration points in one step.

    Args:
        frame: BGR image
        source_normalized: 4 calibration points
        threshold: black bar detection threshold

    Returns:
        (cropped_frame, adjusted_calibration, bars_info)
    """
    bars = detect_black_bars(frame, threshold)
    cropped = crop_frame(frame, bars)

    if bars["has_bars"]:
        height, width = frame.shape[:2]
        adjusted = adjust_calibration_for_crop(source_normalized, bars, width, height)
    else:
        adjusted = source_normalized

    return cropped, adjusted, bars


def get_crop_transform_matrix(bars: dict, original_width: int, original_height: int) -> np.ndarray | None:
    """Get a 2x3 affine transform matrix to map original coords to cropped coords.

    Useful for transforming homography points or other coordinate data.
    """
    if not bars["has_bars"]:
        return None

    # Translation to remove crop offset
    tx = -bars["left"]
    ty = -bars["top"]

    return np.array([
        [1, 0, tx],
        [0, 1, ty],
    ], dtype=np.float64)
