from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path

import cv2

from ..database import SessionLocal
from ..models import Analysis, Site
from .detector import PersonDetector
from .heatmaps import create_floor_heatmap, overlay_heatmap_on_frame
from .interaction import InteractionEngine
from .spatial import SpatialEngine, with_homographies


def update_analysis(analysis_id: str, **values) -> None:
    with SessionLocal() as database:
        analysis = database.get(Analysis, analysis_id)
        if analysis:
            for key, value in values.items():
                setattr(analysis, key, value)
            database.commit()


def build_findings(gondolas: list[dict], zones: list[dict], interactions: int) -> list[dict]:
    findings = []
    active = max(gondolas, key=lambda item: item["dwell_seconds"], default=None)
    if active and active["dwell_seconds"] > 0:
        findings.append({"type": "evidence", "title": f"Mayor permanencia en {active['name']}", "detail": f"{active['dwell_seconds']:.1f} segundos acumulados de presencia detectada."})
    zone = max(zones, key=lambda item: item["dwell_seconds"], default=None)
    if zone and zone["dwell_seconds"] > 0:
        findings.append({"type": "evidence", "title": f"Zona dominante: {zone['name']}", "detail": f"Concentra {zone['dwell_seconds']:.1f} segundos de ocupación rastreada."})
    if interactions == 0:
        findings.append({"type": "quality", "title": "Sin interacción inferible", "detail": "Ninguna trayectoria cumplió simultáneamente los umbrales configurados de proximidad, velocidad y tiempo."})
    elif active:
        findings.append({"type": "recommendation", "title": "Validar exhibición de mayor engagement", "detail": f"Revisar productos y reposición en {active['name']}; la recomendación se basa en permanencia e interacciones inferidas."})
    return findings


