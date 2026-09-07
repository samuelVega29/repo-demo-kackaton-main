from __future__ import annotations

import json
import re
import shutil
import threading
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..cv.pipeline import run_analysis
from ..database import get_db
from ..models import Analysis, Site, User
from ..security import current_user, user_from_query_token


router = APIRouter(prefix="/api/analyses", tags=["analyses"])
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
RESULT_DIR = DATA_DIR / "results"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULT_DIR.mkdir(parents=True, exist_ok=True)


def can_access(user: User, site: Site | None) -> bool:
    return bool(site and (user.role == "admin" or user.retailer_id == site.retailer_id))


def parse_roi(roi: str | None) -> list[list[float]] | None:
    """Parses the optional normalized ROI polygon from the upload form.

    - ``roi`` = None / empty -> analyze the whole camera frame.
    - otherwise -> JSON polygon of 4+ points ``[[x, y], ...]``, each coordinate
      in 0..1 (more points allowed for irregular areas).

    The returned polygon belongs to the analysis (it is persisted in
    ``Analysis.result``) and never touches the persistent camera configuration.
    """
    if roi is None or not roi.strip():
        return None
    try:
        raw = json.loads(roi)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="roi debe ser un polígono JSON: [[x,y], ...]")
    if not isinstance(raw, list) or len(raw) < 4:
        raise HTTPException(status_code=400, detail="roi necesita un mínimo de 4 puntos")
    if len(raw) > 16:
        raise HTTPException(status_code=400, detail="roi admite como máximo 16 puntos")
    polygon = []
    for point in raw:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise HTTPException(status_code=400, detail="cada punto de roi debe ser [x, y]")
        try:
            x = float(point[0])
            y = float(point[1])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="las coordenadas de roi deben ser numéricas")
        if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
            raise HTTPException(status_code=400, detail="las coordenadas de roi deben estar entre 0 y 1")
        polygon.append([x, y])
    return polygon


def payload(analysis: Analysis) -> dict:
    return {
        "id": analysis.id,
        "site_id": analysis.site_id,
        "filename": analysis.filename,
        "status": analysis.status,
        "stage": analysis.stage,
        "progress": analysis.progress,
        "message": analysis.message,
        "created_at": analysis.created_at.isoformat(),
        "result": analysis.result,
    }


def owned_analysis(analysis_id: str, user: User, database: Session) -> tuple[Analysis, Site]:
    """Resolves an analysis the user may access.

    Missing analysis -> 404 (resource never existed / hidden).
    Existing but site not accessible -> 403.
    """
    analysis = database.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    site = database.get(Site, analysis.site_id)
    if not site or not can_access(user, site):
        raise HTTPException(status_code=403, detail="No tienes acceso a este análisis")
    return analysis, site


def status_payload(analysis: Analysis) -> dict:
    return {
        "analysis_id": analysis.id,
        "status": analysis.status,
        "stage": analysis.stage,
        "progress": analysis.progress,
        "message": analysis.message,
    }


def not_ready_response(analysis: Analysis) -> JSONResponse:
    """Coherent state for analyses without a finished result (no fake data).

    - queued/processing -> 409 Conflict (still in flight)
    - failed            -> 422 Unprocessable (terminal, no usable output)
    """
    code = 422 if analysis.status == "failed" else 409
    body = status_payload(analysis)
    body["detail"] = (
        "El análisis falló; no hay resultados disponibles"
        if analysis.status == "failed"
        else "El análisis aún no tiene resultados disponibles"
    )
    return JSONResponse(status_code=code, content=body)


def require_result(analysis: Analysis) -> dict:
    """Returns the finished result dict, or a coherent state response."""
    if analysis.status == "completed":
        return analysis.result or {}
    return not_ready_response(analysis)  # type: ignore[return-value]


def result_floor(result: dict) -> dict:
    return result.get("site", {}).get("configuration", {}).get("floor", {})


