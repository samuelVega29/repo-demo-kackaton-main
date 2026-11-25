import numpy as np

from app.cv.track_stab import bbox_iou, appearance_signature, histogram_similarity, TrackStabilizer

RED_FRAME = np.zeros((100, 100, 3), dtype=np.uint8)
RED_FRAME[10:40, 10:90] = (0, 0, 220)
YELLOW_FRAME = np.zeros((100, 100, 3), dtype=np.uint8)
YELLOW_FRAME[40:70, 10:90] = (220, 220, 0)


def _detection(track_id: int, x: float, z: float) -> dict:
    return {"track_id": track_id, "bbox": [10, 10, 90, 40], "floor_point": [x, z]}


def test_bbox_iou() -> None:
    assert bbox_iou([0, 0, 10, 10], [10, 10, 20, 20]) == 0.0
    assert bbox_iou([0, 0, 10, 10], [0, 0, 10, 10]) == 1.0
    partial = bbox_iou([0, 0, 10, 10], [5, 5, 15, 15])
    assert 0.0 < partial < 1.0


def test_histogram_similarity() -> None:
    hist = appearance_signature(RED_FRAME, [10, 10, 90, 40])
    same = appearance_signature(RED_FRAME.copy(), [10, 10, 90, 40])
    other = appearance_signature(YELLOW_FRAME, [10, 10, 90, 40])
    assert hist is not None
    assert histogram_similarity(hist, same) > 0.99
    assert histogram_similarity(hist, other) < histogram_similarity(hist, same)
    assert histogram_similarity(hist, None) == 0.0


def test_fragments_merge_into_one_person() -> None:
    stabilizer = TrackStabilizer(max_gap_seconds=1.5, max_reappear_distance_m=2.5)
    stabilizer.update([_detection(10, 2.0, 2.0)], 0.0, 0, RED_FRAME)
    stabilizer.update([], 0.4, 12, RED_FRAME)
    stabilizer.update([_detection(11, 2.02, 2.03)], 1.0, 30, RED_FRAME)
    stabilizer.update([], 1.4, 42, RED_FRAME)
    stabilizer.update([_detection(12, 2.04, 2.05)], 2.0, 60, RED_FRAME)
    people = stabilizer.track_to_person
    assert people[10] == people[11] == people[12]


def test_distinct_person_is_not_merged() -> None:
    stabilizer = TrackStabilizer(max_gap_seconds=1.5, max_reappear_distance_m=2.5)
    stabilizer.update([_detection(10, 2.0, 2.0)], 0.0, 0, RED_FRAME)
    stabilizer.update([_detection(20, 6.0, 6.0)], 1.0, 30, YELLOW_FRAME)
    people = stabilizer.track_to_person
    assert people[10] != people[20]