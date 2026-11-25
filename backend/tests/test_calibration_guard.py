"""Mode resolution tests: a site runs ``advanced`` only when a real homography
is computable; otherwise it falls back to ``fast`` (normalized coordinates).

A valid calibration may legitimately span the full frame edges, so identity is
NOT a business criterion: what matters is valid non-degenerate points and a
computable perspective transform.
"""
from app.cv.pipeline import analysis_mode

FULL_FRAME_IDENTITY = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]
METER_TARGET = [[0.0, 0.0], [12.0, 0.0], [12.0, 8.0], [0.0, 8.0]]
MOVED_SOURCE = [[0.08, 0.18], [0.92, 0.18], [0.98, 0.96], [0.02, 0.96]]


def test_uncalibrated_site_is_fast() -> None:
    configuration = {
        "camera": {"calibration_status": "uncalibrated", "source_normalized": FULL_FRAME_IDENTITY}
    }
    assert analysis_mode(configuration) == "fast"


def test_demo_marker_is_fast() -> None:
    configuration = {
        "camera": {"calibration_status": "demo", "source_normalized": MOVED_SOURCE, "target_meters": METER_TARGET}
    }
    assert analysis_mode(configuration) == "fast"


def test_missing_camera_section_is_fast() -> None:
    assert analysis_mode({}) == "fast"
    assert analysis_mode({"floor": {"width": 12.0}}) == "fast"


def test_calibrated_full_frame_edges_is_advanced() -> None:
    # Identity spans the whole frame but the homography IS computable and the
    # target is valid -> advanced (id is not a business criterion).
    configuration = {
        "camera": {
            "calibration_status": "calibrated",
            "source_normalized": FULL_FRAME_IDENTITY,
            "target_meters": METER_TARGET,
        }
    }
    assert analysis_mode(configuration) == "advanced"


def test_calibrated_moved_points_are_advanced() -> None:
    configuration = {
        "camera": {
            "calibration_status": "calibrated",
            "source_normalized": MOVED_SOURCE,
            "target_meters": METER_TARGET,
        }
    }
    assert analysis_mode(configuration) == "advanced"


def test_calibrated_but_target_missing_is_fast() -> None:
    configuration = {"camera": {"calibration_status": "calibrated", "source_normalized": MOVED_SOURCE}}
    assert analysis_mode(configuration) == "fast"


def test_calibrated_but_degenerate_source_is_fast() -> None:
    degenerate = [[0.0, 0.0], [0.5, 0.0], [1.0, 0.0], [0.5, 0.0]]
    configuration = {"camera": {"calibration_status": "calibrated", "source_normalized": degenerate, "target_meters": METER_TARGET}}
    assert analysis_mode(configuration) == "fast"


def test_calibrated_but_wrong_point_count_is_fast() -> None:
    configuration = {"camera": {"calibration_status": "calibrated", "source_normalized": [[0.0, 0.0], [1.0, 0.0]], "target_meters": METER_TARGET}}
    assert analysis_mode(configuration) == "fast"