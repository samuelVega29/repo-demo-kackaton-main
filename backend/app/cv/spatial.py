from __future__ import annotations

import math

import cv2
import numpy as np

from .camera3d import (
    build_projection_matrix,
    build_inverse_projection,
    get_camera_center,
    model_3d_from_config,
    project_3d_to_image,
    project_floor_to_image,
    unproject_image_to_floor,
)


def with_homographies(configuration: dict) -> dict:
    """Returns a copy of the site configuration with the normalized homography and its inverse.

    The normalized homography maps normalized camera coordinates (0..1) to floor meters and is
    independent of the encoded video resolution, so the frontend and overlay views can reuse it.
    """
    camera = configuration.get("camera") or {}
    source = camera.get("source_normalized")
    target = camera.get("target_meters")
    if source and target and len(source) == 4 and len(target) == 4:
        forward, inverse = SpatialEngine.normalized_pair(camera)
        camera = {
            **camera,
            "homography": forward.round(6).tolist(),
            "homography_inv": inverse.round(6).tolist(),
        }

    # Include 3D model data if enabled
    model_3d = camera.get("model_3d")
    if model_3d and model_3d.get("enabled"):
        floor = configuration.get("floor", {})
        floor_width = floor.get("width", 10.0)
        floor_depth = floor.get("depth", 8.0)
        model_data = model_3d_from_config(camera, floor_width, floor_depth)
        if model_data:
            camera = {
                **camera,
                "model_3d_projection": model_data["projection"].round(6).tolist(),
                "model_3d_inverse": model_data["inverse_projection"].round(6).tolist() if model_data["inverse_projection"] is not None else None,
                "model_3d_camera_center": model_data["camera_center"].round(6).tolist() if model_data["camera_center"] is not None else None,
            }

    return {**configuration, "camera": camera}


