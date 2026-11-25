"""3D camera model using pinhole projection.

Provides projection from 3D world coordinates to 2D normalized image coordinates
and inverse operations (ray casting) for proper height-aware spatial analysis.
"""
from __future__ import annotations

import math

import numpy as np


# Default camera parameters for typical retail security cameras
DEFAULT_CAMERA_HEIGHT_M = 2.8
DEFAULT_PITCH_DEG = -25.0  # negative = looking down
DEFAULT_YAW_DEG = 0.0
DEFAULT_ROLL_DEG = 0.0
DEFAULT_FOCAL_LENGTH_PX = 1200.0
DEFAULT_PRINCIPAL_POINT = (0.5, 0.5)


def _rotation_matrix_from_euler(pitch_deg: float, yaw_deg: float, roll_deg: float) -> np.ndarray:
    """Build a 3x3 rotation matrix from Euler angles (degrees).

    Convention: pitch around X (tilt up/down), yaw around Y (pan left/right),
    roll around Z (tilt sideways). Applied as R = Rz * Ry * Rx.
    """
    pitch = math.radians(pitch_deg)
    yaw = math.radians(yaw_deg)
    roll = math.radians(roll_deg)

    cos_p, sin_p = math.cos(pitch), math.sin(pitch)
    cos_y, sin_y = math.cos(yaw), math.sin(yaw)
    cos_r, sin_r = math.cos(roll), math.sin(roll)

    # Rx (pitch)
    Rx = np.array([[1, 0, 0], [0, cos_p, -sin_p], [0, sin_p, cos_p]])
    # Ry (yaw)
    Ry = np.array([[cos_y, 0, sin_y], [0, 1, 0], [-sin_y, 0, cos_y]])
    # Rz (roll)
    Rz = np.array([[cos_r, -sin_r, 0], [sin_r, cos_r, 0], [0, 0, 1]])

    return Rz @ Ry @ Rx


def build_projection_matrix(model_3d: dict, floor_width: float, floor_depth: float) -> np.ndarray:
    """Build the 3x4 projection matrix P = K [R | t] for 3D-to-2D projection.

    World coordinate system: X = floor right, Y = up (height), Z = floor forward (depth).
    Camera is positioned at (floor_width/2, camera_height, 0) looking toward the floor center.

    Args:
        model_3d: dict with keys: height, pitch, yaw, roll, focal_length, principal_point
        floor_width: floor width in meters
        floor_depth: floor depth in meters

    Returns:
        3x4 numpy array (projection matrix)
    """
    height = model_3d.get("height", DEFAULT_CAMERA_HEIGHT_M)
    pitch = model_3d.get("pitch", DEFAULT_PITCH_DEG)
    yaw = model_3d.get("yaw", DEFAULT_YAW_DEG)
    roll = model_3d.get("roll", DEFAULT_ROLL_DEG)
    focal = model_3d.get("focal_length", DEFAULT_FOCAL_LENGTH_PX)
    cx, cy = model_3d.get("principal_point", DEFAULT_PRINCIPAL_POINT)

    # Intrinsic matrix K (normalized coordinates)
    # Using normalized coords so focal length is in "normalized pixels"
    # For a 1920px wide image with focal=1200, normalized focal = 1200/1920 = 0.625
    # But we keep it as-is and normalize at projection time
    K = np.array([
        [focal, 0, cx],
        [0, focal, cy],
        [0, 0, 1],
    ])

    # Rotation: camera looks from above toward floor center
    R = _rotation_matrix_from_euler(pitch, yaw, roll)

    # Camera position in world coordinates (centered on floor, at height)
    camera_pos = np.array([floor_width / 2.0, height, 0.0])

    # Extrinsic [R | t] where t = -R * camera_pos
    t = -R @ camera_pos
    extrinsic = np.hstack([R, t.reshape(3, 1)])

    # Full projection P = K @ extrinsic
    P = K @ extrinsic
    return P


def project_3d_to_image(P: np.ndarray, point_3d: tuple[float, float, float] | list[float]) -> tuple[float, float] | None:
    """Project a 3D world point to normalized image coordinates (u, v).

    Args:
        P: 3x4 projection matrix
        point_3d: (X, Y, Z) in world coordinates

    Returns:
        (u, v) in normalized coords (0..1), or None if behind camera
    """
    x, y, z = point_3d
    pt = np.array([x, y, z, 1.0])
    projected = P @ pt
    w = projected[2]
    if abs(w) < 1e-10:
        return None
    u = projected[0] / w
    v = projected[1] / w
    return (float(u), float(v))


