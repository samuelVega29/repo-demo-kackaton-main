from pathlib import Path

from ultralytics import YOLO


# YOLO11-pose COCO keypoint indices (17 keypoints)
# 0: nose, 1: left_eye, 2: right_eye, 3: left_ear, 4: right_ear,
# 5: left_shoulder, 6: right_shoulder, 7: left_elbow, 8: right_elbow,
# 9: left_wrist, 10: right_wrist, 11: left_hip, 12: right_hip,
# 13: left_knee, 14: right_knee, 15: left_ankle, 16: right_ankle

KEYPOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]

# Skeleton connections for pose rendering
SKELETON_CONNECTIONS = [
    (0, 1), (0, 2), (1, 3), (2, 4),           # head
    (5, 6),                                     # shoulders
    (5, 7), (7, 9), (6, 8), (8, 10),          # arms
    (5, 11), (6, 12),                           # torso
    (11, 12),                                   # hips
    (11, 13), (13, 15), (12, 14), (14, 16),   # legs
]


def _find_model(detection_only: bool) -> Path:
    """Resolve model path: prefer exported, then bundled, then bare name."""
    project_root = Path(__file__).resolve().parents[3]
    if detection_only:
        exported = project_root / "models" / "exported" / "people-yolo11n.pt"
        bundled = project_root / "backend" / "yolo11n.pt"
    else:
        exported = project_root / "models" / "exported" / "yolo11n-pose.pt"
        bundled = project_root / "backend" / "yolo11n-pose.pt"
    model_path = exported if exported.exists() else bundled
    return model_path if model_path.exists() else Path("yolo11n-pose.pt" if not detection_only else "yolo11n.pt")


class PersonDetector:
    """Runs pretrained person detection and Ultralytics ByteTrack.

    Supports two modes:
    - detection_only=True  (default): YOLO11n for bounding boxes only
    - detection_only=False:          YOLO11n-pose for bounding boxes + 17 keypoints
    """

    def __init__(self, detection_only: bool = True) -> None:
        self.detection_only = detection_only
        model_path = _find_model(detection_only)
        self.model_path = model_path
        print(f"[DETECTOR] Loading {'detection' if detection_only else 'pose'} model: {model_path}")
        self.model = YOLO(str(model_path))

    def track(self, frame):
        result = self.model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[0],
            conf=0.3,
            iou=0.5,
            verbose=False,
        )[0]
        detections = []
        if result.boxes is None or result.boxes.id is None:
            return result, detections
        boxes = result.boxes.xyxy.cpu().numpy()
        confidences = result.boxes.conf.cpu().numpy()
        track_ids = result.boxes.id.int().cpu().tolist()
        for idx, (box, confidence, track_id) in enumerate(zip(boxes, confidences, track_ids)):
            x1, y1, x2, y2 = [float(value) for value in box]
            detection = {
                "track_id": track_id,
                "bbox": [round(x1), round(y1), round(x2), round(y2)],
                "confidence": round(float(confidence), 3),
                "image_point": [(x1 + x2) / 2, y2],
                "body_center_y": (y1 + y2) / 2,
            }
            # Extract pose keypoints if available
            if not self.detection_only and result.keypoints is not None:
                detection["keypoints"] = self._extract_keypoints(result.keypoints, idx)
            detections.append(detection)
        return result, detections

    def _extract_keypoints(self, keypoints_data, idx: int) -> list[list[float] | None]:
        """Extracts 17 keypoints as [[x, y, conf], ...] or None entries."""
        if keypoints_data is None or keypoints_data.xy is None:
            return [None] * 17
        xy = keypoints_data.xy.cpu().numpy()
        conf = keypoints_data.conf.cpu().numpy() if keypoints_data.conf is not None else None
        if idx >= len(xy):
            return [None] * 17
        kpts_xy = xy[idx]
        kpts_conf = conf[idx] if conf is not None else [0.0] * len(kpts_xy)
        result = []
        for kp, c in zip(kpts_xy, kpts_conf):
            if float(c) > 0.1:
                result.append([round(float(kp[0]), 1), round(float(kp[1]), 1), round(float(c), 3)])
            else:
                result.append(None)
        return result