class SpatialEngine:
    """Projects camera pixels into the configured site floor using a homography or 3D model."""

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
        self.homography = cv2.getPerspectiveTransform(source, target)

        # Initialize 3D model if enabled
        self.model_3d = model_3d_from_config(
            camera,
            self.floor.get("width", 10.0),
            self.floor.get("depth", 8.0),
        )

    @staticmethod
    def normalized_pair(camera: dict) -> tuple[np.ndarray, np.ndarray]:
        """Builds (normalized image -> floor) and (floor -> normalized image) homographies."""
        source = np.float32(camera["source_normalized"])
        target = np.float32(camera["target_meters"])
        forward = cv2.getPerspectiveTransform(source, target)
        inverse = cv2.getPerspectiveTransform(target, source)
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
    def local_offset(point: list[float], gondola: dict) -> tuple[float, float]:
        """Projects a floor point into the gondola's own (unrotated) frame, centered on it.

        `rotation` is degrees, clockwise, about the gondola's center — matching the
        frontend's CSS `rotate()` convention used in the planogram editor and the 3D view.
        """
        x, z = point
        cx = gondola["x"] + gondola["width"] / 2
        cz = gondola["z"] + gondola["depth"] / 2
        theta = math.radians(gondola.get("rotation") or 0)
        dx, dz = x - cx, z - cz
        cos_t, sin_t = math.cos(theta), math.sin(theta)
        return dx * cos_t + dz * sin_t, -dx * sin_t + dz * cos_t

    @classmethod
    def distance_to_gondola(cls, point: list[float], gondola: dict) -> float:
        local_u, local_v = cls.local_offset(point, gondola)
        cu = max(abs(local_u) - gondola["width"] / 2, 0.0)
        cv = max(abs(local_v) - gondola["depth"] / 2, 0.0)
        return math.hypot(cu, cv)

    @classmethod
    def nearest_point_on_gondola(cls, point: list[float], gondola: dict) -> list[float]:
        """Clamps a floor point to the closest point on the gondola footprint (in meters).

        Works in the gondola's own rotated frame so a pick-up inside an inclined gondola
        anchors to its real footprint. An inside point is returned unchanged; otherwise the
        nearest boundary point is returned.
        """
        x, z = point
        cx = gondola["x"] + gondola["width"] / 2
        cz = gondola["z"] + gondola["depth"] / 2
        theta = math.radians(gondola.get("rotation") or 0)
        dx, dz = x - cx, z - cz
        cos_t, sin_t = math.cos(theta), math.sin(theta)
        u = dx * cos_t + dz * sin_t
        v = -dx * sin_t + dz * cos_t
        cu = min(max(u, -gondola["width"] / 2), gondola["width"] / 2)
        cv = min(max(v, -gondola["depth"] / 2), gondola["depth"] / 2)
        rx = cx + cu * cos_t - cv * sin_t
        rz = cz + cu * sin_t + cv * cos_t
        return [round(float(rx), 3), round(float(rz), 3)]

    # ---- 3D projection methods ----

    @property
    def has_3d_model(self) -> bool:
        """Check if 3D camera model is available."""
        return self.model_3d is not None and self.model_3d.get("enabled", False)

    def project_3d(self, x: float, y: float, z: float) -> tuple[float, float] | None:
        """Project a 3D world point to normalized image coordinates using the 3D model.

        Args:
            x: floor coordinate (meters, right)
            y: height above floor (meters, up)
            z: floor coordinate (meters, forward/depth)

        Returns:
            (u, v) in normalized coords (0..1), or None if behind camera
        """
        if not self.has_3d_model:
            return None

        result = project_3d_to_image(self.model_3d["projection"], (x, y, z))
        if result is None:
            return None

        u, v = result
        # Clamp to valid range
        if not (-0.5 <= u <= 1.5 and -0.5 <= v <= 1.5):
            return None
        return (round(u, 6), round(v, 6))

    def project_3d_to_pixel(self, x: float, y: float, z: float) -> list[float] | None:
        """Project a 3D world point to pixel coordinates (considering frame size)."""
        result = self.project_3d(x, y, z)
        if result is None:
            return None
        u, v = result
        return [round(u * self.frame_width, 2), round(v * self.frame_height, 2)]

    def unproject_to_floor_3d(self, u: float, v: float, height: float = 0.0) -> tuple[float, float] | None:
        """Unproject normalized image coordinates to floor (x, z) at given height using the 3D model.

        Args:
            u, v: normalized image coordinates
            height: height above floor to intersect with (default 0 = floor level)

        Returns:
            (x, z) in floor meters, or None if intersection fails
        """
        if not self.has_3d_model or self.model_3d["inverse_projection"] is None:
            return None

        result = unproject_image_to_floor(
            self.model_3d["projection"],
            u, v, height,
        )
        if result is None:
            return None

        x, z = result
        if not (-0.5 <= x <= self.floor["width"] + 0.5 and -0.5 <= z <= self.floor["depth"] + 0.5):
            return None
        return (round(x, 3), round(z, 3))

    def unproject_pixel_to_floor_3d(self, px: float, py: float, height: float = 0.0) -> tuple[float, float] | None:
        """Unproject pixel coordinates to floor (x, z) at given height using the 3D model."""
        u = px / self.frame_width
        v = py / self.frame_height
        return self.unproject_to_floor_3d(u, v, height)

    def project_floor_3d(self, x: float, z: float, y: float = 0.0) -> tuple[float, float] | None:
        """Project a floor point at given height to normalized image coordinates using the 3D model."""
        return self.project_3d(x, y, z)

    def project_floor_3d_to_pixel(self, x: float, z: float, y: float = 0.0) -> list[float] | None:
        """Project a floor point at given height to pixel coordinates using the 3D model."""
        return self.project_3d_to_pixel(x, y, z)

    def get_camera_position(self) -> tuple[float, float, float] | None:
        """Get the camera's 3D position in world coordinates."""
        if not self.has_3d_model or self.model_3d["camera_center"] is None:
            return None
        center = self.model_3d["camera_center"]
        return (float(center[0]), float(center[1]), float(center[2]))
