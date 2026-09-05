from __future__ import annotations

import re
import shutil
import threading
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
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


def _has_valid_calibration(configuration: dict) -> bool:
    """True when the site's camera was visibly calibrated (P1–P4 moved).

    Accepts the demo marker status from the seed data; rejects the identity
    default that new sites get from ``empty_site_configuration``.
    """
    camera = (configuration or {}).get("camera") or {}
    if camera.get("calibration_status") not in {"calibrated", "demo"}:
        return False
    source = camera.get("source_normalized")
    if not source or len(source) != 4:
        return False
    identity = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]
    rounded = [[round(float(x), 4), round(float(y), 4)] for x, y in source]
    return rounded != identity


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


@router.post("", status_code=202)
def create_analysis(
    site_id: int = Form(...),
    video: UploadFile = File(...),
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    site = database.get(Site, site_id)
    if not can_access(user, site):
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    if not _has_valid_calibration(site.configuration):
        raise HTTPException(
            status_code=400,
            detail="Calibrá la cámara (paso 03, arrastrá P1–P4 a las esquinas del piso) antes de analizar el video.",
        )
    filename = video.filename or "video.mp4"
    if Path(filename).suffix.lower() != ".mp4" or video.content_type not in {"video/mp4", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Carga un archivo MP4 válido")
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
    threading.Thread(target=run_analysis, args=(analysis_id,), daemon=True).start()
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
