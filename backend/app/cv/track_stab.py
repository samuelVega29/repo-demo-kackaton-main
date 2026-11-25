"""Track ID stabilization for more consistent person identity across the video.

YOLO+ByteTrack can fragment one person into several track ids (when occluded,
or when detection confidence drops below threshold). This module merges these
fragments into stable "people" identities by linking disappearances to nearby
reappearances.

Re-identification combines three cues so that fragments are only merged when
they really look like the same person:

- floor distance in meters (the existing gate),
- IoU of the bounding boxes in image space (same spot on a static camera),
- appearance: a normalized HSV histogram of the person crop.
"""
from __future__ import annotations

import math

import numpy as np


def bbox_iou(first: list | tuple, second: list | tuple) -> float:
    """Intersection-over-union of two [x1, y1, x2, y2] boxes."""
    width = max(0.0, min(first[2], second[2]) - max(first[0], second[0]))
    height = max(0.0, min(first[3], second[3]) - max(first[1], second[1]))
    intersection = width * height
    first_area = max(0.0, (first[2] - first[0]) * (first[3] - first[1]))
    second_area = max(0.0, (second[2] - second[0]) * (second[3] - second[1]))
    union = first_area + second_area - intersection
    return intersection / union if union > 0 else 0.0


def appearance_signature(frame, bbox) -> list[float] | None:
    """Normalized HSV color histogram of the person crop.

    Returns advisory fingerprint used only to disambiguate re-identifications;
    it never stores an identity, face, emotion or biometric label.
    """
    import cv2  # polymorphic import: kept local so the module stays importable without OpenCV

    if frame is None or bbox is None:
        return None
    x1, y1, x2, y2 = (int(round(value)) for value in bbox)
    if x2 <= x1 or y2 <= y1:
        return None
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, [8, 8, 8], [0, 180, 0, 256, 0, 256])
    cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
    return [float(value) for value in hist.flatten()]


def histogram_similarity(first: list[float] | None, second: list[float] | None) -> float:
    """Cosine similarity between two normalized histogram fingerprints (0..1)."""
    if not first or not second or len(first) != len(second):
        return 0.0
    first_array = np.asarray(first, dtype=np.float64)
    second_array = np.asarray(second, dtype=np.float64)
    norm = float(np.linalg.norm(first_array) * np.linalg.norm(second_array))
    if norm == 0:
        return 0.0
    return max(0.0, min(1.0, float(np.dot(first_array, second_array) / norm)))


class TrackStabilizer:
    """Maps noisy ByteTrack ids to stable people ids."""

    def __init__(
        self,
        max_gap_seconds: float = 1.5,
        max_reappear_distance_m: float = 2.5,
        carry_history_frames: int = 60,
        color_weight: float = 1.5,
        iou_weight: float = 2.0,
        appearance_alpha: float = 0.6,
    ) -> None:
        self.max_gap_seconds = max_gap_seconds
        self.max_reappear_distance_m = max_reappear_distance_m
        self.carry_history_frames = carry_history_frames
        self.color_weight = color_weight
        self.iou_weight = iou_weight
        self.appearance_alpha = appearance_alpha

        # track_id -> stable_person_id
        self.track_to_person: dict[int, int] = {}

        # stable_person_id -> {last_position, last_timestamp, last_frame,
        #                      last_bbox, signature, active}
        self.people: dict[int, dict] = {}

        # For each abandoned track id, remember where/when it last disappeared
        self.recent_disappearances: list[dict] = []

        self.next_person_id = 1

    def _assign_new_person(self) -> int:
        pid = self.next_person_id
        self.next_person_id += 1
        self.people[pid] = {
            "last_position": None,
            "last_timestamp": None,
            "last_frame": 0,
            "last_bbox": None,
            "signature": None,
            "active": False,
        }
        return pid

    def _merge_und_to_person(self, pid: int, detection: dict, timestamp: float, frame_index: int, frame) -> None:
        signature = appearance_signature(frame, detection.get("bbox"))
        previous = self.people[pid].get("signature")
        if signature is not None and previous is not None:
            signature = [
                self.appearance_alpha * new + (1 - self.appearance_alpha) * old
                for new, old in zip(signature, previous)
            ]
        elif signature is None:
            signature = previous
        self.people[pid].update(
            last_position=detection["floor_point"],
            last_timestamp=timestamp,
            last_frame=frame_index,
            last_bbox=detection.get("bbox"),
            signature=signature,
            active=True,
        )

    def _reidentify(self, detection: dict, timestamp: float, frame) -> int | None:
        """Find the recently disappeared person that best matches this detection."""
        position = detection["floor_point"]
        signature = appearance_signature(frame, detection.get("bbox"))
        best = None
        best_score = None
        for record in self.recent_disappearances:
            gap = timestamp - record["last_timestamp"]
            if gap < 0 or gap > self.max_gap_seconds:
                continue
            dist = math.dist(position, record["last_position"])
            if dist > self.max_reappear_distance_m:
                continue
            iou = bbox_iou(detection.get("bbox", [0, 0, 0, 0]), record["last_bbox"] or [0, 0, 0, 0]) * self.iou_weight
            color = histogram_similarity(signature, record.get("signature")) * self.color_weight
            score = dist - iou - color
            if best_score is None or score < best_score:
                best_score = score
                best = record
        return best["person_id"] if best else None

    def update(
        self,
        detections: list[dict],
        timestamp: float,
        frame_index: int,
        frame=None,
    ) -> list[dict]:
        """Assign stable person_ids to the current frame's detections.

        Args:
            detections: list of detection dicts (each with `track_id`, `bbox`
                and `floor_point`)
            timestamp: current video time in seconds
            frame_index: current frame number
            frame: current BGR frame (optional; enables color-based scoring)

        Returns:
            A new list of detections, each decorated with `person_id`.
        """
        active = {d.get("person_id") for d in detections}

        for detection in detections:
            raw_id = detection["track_id"]
            position = detection.get("floor_point")
            if position is None:
                continue

            # Already mapped to a stable person?
            pid = self.track_to_person.get(raw_id)
            if pid is not None and self.people[pid]["active"]:
                # Keep it, update position/timestamp
                self._merge_und_to_person(pid, detection, timestamp, frame_index, frame)
            else:
                # Either never seen or its person was cleaned up:
                # try to link to a recently disappeared person.
                linked = self._reidentify(detection, timestamp, frame)
                if linked is not None and not self.people[linked]["active"]:
                    pid = linked
                    self._merge_und_to_person(pid, detection, timestamp, frame_index, frame)
                else:
                    pid = self._assign_new_person()
                    self._merge_und_to_person(pid, detection, timestamp, frame_index, frame)
                self.track_to_person[raw_id] = pid

            detection["person_id"] = pid
            active.add(pid)

        # Clean up people that are no longer active this frame -> mark inactive and
        # record their disappearance for possible re-identification.
        self.recent_disappearances = [
            record for record in self.recent_disappearances
            if timestamp - record["last_timestamp"] <= self.max_gap_seconds
        ]
        for pid, info in list(self.people.items()):
            if info["active"] and pid not in active:
                if info["last_position"] is not None:
                    self.recent_disappearances.append(
                        {
                            "person_id": pid,
                            "last_position": info["last_position"],
                            "last_timestamp": timestamp,
                            "last_bbox": info["last_bbox"],
                            "signature": info["signature"],
                        }
                    )
                info["active"] = False

        return detections