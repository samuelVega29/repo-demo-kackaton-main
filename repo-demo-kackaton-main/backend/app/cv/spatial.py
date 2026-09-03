from __future__ import annotations

import math

import cv2
import numpy as np


def with_homographies(configuration: dict) -> dict:
    """Returns a copy of the site configuration with the normalized homography and its inverse.

    The normalized homography maps normalized camera coordinates (0..1) to floor meters and is
    independent of the encoded video resolution, so the frontend and overlay views can reuse it.
    """
    camera = configuration.get("camera") or {}
    source = camera.get("source_normalized")
    target = camera.get("target_meters")
    if (
        source
        and target
        and len(source) >= 4
        and len(target) == len(source)
    ):
        forward, inverse = SpatialEngine.normalized_pair(camera)
        camera = {
            **camera,
            "homography": forward.round(6).tolist(),
            "homography_inv": inverse.round(6).tolist(),
        }
    return {**configuration, "camera": camera}


class SpatialEngine:
    """Projects camera pixels into the configured site floor using a homography."""

    def __init__(self, configuration: dict, frame_width: int, frame_height: int) -> None:
        self.configuration = configuration
        self.floor = configuration["floor"]
        camera = configuration["camera"]
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.homography_norm, self.homography_norm_inv = self.normalized_pair(camera)
        source = np.float32(
            [[x * frame_width, y * frame_height] for x, y in camera["source_normalized"]]
        )
        target = np.float32(camera["target_meters"])
        self.homography = cv2.findHomography(source, target, method=0)[0]

    @staticmethod
    def normalized_pair(camera: dict) -> tuple[np.ndarray, np.ndarray]:
        """Builds (normalized image -> floor) and (floor -> normalized image) homographies."""
        source = np.float32(camera["source_normalized"])
        target = np.float32(camera["target_meters"])
        forward = cv2.findHomography(source, target, method=0)[0]
        inverse = cv2.findHomography(target, source, method=0)[0]
        return forward, inverse

    def project(self, point: list[float]) -> list[float] | None:
        source = np.float32([[point]])
        x, z = cv2.perspectiveTransform(source, self.homography)[0][0]
        if not (-0.5 <= x <= self.floor["width"] + 0.5 and -0.5 <= z <= self.floor["depth"] + 0.5):
            return None
        return [round(float(x), 3), round(float(z), 3)]

    def project_floor_to_image(self, point: list[float]) -> list[float]:
        """Projects a floor point (meters) back to camera pixel coordinates."""
        source = np.float32([[point]])
        x, y = cv2.perspectiveTransform(source, self.homography_norm_inv)[0][0]
        return [round(float(x) * self.frame_width, 2), round(float(y) * self.frame_height, 2)]

    def zone_at(self, point: list[float]) -> dict | None:
        for zone in self.configuration.get("zones", []):
            polygon = np.float32(zone["polygon"])
            if cv2.pointPolygonTest(polygon, tuple(point), False) >= 0:
                return zone
        return None

    @staticmethod
    def distance_to_gondola(point: list[float], gondola: dict) -> float:
        x, z = point
        dx = max(gondola["x"] - x, 0, x - (gondola["x"] + gondola["width"]))
        dz = max(gondola["z"] - z, 0, z - (gondola["z"] + gondola["depth"]))
        return math.hypot(dx, dz)
