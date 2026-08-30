from pathlib import Path

from ultralytics import YOLO


class PersonDetector:
    """Runs pretrained person detection and Ultralytics ByteTrack."""

    def __init__(self) -> None:
        project_root = Path(__file__).resolve().parents[3]
        exported = project_root / "models" / "exported" / "people-yolo11n.pt"
        bundled = project_root / "backend" / "yolo11n.pt"
        self.model_path = exported if exported.exists() else bundled
        self.model = YOLO(str(self.model_path if self.model_path.exists() else "yolo11n.pt"))

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
        for box, confidence, track_id in zip(boxes, confidences, track_ids):
            x1, y1, x2, y2 = [float(value) for value in box]
            detections.append(
                {
                    "track_id": track_id,
                    "bbox": [round(x1), round(y1), round(x2), round(y2)],
                    "confidence": round(float(confidence), 3),
                    "image_point": [(x1 + x2) / 2, y2],
                    "body_center_y": (y1 + y2) / 2,
                }
            )
        return result, detections