def average_dwell(zones: list[dict]) -> float:
    values = [zone.get("dwell_seconds", 0.0) or 0.0 for zone in zones]
    return round(sum(values) / len(values), 2) if values else 0.0


@router.post("", status_code=202)
def create_analysis(
    site_id: int = Form(...),
    video: UploadFile = File(...),
    roi: str | None = Form(None),
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    site = database.get(Site, site_id)
    if not can_access(user, site):
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    filename = video.filename or "video.mp4"
    if Path(filename).suffix.lower() != ".mp4" or video.content_type not in {"video/mp4", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Carga un archivo MP4 válido")
    roi_polygon = parse_roi(roi)
    analysis_id = uuid.uuid4().hex
    video_path = UPLOAD_DIR / f"{analysis_id}.mp4"
    with video_path.open("wb") as target:
        shutil.copyfileobj(video.file, target)
    if video_path.stat().st_size == 0:
        video_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    analysis = Analysis(
        id=analysis_id,
        site_id=site.id,
        user_id=user.id,
        filename=Path(filename).name,
        video_path=str(video_path),
        status="queued",
        stage="upload",
        progress=1,
        message="Video guardado; esperando inferencia",
    )
    database.add(analysis)
    database.commit()
    threading.Thread(target=run_analysis, args=(analysis_id,), kwargs={"roi": roi_polygon}, daemon=True).start()
    return {"id": analysis_id}


@router.get("")
def list_analyses(
    site_id: int | None = None,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> list[dict]:
    query = select(Analysis).join(Site).order_by(Analysis.created_at.desc())
    if user.role != "admin":
        query = query.where(Site.retailer_id == user.retailer_id)
    if site_id:
        query = query.where(Analysis.site_id == site_id)
    return [payload(item) for item in database.scalars(query).all()]


@router.get("/{analysis_id}")
def analysis_detail(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    analysis = database.get(Analysis, analysis_id)
    site = database.get(Site, analysis.site_id) if analysis else None
    if not analysis or not can_access(user, site):
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    return payload(analysis)


@router.get("/{analysis_id}/artifacts/{filename}")
def artifact(
    analysis_id: str,
    filename: str,
    user: User = Depends(user_from_query_token),
    database: Session = Depends(get_db),
):
    analysis = database.get(Analysis, analysis_id)
    site = database.get(Site, analysis.site_id) if analysis else None
    if not analysis or not can_access(user, site):
        raise HTTPException(status_code=404, detail="Artefacto no encontrado")
    safe_name = Path(filename).name
    base_ok = safe_name in {"traffic.png", "dwell.png", "interaction.png", "pickup.png"}
    overlay_ok = re.fullmatch(r"overlay_(traffic|dwell|interaction|pickup)_[1-9]\d*\.jpg", safe_name)
    frame_ok = re.fullmatch(r"frame_[1-9]\d*\.jpg", safe_name)
    time_ok = re.fullmatch(r"time_\d+_(traffic|dwell|interaction|pickup)\.png", safe_name)
    if safe_name != filename or not (base_ok or overlay_ok or frame_ok or time_ok):
        raise HTTPException(status_code=404, detail="Artefacto no encontrado")
    path = RESULT_DIR / analysis_id / safe_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Artefacto no encontrado")
    return FileResponse(path)


@router.get("/{analysis_id}/video")
def analysis_video(
    analysis_id: str,
    user: User = Depends(user_from_query_token),
    database: Session = Depends(get_db),
):
    analysis = database.get(Analysis, analysis_id)
    site = database.get(Site, analysis.site_id) if analysis else None
    if not analysis or not can_access(user, site):
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    path = Path(analysis.video_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Video no encontrado")
    return FileResponse(path, media_type="video/mp4")


@router.get("/{analysis_id}/status")
def analysis_status(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    analysis, _ = owned_analysis(analysis_id, user, database)
    return status_payload(analysis)


@router.get("/{analysis_id}/summary")
def analysis_summary(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(analysis_id, user, database)
    result = require_result(analysis)
    if isinstance(result, JSONResponse):
        return result
    return {
        "analysis_id": analysis.id,
        "analysis_mode": result.get("analysis_mode"),
        "coordinate_system": result.get("coordinate_system"),
        "video": result.get("video", {}),
        "metrics": result.get("metrics", {}),
        "zones": result.get("zones", []),
        "gondolas": result.get("gondolas", []),
    }


@router.get("/{analysis_id}/heatmap")
def analysis_heatmap(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(analysis_id, user, database)
    result = require_result(analysis)
    if isinstance(result, JSONResponse):
        return result
    return {
        "analysis_id": analysis.id,
        "analysis_mode": result.get("analysis_mode"),
        "heatmaps": result.get("heatmaps", {}),
        "floor": result_floor(result),
        "roi": result.get("roi"),
    }


@router.get("/{analysis_id}/trajectories")
def analysis_trajectories(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(analysis_id, user, database)
    result = require_result(analysis)
    if isinstance(result, JSONResponse):
        return result
    return {
        "analysis_id": analysis.id,
        "coordinate_system": result.get("coordinate_system"),
        "trajectories": result.get("trajectories", []),
        "metrics": result.get("metrics", {}),
        "floor": result_floor(result),
    }


@router.get("/{analysis_id}/dwell")
def analysis_dwell(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(analysis_id, user, database)
    result = require_result(analysis)
    if isinstance(result, JSONResponse):
        return result
    zones = result.get("zones", [])
    return {
        "analysis_id": analysis.id,
        "duration_seconds": (result.get("video") or {}).get("duration_seconds"),
        "avg_dwell_seconds": average_dwell(zones),
        "zones": zones,
        "gondolas": result.get("gondolas", []),
    }


@router.get("/{analysis_id}/interactions")
def analysis_interactions(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(analysis_id, user, database)
    result = require_result(analysis)
    if isinstance(result, JSONResponse):
        return result
    return {
        "analysis_id": analysis.id,
        "gondolas": result.get("gondolas", []),
        "interaction_events_log": result.get("interaction_events_log", []),
        "interaction_histogram": result.get("interaction_histogram"),
        "pickup_events_log": result.get("pickup_events_log", []),
        "pickup_histogram": result.get("pickup_histogram"),
    }


@router.get("/{analysis_id}/zones")
def analysis_zones(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(analysis_id, user, database)
    result = require_result(analysis)
    if isinstance(result, JSONResponse):
        return result
    return {
        "analysis_id": analysis.id,
        "coordinate_system": result.get("coordinate_system"),
        "zones": result.get("zones", []),
        "floor": result_floor(result),
    }


@router.get("/{analysis_id}/recommendations")
def analysis_recommendations(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(analysis_id, user, database)
    result = require_result(analysis)
    if isinstance(result, JSONResponse):
        return result
    recommendations = result.get("recommendations")
    if recommendations is None:
        recommendations = [f for f in result.get("findings", []) if f.get("type") == "recommendation"]
    return {
        "analysis_id": analysis.id,
        "analysis_mode": result.get("analysis_mode"),
        "recommendations": recommendations,
    }


@router.get("/{analysis_id}/visualization-3d")
def analysis_visualization_3d(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(analysis_id, user, database)
    result = require_result(analysis)
    if isinstance(result, JSONResponse):
        return result
    if result.get("analysis_mode") != "advanced":
        return {
            "analysis_id": analysis.id,
            "available": False,
            "reason": "3D requires calibrated camera",
        }
    configuration = result.get("site", {}).get("configuration", {})
    return {
        "analysis_id": analysis.id,
        "available": True,
        "configuration": configuration,
        "camera": configuration.get("camera", {}),
        "gondolas": result.get("gondolas", []),
        "zones": result.get("zones", []),
    }
