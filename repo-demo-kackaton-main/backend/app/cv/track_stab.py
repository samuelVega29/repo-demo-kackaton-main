"""Track ID stabilization for more consistent person identity across the video.

YOLO+ByteTrack can fragment one person into several track ids (when occluded,
or when detection confidence drops below threshold). This module merges these
fragments into stable "people" identities by linking disappearances to nearby
reappearances.
"""
from __future__ import annotations

import math


class TrackStabilizer:
    """Maps noisy ByteTrack ids to stable people ids."""

    def __init__(
        self,
        max_gap_seconds: float = 1.5,
        max_reappear_distance_m: float = 2.5,
        carry_history_frames: int = 60,
    ) -> None:
        self.max_gap_seconds = max_gap_seconds
        self.max_reappear_distance_m = max_reappear_distance_m
        self.carry_history_frames = carry_history_frames

        # track_id -> stable_person_id
        self.track_to_person: dict[int, int] = {}

        # stable_person_id -> {last_position, last_timestamp, last_frame, active}
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
            "active": False,
        }
        return pid

    def _reidentify(self, position, timestamp, frame_index) -> int | None:
        """Try to find a recently disappeared person near this position/time."""
        best = None
        best_dist = self.max_reappear_distance_m
        for record in self.recent_disappearances:
            gap = timestamp - record["last_timestamp"]
            if gap < 0 or gap > self.max_gap_seconds:
                continue
            dist = math.dist(position, record["last_position"])
            if dist < best_dist:
                best_dist = dist
                best = record
        return best["person_id"] if best else None

    def update(
        self,
        detections: list[dict],
        timestamp: float,
        frame_index: int,
    ) -> list[dict]:
        """Assign stable person_ids to the current frame's detections.

        Args:
            detections: list of detection dicts (each with `track_id` and `floor_point`)
            timestamp: current video time in seconds
            frame_index: current frame number

        Returns:
            A new list of detections, each decorated with `person_id`.
        """
        # Track which raw track ids were active this frame
        active_tracks = set()

        for detection in detections:
            raw_id = detection["track_id"]
            position = detection.get("floor_point")
            active_tracks.add(raw_id)

            if position is None:
                continue

            # Already mapped to a stable person?
            pid = self.track_to_person.get(raw_id)
            if pid is not None and self.people[pid]["active"]:
                # Keep it, update position/timestamp
                self.people[pid].update(
                    last_position=position,
                    last_timestamp=timestamp,
                    last_frame=frame_index,
                    active=True,
                )
            else:
                # Either never seen or its person was cleaned up:
                # try to link to a recently disappeared person.
                linked = self._reidentify(position, timestamp, frame_index)
                if linked is not None and self.people[linked]["active"] is False:
                    pid = linked
                    self.people[pid].update(
                        last_position=position,
                        last_timestamp=timestamp,
                        last_frame=frame_index,
                        active=True,
                    )
                else:
                    pid = self._assign_new_person()
                    self.people[pid].update(
                        last_position=position,
                        last_timestamp=timestamp,
                        last_frame=frame_index,
                        active=True,
                    )
                self.track_to_person[raw_id] = pid

            detection["person_id"] = pid

        # Clean up people that are no longer active this frame -> mark inactive and
        # record their disappearance for possible re-identification.
        self.recent_disappearances = [
            record for record in self.recent_disappearances
            if timestamp - record["last_timestamp"] <= self.max_gap_seconds
        ]
        for pid, info in list(self.people.items()):
            if info["active"] and pid not in {d.get("person_id") for d in detections}:
                if info["last_position"] is not None:
                    self.recent_disappearances.append(
                        {
                            "person_id": pid,
                            "last_position": info["last_position"],
                            "last_timestamp": timestamp,
                        }
                    )
                info["active"] = False

        return detections
