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
        self.thresholds = self._normalize_thresholds(configuration.get("thresholds") or {})
        self.track_motion: dict[int, tuple[list[float], float]] = {}
        self.active: dict[int, dict] = {}
        self.last_timestamp = 0.0
        self.pickup_reach = float(self.thresholds.get("pickup_reach_m", 0.5))
        self.pickup_min_seconds = float(self.thresholds.get("pickup_min_seconds", 0.6))
        # Cooldown between two pick-ups of the same track inside the SAME gondola stay.
        # Default (None) means a single pick-up per stay, which guarantees pickups never
        # exceed interactions. A numeric value (seconds) relaxes that to allow re-arming
        # after the hand leaves the reach for that many seconds.
        raw_cooldown = self.thresholds.get("pickup_cooldown_s")
        self.pickup_cooldown_s = float(raw_cooldown) if raw_cooldown is not None else None
        self.gondolas = {
            item["id"]: {
                **item,
                "visitors": set(),
                "seen_cells": set(),
                "dwell_seconds": 0.0,
                "interactions": 0,
                "pickups": 0,
                "states": defaultdict(int),
                "matrices": {"traffic": empty_matrix(), "dwell": empty_matrix(), "interaction": empty_matrix(), "pickup": empty_matrix()},
                "product_events": defaultdict(int),
                "pickup_events": [],
                "engagements": [],
                "interaction_durations": [],
            }
            for item in configuration["gondolas"]
        }

    @staticmethod
    def _normalize_thresholds(thresholds: dict) -> dict:
        normalized = {
            "approach_m": 1.5,
            "engaged_m": 0.8,
            "engaged_seconds": 1.2,
            "interaction_seconds": 2.5,
            "max_speed_m_s": 1.2,
            "minimum_track_seconds": 1.0,
            "pickup_reach_m": 0.65,
            "pickup_min_seconds": 0.35,
            "pickup_cooldown_s": None,
        }
        normalized.update({key: value for key, value in thresholds.items() if value is not None})
        if "hand_reach_m" in thresholds and "pickup_reach_m" not in thresholds:
            normalized["pickup_reach_m"] = thresholds["hand_reach_m"]
        if "pick_min_seconds" in thresholds and "pickup_min_seconds" not in thresholds:
            normalized["pickup_min_seconds"] = thresholds["pick_min_seconds"]
        return normalized

    @staticmethod
    def _refine_row(detection: dict, frame_height: int) -> tuple[int, bool]:
        """Vertical shelf level, refined by a real wrist keypoint when one is available.

        Returns (row, pose_verified). The geometric proxy (body center height) is a low
        confidence fallback; a real wrist gives a closer approximation of the touched level.
        """
        hands = detection.get("hand_points_real")
        if hands:
            valid = [hand[1] for hand in hands if hand[0] > 0 and hand[1] > 0]
            if valid:
                row = min(2, max(0, int((min(valid) / frame_height) * 3)))
                return row, True
        row = min(2, max(0, int((detection["body_center_y"] / frame_height) * 3)))
        return row, False

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

    def observe(self, detection: dict, timestamp: float, dt: float, frame_height: int, hand_point: list[float] | None = None) -> dict:
        track_id = detection["track_id"]
        point = detection["floor_point"]
        self.last_timestamp = max(self.last_timestamp, timestamp)
        previous = self.track_motion.get(track_id)
        speed = 0.0
        if previous and timestamp > previous[1]:
            speed = math.dist(point, previous[0]) / (timestamp - previous[1])
        self.track_motion[track_id] = (point, timestamp)

        # Extract 3D keypoint data for shelf-level detection if available
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
            return {"state": "PASS", "speed": round(speed, 3), "gondola_id": None, "interaction": False, "pickup": False}

        nearest = min(
            self.configuration["gondolas"],
            key=lambda item: SpatialEngine.distance_to_gondola(point, item),
        )
        distance = SpatialEngine.distance_to_gondola(point, nearest)
        state = self.active.setdefault(
            track_id,
            {"gondola_id": None, "seconds": 0.0, "engaged": False, "interaction": False, "engaged_since": None, "interaction_since": None, "had_interaction": False},
        )
        self._ensure_hand(state)
        if distance > self.thresholds["approach_m"]:
            if state["gondola_id"]:
                self._finalize(state, self.gondolas[state["gondola_id"]], timestamp)
            self._reset_hand(state)
            state.update({"gondola_id": None, "seconds": 0.0, "engaged": False, "interaction": False, "engaged_since": None, "interaction_since": None, "had_interaction": False})
            return {"state": "PASS", "speed": speed, "gondola_id": None, "interaction": False, "pickup": False}

        if state["gondola_id"] != nearest["id"]:
            if state["gondola_id"]:
                self._finalize(state, self.gondolas[state["gondola_id"]], timestamp)
            self._reset_hand(state)
            state.update({"gondola_id": nearest["id"], "seconds": 0.0, "engaged": False, "interaction": False, "engaged_since": None, "interaction_since": None, "had_interaction": False})
            self._reset_hand(state)
        state["seconds"] += dt
        state_name = "APPROACH"
        if distance <= self.thresholds["engaged_m"] and speed <= self.thresholds["max_speed_m_s"] and state["seconds"] >= self.thresholds["engaged_seconds"]:
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
        # Determine shelf level (row) - use 3D height if available, fallback to body proxy.
        # The fallback keeps the pick-up refinement: a real wrist keypoint refines the level,
        # otherwise it is a low-confidence body-position proxy.
        row = 0  # default to bottom shelf
        row_pose_verified = False
        if wrist_height_3d is not None:
            # Use 3D wrist height to determine shelf level based on tier_heights
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
            # Fallback: low-confidence body-position proxy, refined by real wrists when available
            (row, row_pose_verified) = self._refine_row(detection, frame_height)
        detection["row_pose_verified"] = row_pose_verified
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

        pickup, interaction_now = self._observe_pickup(state, data, nearest, detection, hand_point, timestamp, dt, row, column)
        if interaction_now:
            # A reach that fired before the interaction_seconds mark is a real hand-product
            # touch: report it as the stay's interaction too (state_name is cosmetic here).
            interaction = True
            if state_name != "INTERACTION":
                state_name = "INTERACTION"
        return {"state": state_name, "speed": round(speed, 3), "gondola_id": nearest["id"], "interaction": interaction, "pickup": pickup}

    def _ensure_hand(self, state: dict) -> None:
        state.setdefault("hand_inside", False)
        state.setdefault("pickup_counted", False)
        state.setdefault("hand_since", None)
        state.setdefault("hand_out_since", None)
        state.setdefault("pickup_cell", None)
        state.setdefault("pickup_amplitude", 0.0)
        state.setdefault("pickup_since", None)

    def _reset_hand(self, state: dict) -> None:
        state.update({"hand_inside": False, "pickup_counted": False, "hand_since": None, "hand_out_since": None, "pickup_cell": None, "pickup_amplitude": 0.0, "pickup_since": None})

    def _observe_pickup(
        self,
        state: dict,
        data: dict,
        gondola: dict,
        detection: dict,
        hand_point: list[float] | None,
        timestamp: float,
        dt: float,
        row: int,
        column: int,
    ) -> tuple[bool, bool]:
        """Infers a probable shelf pick-up when the estimated hand reaches into the gondola
        while the person is engaged (close + slow + long enough) and holds it for
        ``pickup_min_seconds``.

        Anti-false-positive rules:
        * Requires an engaged stay (approach distance, low speed, ``engaged_seconds``);
          a hand that passes by without stopping is never counted.
        * Single pick-up per stay by default: ``pickup_counted`` is only re-armed when the
          person leaves the current stay (see ``observe``/``_reset_hand``). A numeric
          ``pickup_cooldown_s`` relaxes this to re-arm after the hand clears for that many
          seconds.
        * The reported column is derived from the HAND (not the foot) so the 3x3 cell
          matches the reach.
        * The reported position is anchored to the gondola footprint so a pick never lands
          far outside the gondola due to the perspective-distorted hand projection.

        Returns ``(pickup, interaction_now)``. When a reach registers before the
        ``interaction_seconds`` mark it is also credited as the stay's interaction, so the
        exported ``pickups <= interactions`` invariant holds and a short genuine grab is not
        lost just because the person did not linger a full interaction window.
        """
        inside = False
        if hand_point is not None:
            inside = SpatialEngine.distance_to_gondola(hand_point, gondola) <= self.pickup_reach

        if not inside:
            state["hand_inside"] = False
            state["hand_since"] = None
            if state["hand_out_since"] is None:
                state["hand_out_since"] = timestamp
            return False, False

        # Hand is inside again: compute the time it was out (from when it left until now)
        # BEFORE clearing the marker, so a configured cooldown can re-arm the counter.
        out_seconds = 0.0
        if state["hand_out_since"] is not None:
            out_seconds = timestamp - state["hand_out_since"]
        state["hand_out_since"] = None
        if state["hand_since"] is None:
            state["hand_since"] = timestamp
        state["hand_inside"] = True

        # A pick is only counted while the person is genuinely engaged (close + slow +
        # enough time). Hand inside without engagement is appreciated but not a pick-up.
        if not state["engaged"]:
            return False, False

        row_id, column_id = row, column
        if hand_point is not None:
            # Column from the hand reach, in the gondola's own (rotated) frame,
            # so the cell matches where the hand actually goes.
            local_u, _ = SpatialEngine.local_offset(hand_point, gondola)
            relative_x = (local_u + gondola["width"] / 2) / gondola["width"]
            column_id = min(2, max(0, int(relative_x * 3)))

        if state["pickup_counted"]:
            # A pick already fired this stay. Only re-arm if a cooldown is configured and
            # the hand has been out of reach for at least that long.
            if self.pickup_cooldown_s is not None and state["pickup_since"] is not None:
                if (timestamp - state["pickup_since"]) >= self.pickup_cooldown_s and out_seconds >= self.pickup_cooldown_s:
                    state["pickup_counted"] = False
                else:
                    return False, False
            else:
                return False, False

        if (timestamp - state["hand_since"]) < self.pickup_min_seconds:
            return False, False

        state["pickup_counted"] = True
        state["pickup_since"] = timestamp
        data["pickups"] += 1
        data["matrices"]["pickup"][row_id][column_id] += 1
        state["pickup_cell"] = (row_id, column_id)
        product = gondola.get("products", [[None] * 3 for _ in range(3)])[row_id][column_id]
        if product:
            data["product_events"][product] += 1
        interaction_now = False
        if not state["interaction"]:
            # A genuine reach that did not wait for the interaction_seconds mark is still a
            # hand-product touch: credit it as the stay's single interaction so pickups never
            # exceed interactions in the exports and the later ENGAGED->INTERACTION
            # transition (which requires `not state["interaction"]`) does not double-count.
            state["interaction"] = True
            state["had_interaction"] = True
            if state["interaction_since"] is None:
                state["interaction_since"] = timestamp
            data["interactions"] += 1
            data["matrices"]["interaction"][row_id][column_id] += 1
            interaction_now = True
        # Anchor the reported location to the gondola (avoids out-of-rectangle picks).
        anchor = SpatialEngine.nearest_point_on_gondola(hand_point, gondola) if hand_point is not None else [gondola["x"], gondola["z"]]
        data["pickup_events"].append({"t": round(timestamp, 2), "track_id": detection["track_id"], "x": anchor[0], "z": anchor[1], "row": row_id, "column": column_id, "product": product, "pose_verified": bool(detection.get("hand_pose_verified", False)) or bool(detection.get("row_pose_verified", False))})
        return True, interaction_now

    def results(self) -> list[dict]:
        payload = []
        for data in self.gondolas.values():
            visitors = len(data["visitors"])
            interactions = data["interactions"]
            pickups = data["pickups"]
            for state in self.active.values():
                if state["gondola_id"] == data["id"]:
                    self._finalize(state, data, self.last_timestamp)
            engagements = data["engagements"]
            interaction_durations = data["interaction_durations"]
            payload.append(
                {
                    "id": data["id"], "name": data["name"], "x": data["x"], "z": data["z"],
                    "width": data["width"], "depth": data["depth"], "rotation": data.get("rotation", 0), "segments": data["segments"],
                    "products": data.get("products", []), "visitors": visitors,
                    "traffic": visitors, "dwell_seconds": round(data["dwell_seconds"], 2),
                    "dwell_avg_seconds": round(data["dwell_seconds"] / visitors, 2) if visitors else 0.0,
                    "interactions": interactions,
                    "pickups": pickups,
                    "pickup_ratio_percent": round(pickups / interactions * 100, 1) if interactions else 0.0,
                    "conversion_percent": round(interactions / visitors * 100, 1) if visitors else 0.0,
                    "engagement_avg_seconds": round(sum(engagements) / len(engagements), 2) if engagements else 0.0,
                    "interaction_avg_seconds": round(sum(interaction_durations) / len(interaction_durations), 2) if interaction_durations else 0.0,
                    "states": dict(data["states"]),
                    "matrices": {key: [[round(value, 2) for value in row] for row in matrix] for key, matrix in data["matrices"].items()},
                    "product_events": [{"product": key, "events": value} for key, value in data["product_events"].items()],
                    "pickup_events": data["pickup_events"],
                    "vertical_confidence": "pose_keypoints_when_available",
                }
            )
        return payload
