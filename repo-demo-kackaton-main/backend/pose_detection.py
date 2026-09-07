"""
SCAPDER — Standalone Pose Detection + Tracking Pipeline
========================================================
YOLO11-pose + ByteTrack para análisis de seguridad y comportamiento espacial.

Uso:
    python pose_detection.py --source video.mp4 --output results/
    python pose_detection.py --source 0 --output results/          # webcam
    python pose_detection.py --source video.mp4 --output results/ --show

Requiere: ultralytics, opencv-python-headless, numpy
    pip install ultralytics opencv-python-headless numpy
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO


# ── YOLO11-pose COCO keypoint indices ────────────────────────────────────────
# 0  Nose           1  Left Eye      2  Right Eye
# 3  Left Ear       4  Right Ear     5  Left Shoulder
# 6  Right Shoulder 7  Left Elbow    8  Right Elbow
# 9  Left Wrist     10 Right Wrist   11 Left Hip
# 12 Right Hip      13 Left Knee     14 Right Knee
# 15 Left Ankle     16 Right Ankle

SKELETON = [
    (0, 1), (0, 2), (1, 3), (2, 4),           # face
    (5, 6),                                     # shoulders
    (5, 7), (7, 9), (6, 8), (8, 10),          # arms
    (5, 11), (6, 12),                           # torso
    (11, 12),                                   # hips
    (11, 13), (13, 15), (12, 14), (14, 16),   # legs
]

# Keypoint subsets for body parts
HEAD_KEYPOINTS = [0, 1, 2, 3, 4]
TORSO_KEYPOINTS = [5, 6, 11, 12]
LEFT_ARM = [5, 7, 9]
RIGHT_ARM = [6, 8, 10]
LEFT_LEG = [11, 13, 15]
RIGHT_LEG = [12, 14, 16]

# Colors for body parts (BGR)
COLOR_HEAD = (0, 255, 255)      # yellow
COLOR_TORSO = (0, 200, 255)     # orange
COLOR_LEFT_ARM = (0, 255, 100)  # green
COLOR_RIGHT_ARM = (255, 200, 0) # cyan
COLOR_LEFT_LEG = (200, 100, 255)# magenta
COLOR_RIGHT_LEG = (255, 100, 200)
COLOR_KEYPOINT = (0, 255, 200)
COLOR_BBOX = (80, 220, 120)


@dataclass
class TrackedPose:
    """A single tracked person with pose keypoints across frames."""
    track_id: int
    bbox: list[float]           # [x1, y1, x2, y2]
    confidence: float
    keypoints: list[list[float] | None]  # 17 keypoints, each [x, y, conf] or None
    floor_point: list[float]    # projected to floor meters [x, z]
    timestamp: float = 0.0
    state: str = "PASS"         # PASS/APPROACH/ENGAGED/INTERACTION
    gondola_id: str | None = None
    speed: float = 0.0


@dataclass
class PoseTracker:
    """Maintains ByteTrack identity across frames and stores full pose history."""
    track_history: dict[int, list[TrackedPose]] = field(default_factory=lambda: defaultdict(list))
    frame_index: int = 0

    def add(self, pose: TrackedPose) -> None:
        self.track_history[pose.track_id].append(pose)
        self.frame_index += 1

    def get_history(self, track_id: int) -> list[TrackedPose]:
        return self.track_history[track_id]

    def get_all_latest(self) -> list[TrackedPose]:
        """Returns the most recent pose for each tracked person."""
        result = []
        for track_id, history in self.track_history.items():
            if history:
                result.append(history[-1])
        return result

    def compute_trajectories(self) -> dict[int, list[list[float]]]:
        """Returns floor-space trajectories for each tracked person."""
        return {
            track_id: [pose.floor_point for pose in history if pose.floor_point]
            for track_id, history in self.track_history.items()
            if len(history) > 1
        }


class SecurityPoseAnalyzer:
    """
    Full pipeline: YOLO11-pose detection → ByteTrack → floor projection → pose analysis.
    Designed for fixed-camera security/retail scenarios.
    """

    def __init__(
        self,
        model_name: str = "yolo11n-pose.pt",
        conf_threshold: float = 0.3,
        iou_threshold: float = 0.5,
        min_track_frames: int = 3,
    ) -> None:
        print(f"[INIT] Loading YOLO11-pose model: {model_name}")
        self.model = YOLO(model_name)
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.min_track_frames = min_track_frames
        self.tracker = PoseTracker()
        self._prev_positions: dict[int, tuple[float, float, float]] = {}  # track_id -> (x, z, timestamp)

    def process_frame(
        self,
        frame: np.ndarray,
        timestamp: float,
        homography_inv: np.ndarray | None = None,
        homography: np.ndarray | None = None,
        floor_dims: tuple[float, float] | None = None,
    ) -> tuple[np.ndarray, list[TrackedPose]]:
        """
        Run detection + tracking on a single frame.

        Returns:
            annotated_frame: frame with drawn skeletons and bboxes
            detections: list of TrackedPose for this frame
        """
        height, width = frame.shape[:2]
        dt = 1.0 / max(1, self._estimate_fps(frame))

        # Run YOLO11-pose with ByteTrack
        results = self.model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[0],  # person class only
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            verbose=False,
        )[0]

        detections: list[TrackedPose] = []
        annotated = frame.copy()

        if results.boxes is None or results.boxes.id is None:
            return annotated, detections

        boxes = results.boxes.xyxy.cpu().numpy()
        confidences = results.boxes.conf.cpu().numpy()
        track_ids = results.boxes.id.int().cpu().tolist()
        keypoints_data = results.keypoints  # Keypoints object

        for idx, (box, confidence, track_id) in enumerate(zip(boxes, confidences, track_ids)):
            x1, y1, x2, y2 = [float(v) for v in box]

            # Extract keypoints for this detection
            kpts = self._extract_keypoints(keypoints_data, idx)

            # Compute floor projection from bottom-center of bbox
            bottom_center = [(x1 + x2) / 2, y2]
            floor_point = self._project_to_floor(bottom_center, homography_inv) if homography_inv is not None else None

            # If we have floor projection, also project all visible keypoints
            floor_keypoints = None
            if homography_inv is not None and floor_dims is not None:
                floor_keypoints = self._project_keypoints_to_floor(kpts, homography_inv, floor_dims)

            # Compute speed from previous frame position
            speed = 0.0
            if floor_point and track_id in self._prev_positions:
                prev_x, prev_z, prev_t = self._prev_positions[track_id]
                if timestamp > prev_t:
                    speed = math.dist(floor_point, [prev_x, prev_z]) / (timestamp - prev_t)
            if floor_point:
                self._prev_positions[track_id] = (floor_point[0], floor_point[1], timestamp)

            # Create TrackedPose
            pose = TrackedPose(
                track_id=track_id,
                bbox=[round(x1), round(y1), round(x2), round(y2)],
                confidence=round(float(confidence), 3),
                keypoints=kpts,
                floor_point=floor_point,
                timestamp=round(timestamp, 3),
                speed=round(speed, 3),
            )
            self.tracker.add(pose)
            detections.append(pose)

            # ── Draw on annotated frame ──
            self._draw_skeleton(annotated, kpts, track_id)
            self._draw_bbox(annotated, x1, y1, x2, y2, track_id, confidence)
            if floor_point:
                self._draw_floor_projection(annotated, bottom_center, floor_point, floor_dims)

        return annotated, detections

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
                result.append([float(kp[0]), float(kp[1]), float(c)])
            else:
                result.append(None)
        return result

    def _project_to_floor(self, image_point: list[float], homography_inv: np.ndarray) -> list[float] | None:
        """Projects an image pixel to floor meters using the inverse homography matrix."""
        if homography_inv is None:
            return None
        flat = homography_inv.flatten().tolist()
        x, y = image_point
        denom = flat[6] * x + flat[7] * y + flat[8]
        if abs(denom) < 1e-10:
            return None
        fx = (flat[0] * x + flat[1] * y + flat[2]) / denom
        fz = (flat[3] * x + flat[4] * y + flat[5]) / denom
        return [round(fx, 3), round(fz, 3)]

    def _project_keypoints_to_floor(
        self,
        kpts: list[list[float] | None],
        homography_inv: np.ndarray,
        floor_dims: tuple[float, float],
    ) -> list[list[float] | None]:
        """
        Project each visible keypoint to floor space.
        Returns list of [floor_x, floor_z] or None for each keypoint.
        The vertical position (height above floor) is estimated from the
        keypoint's relative position within the bounding box.
        """
        floor_w, floor_d = floor_dims
        result = []
        for kp in kpts:
            if kp is None:
                result.append(None)
                continue
            projected = self._project_to_floor(kp[:2], homography_inv)
            if projected:
                result.append(projected)
            else:
                result.append(None)
        return result

    def _estimate_fps(self, frame: np.ndarray) -> float:
        """Rough FPS estimate — returns 30 as default for speed calculation."""
        return 30.0

    # ── Drawing functions ──────────────────────────────────────────────────────

    def _draw_skeleton(self, frame: np.ndarray, kpts: list[list[float] | None], track_id: int) -> None:
        """Draws the skeleton connections on the frame."""
        for i, j in SKELETON:
            kp_a = kpts[i] if i < len(kpts) else None
            kp_b = kpts[j] if j < len(kpts) else None
            if kp_a is None or kp_b is None:
                continue
            pt_a = (int(kp_a[0]), int(kp_a[1]))
            pt_b = (int(kp_b[0]), int(kp_b[1]))

            # Color based on body part
            if i in HEAD_KEYPOINTS or j in HEAD_KEYPOINTS:
                color = COLOR_HEAD
            elif i in TORSO_KEYPOINTS or j in TORSO_KEYPOINTS:
                color = COLOR_TORSO
            elif i in LEFT_ARM or j in LEFT_ARM:
                color = COLOR_LEFT_ARM
            elif i in RIGHT_ARM or j in RIGHT_ARM:
                color = COLOR_RIGHT_ARM
            elif i in LEFT_LEG or j in LEFT_LEG:
                color = COLOR_LEFT_LEG
            elif i in RIGHT_LEG or j in RIGHT_LEG:
                color = COLOR_RIGHT_LEG
            else:
                color = COLOR_KEYPOINT

            cv2.line(frame, pt_a, pt_b, color, 2, cv2.LINE_AA)

        # Draw keypoint dots
        for kp in kpts:
            if kp is None:
                continue
            pt = (int(kp[0]), int(kp[1]))
            cv2.circle(frame, pt, 3, COLOR_KEYPOINT, -1, cv2.LINE_AA)

    def _draw_bbox(
        self, frame: np.ndarray,
        x1: float, y1: float, x2: float, y2: float,
        track_id: int, confidence: float,
    ) -> None:
        """Draws bounding box and track label."""
        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), COLOR_BBOX, 2)
        label = f"#{track_id} {confidence:.0%}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(frame, (int(x1), int(y1) - th - 8), (int(x1) + tw + 6, int(y1)), COLOR_BBOX, -1)
        cv2.putText(frame, label, (int(x1) + 3, int(y1) - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

    def _draw_floor_projection(
        self, frame: np.ndarray,
        image_point: list[float], floor_point: list[float],
        floor_dims: tuple[float, float] | None,
    ) -> None:
        """Draws a small crosshair at the projected floor position."""
        px, py = int(image_point[0]), int(image_point[1])
        cv2.drawMarker(frame, (px, py), (0, 200, 255), cv2.MARKER_CROSS, 12, 1)

    # ── Analytics ──────────────────────────────────────────────────────────────

    def compute_metrics(self, frame_height: int) -> dict:
        """Computes summary metrics from the full tracking history."""
        all_poses = []
        for track_id, history in self.tracker.track_history.items():
            all_poses.extend(history)
            if len(history) < self.min_track_frames:
                continue

        track_count = sum(
            1 for history in self.tracker.track_history.values()
            if len(history) >= self.min_track_frames
        )

        # Speed distribution
        speeds = [p.speed for p in all_poses if p.speed > 0]
        avg_speed = round(sum(speeds) / len(speeds), 3) if speeds else 0.0

        # Peak presence (max simultaneous people per frame)
        frame_counts: dict[int, int] = defaultdict(int)
        for pose in all_poses:
            frame_idx = int(pose.timestamp * 30)  # rough frame index
            frame_counts[frame_idx] += 1
        peak_presence = max(frame_counts.values()) if frame_counts else 0

        # Keypoint analysis — compute average arm angles, reach direction
        pose_analysis = self._analyze_pose_behavior()

        return {
            "total_tracks": len(self.tracker.track_history),
            "valid_tracks": track_count,
            "total_detections": len(all_poses),
            "average_speed_m_s": avg_speed,
            "peak_presence": peak_presence,
            "pose_analysis": pose_analysis,
        }

    def _analyze_pose_behavior(self) -> dict:
        """
        Analyze body pose behavior: arm reach direction, head orientation, stance width.
        This is useful for retail interaction detection (reaching toward shelves).
        """
        arm_reaches = []
        head_orientations = []
        stance_widths = []

        for track_id, history in self.tracker.track_history.items():
            if len(history) < 2:
                continue
            for pose in history:
                kpts = pose.keypoints
                if not kpts:
                    continue

                # Arm reach analysis
                left_wrist = kpts[9]
                right_wrist = kpts[10]
                nose = kpts[0]

                if nose and left_wrist:
                    reach_left = math.hypot(left_wrist[0] - nose[0], left_wrist[1] - nose[1])
                    arm_reaches.append(("left", reach_left))
                if nose and right_wrist:
                    reach_right = math.hypot(right_wrist[0] - nose[0], right_wrist[1] - nose[1])
                    arm_reaches.append(("right", reach_right))

                # Stance width
                left_ankle = kpts[15]
                right_ankle = kpts[16]
                if left_ankle and right_ankle:
                    stance = abs(left_ankle[0] - right_ankle[0])
                    stance_widths.append(stance)

        avg_reach = sum(r[1] for r in arm_reaches) / len(arm_reaches) if arm_reaches else 0
        avg_stance = sum(stance_widths) / len(stance_widths) if stance_widths else 0

        return {
            "average_reach_px": round(avg_reach, 1),
            "average_stance_px": round(avg_stance, 1),
            "total_arm_reach_events": len(arm_reaches),
        }

    def export_results(self, output_dir: Path) -> None:
        """Exports tracking and pose results to JSON."""
        output_dir.mkdir(parents=True, exist_ok=True)

        # Export full trajectory data
        trajectories = {}
        for track_id, history in self.tracker.track_history.items():
            if len(history) < self.min_track_frames:
                continue
            trajectories[str(track_id)] = {
                "track_id": track_id,
                "detection_count": len(history),
                "points": [p.floor_point for p in history if p.floor_point],
                "poses": [
                    {
                        "timestamp": p.timestamp,
                        "bbox": p.bbox,
                        "keypoints": p.keypoints,
                        "floor_point": p.floor_point,
                        "speed": p.speed,
                    }
                    for p in history
                ],
            }

        # Export metrics
        metrics = self.compute_metrics(frame_height=1080)

        output = {
            "summary": metrics,
            "trajectories": trajectories,
            "model": "YOLO11n-pose + ByteTrack",
            "keypoint_count": 17,
            "keypoint_names": [
                "nose", "left_eye", "right_eye", "left_ear", "right_ear",
                "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
                "left_wrist", "right_wrist", "left_hip", "right_hip",
                "left_knee", "right_knee", "left_ankle", "right_ankle",
            ],
        }

        results_file = output_dir / "pose_results.json"
        with open(results_file, "w") as f:
            json.dump(output, f, indent=2, default=str)
        print(f"[EXPORT] Results saved to {results_file}")


def process_video(
    source: str | int,
    output_dir: str,
    show: bool = False,
    save_video: bool = True,
    conf: float = 0.3,
    model: str = "yolo11n-pose.pt",
) -> None:
    """Main processing loop for a video file or webcam."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    analyzer = SecurityPoseAnalyzer(model_name=model, conf_threshold=conf)

    cap = cv2.VideoCapture(str(source) if isinstance(source, str) else source)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open source: {source}")
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"[INFO] Source: {source}")
    print(f"[INFO] Resolution: {width}x{height} @ {fps:.1f} FPS")
    print(f"[INFO] Total frames: {total_frames}")
    print(f"[INFO] Output: {output_path}")
    print(f"[INFO] Model: {model}")
    print()

    # Video writer
    writer = None
    if save_video:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out_video = output_path / "pose_output.mp4"
        writer = cv2.VideoWriter(str(out_video), fourcc, fps, (width, height))
        print(f"[VIDEO] Writing to {out_video}")

    frame_idx = 0
    start_time = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        timestamp = frame_idx / fps
        annotated, detections = analyzer.process_frame(frame, timestamp)

        # Draw frame counter and timestamp
        info_text = f"Frame {frame_idx} | t={timestamp:.1f}s | People: {len(detections)}"
        cv2.putText(annotated, info_text, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 255, 200), 1, cv2.LINE_AA)

        # Draw keypoint legend
        legend_y = height - 80
        legends = [
            ("Head", COLOR_HEAD), ("Torso", COLOR_TORSO),
            ("L.Arm", COLOR_LEFT_ARM), ("R.Arm", COLOR_RIGHT_ARM),
            ("L.Leg", COLOR_LEFT_LEG), ("R.Leg", COLOR_RIGHT_LEG),
        ]
        for i, (label, color) in enumerate(legends):
            lx = 10 + i * 90
            cv2.rectangle(annotated, (lx, legend_y), (lx + 12, legend_y + 12), color, -1)
            cv2.putText(annotated, label, (lx + 16, legend_y + 10), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 200, 190), 1, cv2.LINE_AA)

        if writer:
            writer.write(annotated)

        if show:
            display = cv2.resize(annotated, (min(1280, width), min(720, height)))
            cv2.imshow("SCAPDER Pose Detection", display)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                print("[INFO] User interrupted (q)")
                break

        frame_idx += 1
        if frame_idx % 100 == 0:
            elapsed = time.time() - start_time
            fps_actual = frame_idx / elapsed if elapsed > 0 else 0
            pct = (frame_idx / total_frames * 100) if total_frames > 0 else 0
            print(f"  [{frame_idx}/{total_frames}] {pct:.0f}% | {fps_actual:.1f} FPS real | {len(detections)} people")

    cap.release()
    if writer:
        writer.release()
    if show:
        cv2.destroyAllWindows()

    elapsed = time.time() - start_time
    print()
    print(f"[DONE] Processed {frame_idx} frames in {elapsed:.1f}s ({frame_idx / max(1, elapsed):.1f} FPS)")

    # Export results
    analyzer.export_results(output_path)

    # Print summary
    metrics = analyzer.compute_metrics(height)
    print(f"[METRICS] Tracks: {metrics['valid_tracks']}/{metrics['total_tracks']}")
    print(f"[METRICS] Detections: {metrics['total_detections']}")
    print(f"[METRICS] Peak presence: {metrics['peak_presence']}")
    print(f"[METRICS] Avg speed: {metrics['average_speed_m_s']} m/s")
    pose = metrics.get("pose_analysis", {})
    if pose:
        print(f"[METRICS] Avg arm reach: {pose.get('average_reach_px', 0):.0f}px")
        print(f"[METRICS] Avg stance: {pose.get('average_stance_px', 0):.0f}px")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SCAPDER — YOLO11-pose + ByteTrack security analysis pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python pose_detection.py --source video.mp4 --output results/
  python pose_detection.py --source video.mp4 --output results/ --show --model yolo11s-pose.pt
  python pose_detection.py --source 0 --output webcam_output/ --show
        """,
    )
    parser.add_argument("--source", required=True, help="Video file path or webcam index (0)")
    parser.add_argument("--output", default="pose_results", help="Output directory")
    parser.add_argument("--model", default="yolo11n-pose.pt", help="YOLO11-pose model (n/s/m/l/x)")
    parser.add_argument("--conf", type=float, default=0.3, help="Confidence threshold")
    parser.add_argument("--show", action="store_true", help="Display live preview")
    parser.add_argument("--no-video", action="store_true", help="Skip writing output video")
    args = parser.parse_args()

    source = int(args.source) if args.source.isdigit() else args.source
    process_video(
        source=source,
        output_dir=args.output,
        show=args.show,
        save_video=not args.no_video,
        conf=args.conf,
        model=args.model,
    )


if __name__ == "__main__":
    main()
