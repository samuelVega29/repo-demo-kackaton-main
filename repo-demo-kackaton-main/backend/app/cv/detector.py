from pathlib import Path

from ultralytics import YOLO


class PersonDetector:
    """Runs pretrained person detection and Ultralytics ByteTrack.

    A second pose model (yolov8n-pose) is loaded when available so that real wrist
    keypoints can refine the hand-reach heuristics for shelf pick-ups. It is optional:
    if the pose checkpoint is missing, detection keeps working with the geometric
    hand estimate.
    """

    def __init__(self) -> None:
        project_root = Path(__file__).resolve().parents[3]
        exported = project_root / "models" / "exported" / "people-yolo11n.pt"
        bundled = project_root / "backend" / "yolo11n.pt"
        self.model_path = exported if exported.exists() else bundled
        self.model = YOLO(str(self.model_path if self.model_path.exists() else "yolo11n.pt"))

        pose_path = project_root / "backend" / "yolov8n-pose.pt"
        self.pose_model = None
        self.pose_available = False
        if pose_path.exists():
            try:
                self.pose_model = YOLO(str(pose_path))
                self.pose_available = True
            except Exception:
                self.pose_model = None
                self.pose_available = False

    def _frame_wrists(self, frame_pixels):
        """Runs the pose model once and returns wrist keypoints (left, right) per detected person.

        Returns a list of aligned [(left_wrist), (right_wrist)] arrays in pixels, or None when the
        pose model is unavailable. Used with the frame-sized tracking image, so the keypoints are
        already in the same pixel space as the person boxes.
        """
        if not self.pose_available or self.pose_model is None:
            return None
        try:
            result = self.pose_model.predict(frame_pixels, classes=[0], conf=0.25, verbose=False)[0]
        except Exception:
            return None
        if result.keypoints is None:
            return None
        keypoints = result.keypoints.xy.cpu().numpy()
        if len(keypoints) == 0:
            return None
        wrists = []
        for kpts in keypoints:
            n = len(kpts)
            left = [int(kpts[9][0]), int(kpts[9][1])] if n > 10 else [0, 0]
            right = [int(kpts[10][0]), int(kpts[10][1])] if n > 10 else [0, 0]
            wrists.append([left, right])
        return wrists

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
        all_wrists = self._frame_wrists(frame)
        for box, confidence, track_id in zip(boxes, confidences, track_ids):
            x1, y1, x2, y2 = [float(value) for value in box]
            hand_points_real = None
            if all_wrists:
                kcx = (x1 + x2) / 2
                kcy = (y1 + y2) / 2
                for left, right in all_wrists:
                    if left[0] <= 0 or left[1] <= 0 or right[0] <= 0 or right[1] <= 0:
                        continue
                    mid_x = (left[0] + right[0]) / 2
                    mid_y = (left[1] + right[1]) / 2
                    if x1 <= mid_x <= x2 and y1 <= mid_y <= y2:
                        hand_points_real = [left, right]
                        break
            detections.append(
                {
                    "track_id": track_id,
                    "bbox": [round(x1), round(y1), round(x2), round(y2)],
                    "confidence": round(float(confidence), 3),
                    "image_point": [(x1 + x2) / 2, y2],
                    "body_center_y": (y1 + y2) / 2,
                    "hand_points": [
                        [x1 + 0.25 * (x2 - x1), y1 + 0.45 * (y2 - y1)],
                        [x2 - 0.25 * (x2 - x1), y1 + 0.45 * (y2 - y1)],
                    ],
                    "hand_points_real": hand_points_real,
                }
            )
        return result, detections
