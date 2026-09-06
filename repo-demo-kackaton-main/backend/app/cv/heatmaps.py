from pathlib import Path

import cv2
import numpy as np


def floor_pixel_size(floor: dict) -> tuple[int, int]:
    """Chooses a floor top-down resolution that scales with the configured dimensions.

    Meter floors (advanced mode) scale towards the 1280px target edge. Pixel-unit
    floors (fast mode) use their real resolution: the internal projection is the
    identity, so a larger canvas would be a memory blow-up AND would misalign the
    frame overlays.
    """
    if floor.get("unit") == "pixels":
        return int(floor["width"]), int(floor["depth"])
    target_edge = 1280.0
    scale = max(32.0, min(96.0, target_edge / max(floor["width"], floor["depth"])))
    return max(32, round(floor["width"] * scale)), max(32, round(floor["depth"] * scale))


def heatmap_canvas(points: list[dict], floor: dict, size: tuple[int, int]) -> np.ndarray:
    width, height = size
    canvas = np.zeros((height, width), dtype=np.float32)
    for item in points:
        x = min(width - 1, max(0, int(item["x"] / floor["width"] * width)))
        y = min(height - 1, max(0, int(item["z"] / floor["depth"] * height)))
        canvas[y, x] += float(item.get("weight", 1.0))
    return canvas


def smooth_and_normalize(canvas: np.ndarray, sigma: float | None = None) -> np.ndarray:
    """Applies a resolution-proportional blur and clips to the 98th percentile."""
    if sigma is None:
        sigma = max(6.0, 18.0 * canvas.shape[1] / 960.0)
    canvas = cv2.GaussianBlur(canvas, (0, 0), sigmaX=sigma, sigmaY=sigma)
    positive = canvas[canvas > 0]
    if positive.size == 0:
        return canvas
    ceiling = float(np.percentile(positive, 98)) or 1.0
    return np.clip(canvas / ceiling * 255.0, 0, 255)


def build_heatmap(points: list[dict], floor: dict) -> tuple[np.ndarray, np.ndarray]:
    """Returns (BGR colored heatmap, alpha mask 0..255) in floor top-down space."""
    size = floor_pixel_size(floor)
    canvas = smooth_and_normalize(heatmap_canvas(points, floor, size))
    colored = cv2.applyColorMap(canvas.astype(np.uint8), cv2.COLORMAP_TURBO)
    alpha = np.where(canvas > 1, np.clip(canvas * 1.5, 35, 225), 0).astype(np.uint8)
    return colored, alpha


def create_floor_heatmap(points: list[dict], floor: dict, output: Path) -> None:
    colored, alpha = build_heatmap(points, floor)
    rgba = cv2.cvtColor(colored, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha
    cv2.imwrite(str(output), rgba)


def overlay_heatmap_on_frame(
    points: list[dict],
    floor: dict,
    homography_inv: list,
    frame: np.ndarray,
    strength: float = 0.55,
) -> np.ndarray:
    """Warps the floor heatmap into the camera frame using the normalized inverse homography."""
    if not points:
        return frame.copy()
    height, width = frame.shape[:2]
    colored, alpha = build_heatmap(points, floor)
    rgba = cv2.cvtColor(colored, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = np.maximum(alpha, np.uint8(150) * (alpha > 0).astype(np.uint8))
    scale = np.float32(
        [[float(width), 0.0, 0.0], [0.0, float(height), 0.0], [0.0, 0.0, 1.0]]
    )
    homography = scale @ np.float32(homography_inv)
    warped = cv2.warpPerspective(rgba, homography, (width, height), flags=cv2.INTER_LINEAR)
    alpha_f = (warped[:, :, 3].astype(np.float32) / 255.0) * strength
    bgr = warped[:, :, :3].astype(np.float32)
    blended = frame.astype(np.float32) * (1.0 - alpha_f[..., None]) + bgr * alpha_f[..., None]
    return np.clip(blended, 0, 255).astype(np.uint8)