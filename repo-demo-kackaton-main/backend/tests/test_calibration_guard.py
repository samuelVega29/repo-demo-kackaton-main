from app.routers.analyses import _has_valid_calibration


def test_default_new_site_is_blocked() -> None:
    configuration = {
        "camera": {
            "calibration_status": "uncalibrated",
            "source_normalized": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
        }
    }
    assert _has_valid_calibration(configuration) is False


def test_identity_points_are_not_a_real_calibration() -> None:
    configuration = {
        "camera": {
            "calibration_status": "calibrated",
            "source_normalized": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
        }
    }
    assert _has_valid_calibration(configuration) is False


def test_moved_points_are_accepted() -> None:
    configuration = {
        "camera": {
            "calibration_status": "calibrated",
            "source_normalized": [[0.08, 0.18], [0.92, 0.18], [0.98, 0.96], [0.02, 0.96]],
        }
    }
    assert _has_valid_calibration(configuration) is True


def test_demo_seeded_site_kept_working() -> None:
    configuration = {
        "camera": {
            "calibration_status": "demo",
            "source_normalized": [[0.08, 0.18], [0.92, 0.18], [0.98, 0.96], [0.02, 0.96]],
        }
    }
    assert _has_valid_calibration(configuration) is True


def test_missing_camera_section_is_blocked() -> None:
    assert _has_valid_calibration({}) is False
    assert _has_valid_calibration({"floor": {"width": 12.0}}) is False