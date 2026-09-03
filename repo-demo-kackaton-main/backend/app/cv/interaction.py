from __future__ import annotations

import math
from collections import defaultdict

from .spatial import SpatialEngine


def empty_matrix() -> list[list[float]]:
    return [[0.0, 0.0, 0.0] for _ in range(3)]


class InteractionEngine:
    """Infers behavioral states from measured proximity, speed and elapsed time."""

    def __init__(self, configuration: dict) -> None:
        self.configuration = configuration
        self.thresholds = configuration["thresholds"]
        self.track_motion: dict[int, tuple[list[float], float]] = {}
        self.active: dict[int, dict] = {}
        self.last_timestamp = 0.0
        self.gondolas = {
            item["id"]: {
                **item,
                "visitors": set(),
                "seen_cells": set(),
                "dwell_seconds": 0.0,
                "interactions": 0,
                "states": defaultdict(int),
                "matrices": {"traffic": empty_matrix(), "dwell": empty_matrix(), "interaction": empty_matrix()},
                "product_events": defaultdict(int),
                "engagements": [],
                "interaction_durations": [],
            }
            for item in configuration["gondolas"]
        }

    @staticmethod
    def _finalize(state: dict, data: dict, timestamp: float) -> None:
        if state["engaged_since"] is not None:
            elapsed = timestamp - state["engaged_since"]
            if elapsed > 0:
                data["engagements"].append(elapsed)
            if state["had_interaction"] and state["interaction_since"] is not None:
                duration = timestamp - state["interaction_since"]
                if duration > 0:
                    data["interaction_durations"].append(duration)
            state.update({"engaged_since": None, "interaction_since": None, "had_interaction": False})

    def observe(self, detection: dict, timestamp: float, dt: float, frame_height: int) -> dict:
        track_id = detection["track_id"]
        point = detection["floor_point"]
        self.last_timestamp = max(self.last_timestamp, timestamp)
        previous = self.track_motion.get(track_id)
        speed = 0.0
        if previous and timestamp > previous[1]:
            speed = math.dist(point, previous[0]) / (timestamp - previous[1])
        self.track_motion[track_id] = (point, timestamp)

        # Extract3D keypoint data for shelf-level detection if available
        keypoints_3d = detection.get("keypoints_3d")
        wrist_height_3d = None
        if keypoints_3d:
            # Use wrist keypoints (indices 9 and 10) for height estimation
            left_wrist = keypoints_3d[9] if len(keypoints_3d) > 9 and keypoints_3d[9] else None
            right_wrist = keypoints_3d[10] if len(keypoints_3d) > 10 and keypoints_3d[10] else None
            # Get the higher wrist (closer to interaction)
            if left_wrist and right_wrist:
                wrist_height_3d = max(left_wrist[2], right_wrist[2])
            elif left_wrist:
                wrist_height_3d = left_wrist[2]
            elif right_wrist:
                wrist_height_3d = right_wrist[2]

        if not self.configuration.get("gondolas"):
            return {"state": "PASS", "speed": round(speed, 3), "gondola_id": None, "interaction": False}

        nearest = min(
            self.configuration["gondolas"],
            key=lambda item: SpatialEngine.distance_to_gondola(point, item),
        )
        distance = SpatialEngine.distance_to_gondola(point, nearest)
        state = self.active.setdefault(
            track_id,
            {"gondola_id": None, "seconds": 0.0, "engaged": False, "interaction": False, "engaged_since": None, "interaction_since": None, "had_interaction": False},
        )
        if distance > self.thresholds["approach_m"]:
            if state["gondola_id"]:
                self._finalize(state, self.gondolas[state["gondola_id"]], timestamp)
            state.update({"gondola_id": None, "seconds": 0.0, "engaged": False, "interaction": False, "engaged_since": None, "interaction_since": None, "had_interaction": False})
            return {"state": "PASS", "speed": speed, "gondola_id": None, "interaction": False}

        if state["gondola_id"] != nearest["id"]:
            if state["gondola_id"]:
                self._finalize(state, self.gondolas[state["gondola_id"]], timestamp)
            state.update({"gondola_id": nearest["id"], "seconds": 0.0, "engaged": False, "interaction": False, "engaged_since": None, "interaction_since": None, "had_interaction": False})
        state["seconds"] += dt
        state_name = "APPROACH"
        if distance <= self.thresholds["engaged_m"] and speed <= 1.2 and state["seconds"] >= self.thresholds["engaged_seconds"]:
            state_name = "ENGAGED"
            if not state["engaged"] and state["engaged_since"] is None:
                state["engaged_since"] = timestamp
            state["engaged"] = True

        data = self.gondolas[nearest["id"]]
        data["visitors"].add(track_id)
        data["dwell_seconds"] += dt
        data["states"][state_name] += 1
        local_u, _ = SpatialEngine.local_offset(point, nearest)
        relative_x = (local_u + nearest["width"] / 2) / nearest["width"]
        column = min(2, max(0, int(relative_x * 3)))

        # Determine shelf level (row) - use3D height if available, fallback to body proxy
        row = 0  # default to bottom shelf
        if wrist_height_3d is not None:
            # Use3D wrist height to determine shelf level based on tier_heights
            tier_heights = nearest.get("tier_heights", [0.25, 0.73, 1.20])
            shelf_height = nearest.get("height", 1.45)

            # Find which tier the wrist is closest to
            min_distance = float("inf")
            best_row = 0
            for i, tier_height in enumerate(tier_heights):
                distance = abs(wrist_height_3d - tier_height)
                if distance < min_distance:
                    min_distance = distance
                    best_row = i
            row = best_row
        else:
            # Fallback: low-confidence body-position proxy
            row = min(2, max(0, int((detection["body_center_y"] / frame_height) * 3)))
        cell = (track_id, row, column)
        if cell not in data["seen_cells"]:
            data["seen_cells"].add(cell)
            data["matrices"]["traffic"][row][column] += 1
        data["matrices"]["dwell"][row][column] += dt

        interaction = False
        if state_name == "ENGAGED" and state["seconds"] >= self.thresholds["interaction_seconds"] and not state["interaction"]:
            state["interaction"] = True
            state["had_interaction"] = True
            if state["interaction_since"] is None:
                state["interaction_since"] = timestamp
            state_name = "INTERACTION"
            interaction = True
            data["interactions"] += 1
            data["matrices"]["interaction"][row][column] += 1
            product = nearest.get("products", [[None] * 3 for _ in range(3)])[row][column]
            if product:
                data["product_events"][product] += 1
        return {"state": state_name, "speed": round(speed, 3), "gondola_id": nearest["id"], "interaction": interaction}

    def results(self) -> list[dict]:
        payload = []
        for data in self.gondolas.values():
            visitors = len(data["visitors"])
            interactions = data["interactions"]
            for state in self.active.values():
                if state["gondola_id"] == data["id"]:
                    self._finalize(state, data, self.last_timestamp)
            engagements = data["engagements"]
            interaction_durations = data["interaction_durations"]
            payload.append(
                {
                    "id": data["id"], "name": data["name"], "x": data["x"], "z": data["z"],
                    "width": data["width"], "depth": data["depth"], "segments": data["segments"],
                    "products": data.get("products", []), "visitors": visitors,
                    "traffic": visitors, "dwell_seconds": round(data["dwell_seconds"], 2),
                    "dwell_avg_seconds": round(data["dwell_seconds"] / visitors, 2) if visitors else 0.0,
                    "interactions": interactions,
                    "conversion_percent": round(interactions / visitors * 100, 1) if visitors else 0.0,
                    "engagement_avg_seconds": round(sum(engagements) / len(engagements), 2) if engagements else 0.0,
                    "interaction_avg_seconds": round(sum(interaction_durations) / len(interaction_durations), 2) if interaction_durations else 0.0,
                    "states": dict(data["states"]),
                    "matrices": {key: [[round(value, 2) for value in row] for row in matrix] for key, matrix in data["matrices"].items()},
                    "product_events": [{"product": key, "events": value} for key, value in data["product_events"].items()],
                    "vertical_confidence": "low_person_geometry_proxy",
                }
            )
        return payload
