"""Phase 6: process-wide detector cache (app/cv/detector.py).

Verifies that YOLO weights are loaded once per variant and reused across
analyses, and that the ByteTrack state is reset so consecutive analyses start
with fresh track ids.
"""
from types import SimpleNamespace

from app.cv import detector as detector_module
from app.cv.detector import get_person_detector


def test_detector_cache_returns_same_instance_per_variant(monkeypatch) -> None:
    made = []

    class FakeDetector:
        def __init__(self, detection_only):
            self.detection_only = detection_only
            made.append(detection_only)

    detector_module._detector_cache.clear()
    monkeypatch.setattr(detector_module, "PersonDetector", FakeDetector)
    try:
        pose_a = get_person_detector(detection_only=False)
        pose_b = get_person_detector(detection_only=False)
        det_a = get_person_detector(detection_only=True)
        det_b = get_person_detector(detection_only=True)
        assert pose_a is pose_b is not det_a
        assert det_a is det_b
        assert made == [False, True]  # weights loaded exactly once per variant
    finally:
        detector_module._detector_cache.clear()


def test_reset_tracker_ignores_missing_predictor() -> None:
    class Bare:
        model = object()

    detector_module.PersonDetector.reset_tracker(Bare())  # must not raise


def test_reset_tracker_resets_every_tracker() -> None:
    resets = []

    class FakeTracker:
        def __init__(self):
            self.frame_id = 99

        def reset(self):
            self.frame_id = 0

        @classmethod
        def reset_id(cls):
            resets.append("reset_id")

    model = SimpleNamespace(predictor=SimpleNamespace(trackers=[FakeTracker(), FakeTracker()]))
    detector = detector_module.PersonDetector.__new__(detector_module.PersonDetector)
    detector.model = model

    detector.reset_tracker()
    assert all(tracker.frame_id == 0 for tracker in model.predictor.trackers)
    assert resets == ["reset_id", "reset_id"]