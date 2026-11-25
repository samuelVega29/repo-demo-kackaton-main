"""Heatmap canvas sizing contract.

- Meter floors (advanced mode) scale towards the 1280px target edge.
- Pixel floors (fast mode) use their real resolution: anything larger would be
  a memory blow-up and would misalign the identity frame overlays.
"""
from app.cv.heatmaps import build_heatmap, floor_pixel_size


def test_meter_floor_scales_to_target_edge() -> None:
    width, height = floor_pixel_size({"width": 12.0, "depth": 8.0})
    assert width <= 1280 and height <= 1280
    assert width == height * 1.5


def test_pixel_floor_keeps_real_resolution() -> None:
    width, height = floor_pixel_size({"width": 1920.0, "depth": 1080.0, "unit": "pixels"})
    assert (width, height) == (1920, 1080)


def test_pixel_floor_does_not_blow_up_memory() -> None:
    floor = {"width": 1920.0, "depth": 1080.0, "unit": "pixels"}
    colored, alpha = build_heatmap([{"x": 960.0, "z": 540.0, "weight": 1.0}], floor)
    assert colored.shape == (1080, 1920, 3)
    assert alpha.shape == (1080, 1920)