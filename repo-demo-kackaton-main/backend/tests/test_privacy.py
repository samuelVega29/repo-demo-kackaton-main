"""Face anonymization contract.

- Face boxes are derived from pose keypoints (nose/eyes/ears) when available
  and clamped to the frame; otherwise a head-region fallback on the bbox.
- ``blur_detection_faces`` must only touch the face regions of a returned
  *copy* (the tracked frame is never mutated).
- ``AnonymizedVideoWriter`` produces a browser-playable H.264 MP4 (guarded by
  the availability of the bundled ffmpeg from imageio-ffmpeg).
"""
import os
import tempfile
from pathlib import Path

import cv2
import numpy as np

from app.cv.privacy import blur_detection_faces, estimate_face_box

FRAME = np.zeros((240, 320, 3), dtype=np.uint8)
BBOX = [40.0, 20.0, 180.0, 210.0]


def _pose_keypoints() -> list[list[float]]:
    return [
        [110.0, 60.0, 0.9],  # nose
        [102.0, 52.0, 0.9],  # left_eye
        [118.0, 52.0, 0.9],  # right_eye
        [92.0, 56.0, 0.8],   # left_ear
        [128.0, 56.0, 0.8],  # right_ear
    ]


def test_face_box_from_keypoints_contains_face_and_clamps() -> None:
    box = estimate_face_box(_pose_keypoints(), BBOX, FRAME.shape)
    assert box is not None
    x1, y1, x2, y2 = box
    assert x1 >= 0 and y1 >= 0 and x2 <= FRAME.shape[1] and y2 <= FRAME.shape[0]
    # The anchor cluster (eyes ~52px) must fall inside the estimated box.
    assert x1 <= 102 <= x2 and y1 <= 52 <= y2


def test_face_box_fallback_uses_head_region() -> None:
    box = estimate_face_box(None, BBOX, FRAME.shape)
    assert box is not None
    x1, y1, x2, y2 = box
    # Head fallback must stay within the top of the bounding box.
    assert y1 >= 20 and y2 <= 210
    assert x1 > 40 and x2 < 180
    # Horizontal center of the box must match the bbox center.
    assert abs((x1 + x2) / 2 - 110.0) < 1.0


def test_face_box_rejects_empty_bbox() -> None:
    assert estimate_face_box(_pose_keypoints(), [0.0, 0.0, 0.0, 0.0], FRAME.shape) is None
    assert estimate_face_box(_pose_keypoints(), None, FRAME.shape) is None


def test_blur_faces_smears_face_and_preserves_rest() -> None:
    frame = FRAME.copy()
    # High-frequency detail inside the face region so the blur is measurable.
    face_zone = frame[30:80, 80:140]
    for x in range(face_zone.shape[1]):
        for y in range(face_zone.shape[0]):
            if (x + y) % 2 == 0:
                face_zone[y, x] = 255
    detection = {"bbox": BBOX, "keypoints": _pose_keypoints()}
    box = estimate_face_box(detection["keypoints"], BBOX, frame.shape)

    box_lap = cv2.Laplacian(frame[box[1]:box[3], box[0]:box[2]], cv2.CV_64F).var()
    outside_before = frame[5:15, 5:15].copy()

    result = blur_detection_faces(frame, [detection])

    box_lap_after = cv2.Laplacian(result[box[1]:box[3], box[0]:box[2]], cv2.CV_64F).var()
    assert box_lap_after < box_lap / 5
    # Pixels outside the blurred boxes are byte-identical (and it is a copy: the
    # caller's frame must never be mutated).
    assert np.array_equal(result[5:15, 5:15], outside_before)
    assert np.array_equal(result, frame) is False
    assert np.array_equal(frame[box[1]:box[3], box[0]:box[2]], 0) is False


def test_blur_faces_without_detections_is_noop_copy() -> None:
    result = blur_detection_faces(FRAME, [])
    assert np.array_equal(result, FRAME)
    assert result is not FRAME


def test_anonymized_video_writer_produces_h264() -> None:
    pytest = __import__("pytest")
    pytest.importorskip("imageio_ffmpeg")

    from app.cv.video_utils import AnonymizedVideoWriter

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "anon.mp4"
        with AnonymizedVideoWriter(path, 10.0, 320, 240) as writer:
            for _ in range(6):
                writer.write(np.zeros((240, 320, 3), dtype=np.uint8))

        capture = cv2.VideoCapture(str(path))
        frame_count = 0
        ok, _ = capture.read()
        while ok:
            frame_count += 1
            ok, _ = capture.read()
        codec = int(capture.get(cv2.CAP_PROP_FOURCC))
        capture.release()

        assert frame_count == 6
        assert codec == cv2.VideoWriter_fourcc(*"h264")
        assert path.stat().st_size > 0