def run_analysis(analysis_id: str) -> None:
    capture = None
    try:
        with SessionLocal() as database:
            analysis = database.get(Analysis, analysis_id)
            site = database.get(Site, analysis.site_id) if analysis else None
            if not analysis or not site:
                raise ValueError("El análisis o la sede ya no existen")
            video_path = Path(analysis.video_path)
            configuration = site.configuration

        update_analysis(analysis_id, status="processing", stage="metadata", progress=2, message="Leyendo metadatos del video")
        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            raise ValueError("OpenCV no pudo abrir el MP4")
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if fps <= 0 or total_frames <= 0 or width <= 0 or height <= 0:
            raise ValueError("El video no contiene FPS, duración o resolución válidos")

        update_analysis(analysis_id, stage="model", progress=5, message="Cargando YOLO y ByteTrack")
        detector = PersonDetector()
        spatial = SpatialEngine(configuration, width, height)
        interactions = InteractionEngine(configuration)
        result_dir = Path(__file__).resolve().parents[2] / "data" / "results" / analysis_id
        result_dir.mkdir(parents=True, exist_ok=True)

        trajectories: dict[int, list[list[float]]] = defaultdict(list)
        track_frames: dict[int, int] = defaultdict(int)
        zone_dwell: dict[str, float] = defaultdict(float)
        traffic_points: list[dict] = []
        dwell_points: list[dict] = []
        interaction_points: list[dict] = []
        interaction_events: list[dict] = []
        last_interaction: dict[int, bool] = defaultdict(bool)
        gondola_names = {item["id"]: item.get("name", item["id"]) for item in configuration.get("gondolas", [])}
        frame_samples: list[dict] = []
        evidence: list[str] = []
        evidence_frames: list = []
        evidence_targets = {round(index * max(0, total_frames - 1) / 5) for index in range(6)}
        payload_every = max(1, round(fps / 5))
        total_detections = 0
        peak_presence = 0

        slice_count = max(1, min(8, round(total_frames / max(1, round(fps * 5)))))
        slice_size = total_frames / slice_count
        slice_buckets = {
            "traffic": [[] for _ in range(slice_count)],
            "dwell": [[] for _ in range(slice_count)],
            "interaction": [[] for _ in range(slice_count)],
        }

        frame_index = 0
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            prediction, detections = detector.track(frame)
            timestamp = frame_index / fps
            dt = 1 / fps
            active_this_frame = set()
            sample_detections = []
            for detection in detections:
                floor_point = spatial.project(detection["image_point"])
                if not floor_point:
                    continue
                detection["floor_point"] = floor_point
                behavior = interactions.observe(detection, timestamp, dt, height)
                total_detections += 1
                active_this_frame.add(detection["track_id"])
                track_frames[detection["track_id"]] += 1
                zone = spatial.zone_at(floor_point)
                if zone:
                    zone_dwell[zone["id"]] += dt
                if frame_index % payload_every == 0:
                    timestamped = {**{"x": floor_point[0], "z": floor_point[1]}}
                    trajectories[detection["track_id"]].append(floor_point)
                    traffic_points.append({**timestamped, "weight": 1})
                    dwell_points.append({**timestamped, "weight": max(dt, 0.01) * (1.5 if behavior["speed"] < 0.6 else 0.5)})
                    slice_index = min(slice_count - 1, int(frame_index / slice_size))
                    slice_buckets["traffic"][slice_index].append({**timestamped, "weight": 1})
                    slice_buckets["dwell"][slice_index].append({**timestamped, "weight": max(dt, 0.01) * (1.5 if behavior["speed"] < 0.6 else 0.5)})
                    sample_detections.append({
                        "track_id": detection["track_id"], "bbox": detection["bbox"],
                        "confidence": detection["confidence"], "floor_point": floor_point,
                        "state": behavior["state"], "gondola_id": behavior["gondola_id"],
                    })
                if behavior["interaction"]:
                    interaction_points.append({"x": floor_point[0], "z": floor_point[1], "weight": 1, "t": round(timestamp, 2)})
                    if not last_interaction[detection["track_id"]]:
                        interaction_events.append({
                            "t": round(timestamp, 2),
                            "track_id": detection["track_id"],
                            "x": floor_point[0],
                            "z": floor_point[1],
                            "gondola_id": behavior["gondola_id"],
                            "gondola_name": gondola_names.get(behavior["gondola_id"], behavior["gondola_id"]),
                        })
                    last_interaction[detection["track_id"]] = True
                    slice_buckets["interaction"][min(slice_count - 1, int(frame_index / slice_size))].append({"x": floor_point[0], "z": floor_point[1], "weight": 1})
                else:
                    last_interaction[detection["track_id"]] = False

            peak_presence = max(peak_presence, len(active_this_frame))
            if sample_detections:
                frame_samples.append({"frame": frame_index, "timestamp": round(timestamp, 2), "detections": sample_detections})
            if frame_index in evidence_targets:
                name = f"frame_{len(evidence) + 1}.jpg"
                cv2.imwrite(str(result_dir / name), prediction.plot())
                evidence.append(name)
                evidence_frames.append(frame.copy())
            if frame_index % max(1, round(fps)) == 0:
                progress = min(88, 8 + int((frame_index + 1) / total_frames * 80))
                update_analysis(analysis_id, stage="tracking", progress=progress, message=f"YOLO + ByteTrack · frame {frame_index + 1}/{total_frames}")
            frame_index += 1

        update_analysis(analysis_id, stage="heatmaps", progress=92, message="Generando mapas espaciales")
        create_floor_heatmap(traffic_points, configuration["floor"], result_dir / "traffic.png")
        create_floor_heatmap(dwell_points, configuration["floor"], result_dir / "dwell.png")
        create_floor_heatmap(interaction_points, configuration["floor"], result_dir / "interaction.png")

        homography_inv = spatial.homography_norm_inv.round(6).tolist()
        overlay_names: dict[str, list[str]] = {}
        for index, raw_frame in enumerate(evidence_frames, start=1):
            for mode, point_source in (
                ("traffic", traffic_points),
                ("dwell", dwell_points),
                ("interaction", interaction_points),
            ):
                if mode == "interaction" and not interaction_points:
                    continue
                blended = overlay_heatmap_on_frame(point_source, configuration["floor"], homography_inv, raw_frame)
                filename = f"overlay_{mode}_{index}.jpg"
                cv2.imwrite(str(result_dir / filename), blended)
                overlay_names.setdefault(mode, []).append(filename)

        slices_meta: list[dict] = []
        for index in range(slice_count):
            start = round(index * slice_size / fps, 1)
            end = round(min((index + 1) * slice_size, total_frames) / fps, 1)
            entry = {"index": index, "start": start, "end": end}
            for mode in ("traffic", "dwell", "interaction"):
                filename = f"time_{index}_{mode}.png"
                create_floor_heatmap(slice_buckets[mode][index], configuration["floor"], result_dir / filename)
                entry[mode] = filename if slice_buckets[mode][index] else None
            slices_meta.append(entry)

        gondolas = interactions.results()
        zones = [
            {**zone, "dwell_seconds": round(zone_dwell[zone["id"]], 2)}
            for zone in configuration.get("zones", [])
        ]
        minimum_track_frames = max(2, round(fps * configuration.get("thresholds", {}).get("minimum_track_seconds", 2.0)))
        valid_track_ids = {track_id for track_id, count in track_frames.items() if count >= minimum_track_frames}
        trajectory_payload = [
            {"track_id": track_id, "points": points}
            for track_id, points in trajectories.items()
            if track_id in valid_track_ids and len(points) > 1
        ]
        interaction_count = sum(item["interactions"] for item in gondolas)

        duration_seconds = total_frames / fps
        histogram = None
        if interaction_events:
            bucket_s = max(10, round(duration_seconds / 12))
            bucket_count = max(1, math.ceil(duration_seconds / bucket_s))
            counts = [0] * bucket_count
            for event in interaction_events:
                counts[min(bucket_count - 1, int(event["t"] // bucket_s))] += 1
            histogram = {
                "bucket_seconds": bucket_s,
                "buckets": [
                    {"index": index, "start": index * bucket_s, "end": min((index + 1) * bucket_s, duration_seconds), "count": count}
                    for index, count in enumerate(counts)
                ],
            }
        interaction_events.sort(key=lambda event: event["t"])
        interaction_events_log = interaction_events[:400]

        sample_dt = payload_every / fps
        track_speeds = []
        for points in trajectories.values():
            if len(points) < 2:
                continue
            speeds = [math.dist(points[i], points[i - 1]) / sample_dt for i in range(1, len(points)) if points[i] != points[i - 1]]
            if speeds:
                track_speeds.append(sum(speeds) / len(speeds))
        average_speed = round(sum(track_speeds) / len(track_speeds), 2) if track_speeds else 0.0
        duration_minutes = max(0.01, (total_frames / fps) / 60.0)

        result = {
            "site": {"id": site.id, "name": site.name, "city": site.city, "configuration": with_homographies(configuration)},
            "video": {"fps": round(fps, 2), "duration_seconds": round(total_frames / fps, 2), "width": width, "height": height, "total_frames": total_frames, "processed_frames": frame_index},
            "model": {"detector": "YOLO11n COCO person", "tracker": "ByteTrack", "privacy": "temporary_ids_only", "custom_behavior_model": False},
            "metrics": {
                "people_detected": len(valid_track_ids),
                "tracked_presences": len(valid_track_ids),
                "track_fragments": len(track_frames),
                "minimum_track_seconds": round(minimum_track_frames / fps, 2),
                "detections": total_detections,
                "trajectories": len(trajectory_payload),
                "interaction_events": interaction_count,
                "average_speed_m_s": average_speed,
                "flow_per_minute": round(len(valid_track_ids) / duration_minutes, 1),
                "peak_presence": peak_presence,
                "time_slices": slice_count,
            },
            "trajectories": trajectory_payload,
            "frame_detections": frame_samples,
            "interaction_events_log": interaction_events_log,
            "interaction_histogram": histogram,
            "gondolas": gondolas,
            "zones": zones,
            "heatmaps": {
                "traffic": "traffic.png", "dwell": "dwell.png", "interaction": "interaction.png" if interaction_points else None,
                "overlays": overlay_names,
                "slices": slices_meta,
            },
            "annotated_frames": evidence,
            "findings": build_findings(gondolas, zones, interaction_count),
            "quality": {"calibration": configuration["camera"].get("calibration_status", "unknown"), "vertical_analysis": "low_confidence_until_custom_model", "interaction": "inferred_from_proximity_speed_and_time" if interaction_points else "insufficient_evidence"},
        }
        update_analysis(analysis_id, status="completed", stage="results", progress=100, message="Análisis espacial completado", result=result, duration_seconds=result["video"]["duration_seconds"])
    except Exception as exc:
        update_analysis(analysis_id, status="failed", stage="failed", progress=100, message=str(exc)[:300])
    finally:
        if capture is not None:
            capture.release()