def build_inverse_projection(P: np.ndarray) -> np.ndarray | None:
    """Compute the pseudoinverse of P for unprojection (2D -> ray in 3D).

    Returns:
        4x3 pseudoinverse matrix, or None if P is singular
    """
    try:
        return np.linalg.pinv(P)
    except np.linalg.LinAlgError:
        return None


def unproject_to_ray(P: np.ndarray, u: float, v: float) -> tuple[np.ndarray, np.ndarray]:
    """Unproject a normalized image point to a 3D ray.

    Args:
        P: 3x4 projection matrix
        u, v: normalized image coordinates

    Returns:
        (origin, direction) where origin is the real camera center and direction is a
        unit vector pointing from the camera toward the projected world point.
    """
    pt = np.array([u, v, 1.0])
    world_pt = np.linalg.pinv(P) @ pt
    point_on_ray = world_pt[:3] / world_pt[3] if abs(world_pt[3]) > 1e-10 else world_pt[:3]

    origin = get_camera_center(P)
    if origin is None:
        # Degenerate projection: fall back to a downward ray from the projected point.
        return point_on_ray, np.array([0.0, -1.0, 0.0])

    direction = point_on_ray - origin
    norm = float(np.linalg.norm(direction))
    if norm < 1e-10:
        direction = np.array([0.0, -1.0, 0.0])
    else:
        direction = direction / norm
    return origin, direction


def ray_plane_intersection(origin: np.ndarray, direction: np.ndarray, plane_y: float) -> np.ndarray | None:
    """Intersect a ray with a horizontal plane at height plane_y.

    Args:
        origin: ray origin (camera position)
        direction: ray direction (unit vector)
        plane_y: Y coordinate of the horizontal plane (height in meters)

    Returns:
        (X, Y, Z) intersection point, or None if ray is parallel to plane
    """
    if abs(direction[1]) < 1e-10:
        return None  # Ray parallel to plane

    t = (plane_y - origin[1]) / direction[1]
    if t < 0:
        return None  # Intersection behind camera

    intersection = origin + t * direction
    return intersection


def unproject_image_to_floor(P: np.ndarray, u: float, v: float, floor_y: float = 0.0) -> tuple[float, float] | None:
    """Unproject a normalized image point to floor coordinates (x, z) at given height.

    Args:
        P: 3x4 projection matrix
        u, v: normalized image coordinates
        floor_y: height of the plane to intersect with (default 0 = floor)

    Returns:
        (x, z) in floor meters, or None if intersection fails
    """
    origin, direction = unproject_to_ray(P, u, v)
    point_3d = ray_plane_intersection(origin, direction, floor_y)
    if point_3d is None:
        return None
    return (float(point_3d[0]), float(point_3d[2]))


def project_floor_to_image(P: np.ndarray, x: float, z: float, y: float = 0.0) -> tuple[float, float] | None:
    """Project a floor point (x, z) at given height to normalized image coordinates.

    Convenience wrapper around project_3d_to_image.
    """
    return project_3d_to_image(P, (x, y, z))


def get_camera_center(P: np.ndarray) -> np.ndarray | None:
    """Extract camera center position from projection matrix.

    The camera center is the null space of P (P @ C = 0).
    """
    try:
        U, S, Vt = np.linalg.svd(P)
        C = Vt[-1]
        if abs(C[3]) < 1e-10:
            return None
        return C[:3] / C[3]
    except np.linalg.LinAlgError:
        return None


def model_3d_from_config(camera: dict, floor_width: float, floor_depth: float) -> dict | None:
    """Extract 3D model from camera config, building projection matrix if enabled.

    Returns:
        dict with keys: enabled, projection, inverse_projection, camera_center, params
        or None if 3D model is not enabled
    """
    model = camera.get("model_3d")
    if not model or not model.get("enabled"):
        return None

    P = build_projection_matrix(model, floor_width, floor_depth)
    P_inv = build_inverse_projection(P)
    camera_center = get_camera_center(P)

    return {
        "enabled": True,
        "projection": P,
        "inverse_projection": P_inv,
        "camera_center": camera_center,
        "params": {
            "height": model.get("height", DEFAULT_CAMERA_HEIGHT_M),
            "pitch": model.get("pitch", DEFAULT_PITCH_DEG),
            "yaw": model.get("yaw", DEFAULT_YAW_DEG),
            "roll": model.get("roll", DEFAULT_ROLL_DEG),
            "focal_length": model.get("focal_length", DEFAULT_FOCAL_LENGTH_PX),
            "principal_point": model.get("principal_point", list(DEFAULT_PRINCIPAL_POINT)),
        },
    }
