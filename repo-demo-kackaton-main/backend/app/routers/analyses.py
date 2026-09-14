from __future__ import annotations

import json
import os
import re
import shutil
import threading
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import cv2
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.insights import generate_insights
from ..cv.pipeline import run_analysis
from ..database import get_db
from ..models import Analysis, Site, User
from ..security import current_user, user_from_query_token


router = APIRouter(
    prefix="/api/analyses",
    tags=["analyses"],
)

def _data_dir() -> Path:
    """Directorio de datos. En desktop (.exe) se define con SCAPDER_DATA_DIR."""
    override = os.environ.get("SCAPDER_DATA_DIR")
    if override:
        path = Path(override)
        path.mkdir(parents=True, exist_ok=True)
        return path
    return Path(__file__).resolve().parents[2] / "data"


DATA_DIR = _data_dir()
UPLOAD_DIR = DATA_DIR / "uploads"
RESULT_DIR = DATA_DIR / "results"
MAX_VIDEO_DURATION_SECONDS = 120

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULT_DIR.mkdir(parents=True, exist_ok=True)


# =========================================================
# PERMISOS
# =========================================================


def can_access(
    user: User,
    site: Site | None,
) -> bool:
    return bool(
        site
        and (
            user.role == "admin"
            or user.retailer_id == site.retailer_id
        )
    )


# =========================================================
# ROI
# =========================================================


def parse_roi(
    roi: str | None,
) -> list[list[float]] | None:
    """
    Convierte el ROI opcional enviado desde el formulario
    en una lista de puntos normalizados.

    Si no existe ROI, se analiza todo el fotograma.
    """

    if roi is None or not roi.strip():
        return None

    try:
        raw = json.loads(roi)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "roi debe ser un polígono JSON: "
                "[[x,y], ...]"
            ),
        ) from exc

    if not isinstance(raw, list) or len(raw) < 4:
        raise HTTPException(
            status_code=400,
            detail="roi necesita un mínimo de 4 puntos",
        )

    if len(raw) > 16:
        raise HTTPException(
            status_code=400,
            detail="roi admite como máximo 16 puntos",
        )

    polygon: list[list[float]] = []

    for point in raw:
        if (
            not isinstance(point, (list, tuple))
            or len(point) != 2
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "cada punto de roi debe ser [x, y]"
                ),
            )

        try:
            x = float(point[0])
            y = float(point[1])
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail=(
                    "las coordenadas de roi "
                    "deben ser numéricas"
                ),
            ) from exc

        if not (
            0.0 <= x <= 1.0
            and 0.0 <= y <= 1.0
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "las coordenadas de roi "
                    "deben estar entre 0 y 1"
                ),
            )

        polygon.append([x, y])

    return polygon


# =========================================================
# FECHA / PAYLOAD
# =========================================================


def normalize_created_at(
    value: datetime | None,
) -> datetime | None:
    """
    Garantiza que la fecha tenga zona horaria.

    SQLite puede devolver DateTime sin tzinfo aunque
    originalmente se haya guardado como UTC.
    """

    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def payload(
    analysis: Analysis,
) -> dict:
    created_at = normalize_created_at(
        analysis.created_at
    )

    return {
        "id": analysis.id,
        "site_id": analysis.site_id,
        "filename": analysis.filename,
        "status": analysis.status,
        "stage": analysis.stage,
        "progress": analysis.progress,
        "message": analysis.message,
        "created_at": (
            created_at.isoformat()
            if created_at
            else None
        ),
        "result": analysis.result,
        "insights": analysis.insights,
    }


# =========================================================
# OBTENER ANÁLISIS DEL USUARIO
# =========================================================


def owned_analysis(
    analysis_id: str,
    user: User,
    database: Session,
) -> tuple[Analysis, Site]:
    analysis = database.get(
        Analysis,
        analysis_id,
    )

    if not analysis:
        raise HTTPException(
            status_code=404,
            detail="Análisis no encontrado",
        )

    site = database.get(
        Site,
        analysis.site_id,
    )

    if not site or not can_access(user, site):
        raise HTTPException(
            status_code=403,
            detail=(
                "No tienes acceso a este análisis"
            ),
        )

    return analysis, site


# =========================================================
# ESTADO
# =========================================================


def status_payload(
    analysis: Analysis,
) -> dict:
    return {
        "analysis_id": analysis.id,
        "status": analysis.status,
        "stage": analysis.stage,
        "progress": analysis.progress,
        "message": analysis.message,
    }


def not_ready_response(
    analysis: Analysis,
) -> JSONResponse:
    code = (
        422
        if analysis.status == "failed"
        else 409
    )

    body = status_payload(analysis)

    body["detail"] = (
        "El análisis falló; "
        "no hay resultados disponibles"
        if analysis.status == "failed"
        else (
            "El análisis aún no tiene "
            "resultados disponibles"
        )
    )

    return JSONResponse(
        status_code=code,
        content=body,
    )


def require_result(
    analysis: Analysis,
) -> dict:
    if analysis.status == "completed":
        return analysis.result or {}

    return not_ready_response(analysis)  # type: ignore[return-value]


# =========================================================
# HELPERS
# =========================================================


def result_floor(
    result: dict,
) -> dict:
    return (
        result
        .get("site", {})
        .get("configuration", {})
        .get("floor", {})
    )


def average_dwell(
    zones: list[dict],
) -> float:
    values = [
        zone.get(
            "dwell_seconds",
            0.0,
        )
        or 0.0
        for zone in zones
    ]

    return (
        round(
            sum(values) / len(values),
            2,
        )
        if values
        else 0.0
    )


def get_video_duration_seconds(
    video_path: Path,
) -> float:
    capture = cv2.VideoCapture(str(video_path))

    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    finally:
        capture.release()

    if fps <= 0 or frame_count <= 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "No se pudo leer la duracion del video. "
                "Carga un MP4 valido."
            ),
        )

    return frame_count / fps


# =========================================================
# CREAR ANÁLISIS
# =========================================================


@router.post(
    "",
    status_code=202,
)
def create_analysis(
    site_id: int = Form(...),
    video: UploadFile = File(...),
    roi: str | None = Form(None),
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    site = database.get(
        Site,
        site_id,
    )

    if not can_access(user, site):
        raise HTTPException(
            status_code=404,
            detail="Sede no encontrada",
        )

    filename = (
        video.filename
        or "video.mp4"
    )

    extension = Path(
        filename
    ).suffix.lower()

    allowed_content_types = {
        "video/mp4",
        "application/octet-stream",
    }

    if (
        extension != ".mp4"
        or video.content_type
        not in allowed_content_types
    ):
        raise HTTPException(
            status_code=400,
            detail="Carga un archivo MP4 válido",
        )

    roi_polygon = parse_roi(roi)

    analysis_id = uuid.uuid4().hex

    video_path = (
        UPLOAD_DIR
        / f"{analysis_id}.mp4"
    )

    with video_path.open(
        "wb"
    ) as target:
        shutil.copyfileobj(
            video.file,
            target,
        )

    if video_path.stat().st_size == 0:
        video_path.unlink(
            missing_ok=True
        )

        raise HTTPException(
            status_code=400,
            detail="El archivo está vacío",
        )

    try:
        duration_seconds = get_video_duration_seconds(
            video_path
        )
    except HTTPException:
        video_path.unlink(
            missing_ok=True
        )
        raise

    if duration_seconds > MAX_VIDEO_DURATION_SECONDS:
        video_path.unlink(
            missing_ok=True
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "El video no puede durar mas de "
                f"{MAX_VIDEO_DURATION_SECONDS} segundos"
            ),
        )

    # -----------------------------------------------------
    # HORA REAL DE CREACIÓN
    # -----------------------------------------------------

    current_utc = datetime.now(
        timezone.utc
    )

    analysis = Analysis(
        id=analysis_id,
        site_id=site.id,
        user_id=user.id,
        filename=Path(filename).name,
        video_path=str(video_path),
        status="queued",
        stage="upload",
        progress=1,
        message=(
            "Video guardado; "
            "esperando inferencia"
        ),

        # IMPORTANTE:
        # Guardamos explícitamente la hora UTC
        # exacta en que se crea el análisis.
        created_at=current_utc,
    )

    database.add(analysis)
    database.commit()

    # Refrescamos para obtener exactamente
    # lo guardado en la base de datos.
    database.refresh(analysis)

    threading.Thread(
        target=run_analysis,
        args=(analysis_id,),
        kwargs={
            "roi": roi_polygon,
        },
        daemon=True,
    ).start()

    return {
        "id": analysis_id,
        "created_at": (
            normalize_created_at(
                analysis.created_at
            ).isoformat()
            if analysis.created_at
            else None
        ),
    }


# =========================================================
# LISTAR ANÁLISIS
# =========================================================


@router.get("")
def list_analyses(
    site_id: int | None = None,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> list[dict]:
    query = (
        select(Analysis)
        .join(Site)
        .order_by(
            Analysis.created_at.desc()
        )
    )

    if user.role != "admin":
        query = query.where(
            Site.retailer_id
            == user.retailer_id
        )

    if site_id:
        query = query.where(
            Analysis.site_id
            == site_id
        )

    analyses = database.scalars(
        query
    ).all()

    return [
        payload(item)
        for item in analyses
    ]


# =========================================================
# DETALLE
# =========================================================


@router.get(
    "/{analysis_id}"
)
def analysis_detail(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    analysis = database.get(
        Analysis,
        analysis_id,
    )

    site = (
        database.get(
            Site,
            analysis.site_id,
        )
        if analysis
        else None
    )

    if (
        not analysis
        or not can_access(
            user,
            site,
        )
    ):
        raise HTTPException(
            status_code=404,
            detail="Análisis no encontrado",
        )

    return payload(analysis)


# =========================================================
# INSIGHTS (IA — Claude)
# =========================================================


def _create_insights_payload(
    analysis_id: str,
    regenerate: bool = False,
    user: User | None = None,
    database: Session | None = None,
) -> dict:
    analysis = database.get(Analysis, analysis_id)
    site = database.get(Site, analysis.site_id) if analysis else None
    if not analysis or not can_access(user, site):
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    if analysis.status != "completed" or not analysis.result:
        raise HTTPException(status_code=409, detail="El análisis todavía no tiene resultados para interpretar")
    if analysis.insights and not regenerate:
        return analysis.insights

    try:
        frame_dir = RESULT_DIR / analysis_id
        frame_paths = sorted(frame_dir.glob("frame_*.jpg"))
        insights = generate_insights(analysis.result, frame_paths=frame_paths)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    analysis.insights = insights
    database.commit()
    return insights


@router.post("/{analysis_id}/insights")
def create_insights(
    analysis_id: str,
    regenerate: bool = False,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    return _create_insights_payload(analysis_id, regenerate, user, database)


@router.post("/{analysis_id}/recomendaciones")
def create_recommendations_alias(
    analysis_id: str,
    regenerate: bool = False,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    return _create_insights_payload(analysis_id, regenerate, user, database)


# =========================================================
# ARTEFACTOS
# =========================================================


@router.get(
    "/{analysis_id}/artifacts/{filename}"
)
def artifact(
    analysis_id: str,
    filename: str,
    user: User = Depends(
        user_from_query_token
    ),
    database: Session = Depends(get_db),
):
    analysis = database.get(
        Analysis,
        analysis_id,
    )

    site = (
        database.get(
            Site,
            analysis.site_id,
        )
        if analysis
        else None
    )

    if (
        not analysis
        or not can_access(
            user,
            site,
        )
    ):
        raise HTTPException(
            status_code=404,
            detail="Artefacto no encontrado",
        )

    safe_name = Path(
        filename
    ).name

    base_ok = safe_name in {
        "traffic.png",
        "dwell.png",
        "interaction.png",
        "pickup.png",
    }

    overlay_ok = re.fullmatch(
        r"overlay_(traffic|dwell|interaction|pickup)_[1-9]\d*\.jpg",
        safe_name,
    )

    frame_ok = re.fullmatch(
        r"frame_[1-9]\d*\.jpg",
        safe_name,
    )

    time_ok = re.fullmatch(
        r"time_\d+_(traffic|dwell|interaction|pickup)\.png",
        safe_name,
    )

    if (
        safe_name != filename
        or not (
            base_ok
            or overlay_ok
            or frame_ok
            or time_ok
        )
    ):
        raise HTTPException(
            status_code=404,
            detail="Artefacto no encontrado",
        )

    path = (
        RESULT_DIR
        / analysis_id
        / safe_name
    )

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Artefacto no encontrado",
        )

    return FileResponse(path)


# =========================================================
# VIDEO
# =========================================================


@router.get(
    "/{analysis_id}/video"
)
def analysis_video(
    analysis_id: str,
    user: User = Depends(
        user_from_query_token
    ),
    database: Session = Depends(get_db),
):
    analysis = database.get(
        Analysis,
        analysis_id,
    )

    site = (
        database.get(
            Site,
            analysis.site_id,
        )
        if analysis
        else None
    )

    if (
        not analysis
        or not can_access(
            user,
            site,
        )
    ):
        raise HTTPException(
            status_code=404,
            detail="Análisis no encontrado",
        )

    path = Path(
        analysis.video_path
    )

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Video no encontrado",
        )

    return FileResponse(
        path,
        media_type="video/mp4",
    )


# =========================================================
# STATUS
# =========================================================


@router.get(
    "/{analysis_id}/status"
)
def analysis_status(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    analysis, _ = owned_analysis(
        analysis_id,
        user,
        database,
    )

    return status_payload(
        analysis
    )


# =========================================================
# SUMMARY
# =========================================================


@router.get(
    "/{analysis_id}/summary"
)
def analysis_summary(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(
        analysis_id,
        user,
        database,
    )

    result = require_result(
        analysis
    )

    if isinstance(
        result,
        JSONResponse,
    ):
        return result

    return {
        "analysis_id": analysis.id,
        "analysis_mode": result.get(
            "analysis_mode"
        ),
        "coordinate_system": result.get(
            "coordinate_system"
        ),
        "video": result.get(
            "video",
            {},
        ),
        "metrics": result.get(
            "metrics",
            {},
        ),
        "zones": result.get(
            "zones",
            [],
        ),
        "gondolas": result.get(
            "gondolas",
            [],
        ),
    }


# =========================================================
# HEATMAP
# =========================================================


@router.get(
    "/{analysis_id}/heatmap"
)
def analysis_heatmap(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(
        analysis_id,
        user,
        database,
    )

    result = require_result(
        analysis
    )

    if isinstance(
        result,
        JSONResponse,
    ):
        return result

    return {
        "analysis_id": analysis.id,
        "analysis_mode": result.get(
            "analysis_mode"
        ),
        "heatmaps": result.get(
            "heatmaps",
            {},
        ),
        "floor": result_floor(
            result
        ),
        "roi": result.get(
            "roi"
        ),
    }


# =========================================================
# TRAJECTORIES
# =========================================================


@router.get(
    "/{analysis_id}/trajectories"
)
def analysis_trajectories(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(
        analysis_id,
        user,
        database,
    )

    result = require_result(
        analysis
    )

    if isinstance(
        result,
        JSONResponse,
    ):
        return result

    return {
        "analysis_id": analysis.id,
        "coordinate_system": result.get(
            "coordinate_system"
        ),
        "trajectories": result.get(
            "trajectories",
            [],
        ),
        "metrics": result.get(
            "metrics",
            {},
        ),
        "floor": result_floor(
            result
        ),
    }


# =========================================================
# DWELL
# =========================================================


@router.get(
    "/{analysis_id}/dwell"
)
def analysis_dwell(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(
        analysis_id,
        user,
        database,
    )

    result = require_result(
        analysis
    )

    if isinstance(
        result,
        JSONResponse,
    ):
        return result

    zones = result.get(
        "zones",
        [],
    )

    return {
        "analysis_id": analysis.id,
        "duration_seconds": (
            result.get("video")
            or {}
        ).get(
            "duration_seconds"
        ),
        "avg_dwell_seconds": average_dwell(
            zones
        ),
        "zones": zones,
        "gondolas": result.get(
            "gondolas",
            [],
        ),
    }


# =========================================================
# INTERACTIONS
# =========================================================


@router.get(
    "/{analysis_id}/interactions"
)
def analysis_interactions(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(
        analysis_id,
        user,
        database,
    )

    result = require_result(
        analysis
    )

    if isinstance(
        result,
        JSONResponse,
    ):
        return result

    return {
        "analysis_id": analysis.id,
        "gondolas": result.get(
            "gondolas",
            [],
        ),
        "interaction_events_log": result.get(
            "interaction_events_log",
            [],
        ),
        "interaction_histogram": result.get(
            "interaction_histogram"
        ),
        "pickup_events_log": result.get(
            "pickup_events_log",
            [],
        ),
        "pickup_histogram": result.get(
            "pickup_histogram"
        ),
    }


# =========================================================
# ZONES
# =========================================================


@router.get(
    "/{analysis_id}/zones"
)
def analysis_zones(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(
        analysis_id,
        user,
        database,
    )

    result = require_result(
        analysis
    )

    if isinstance(
        result,
        JSONResponse,
    ):
        return result

    return {
        "analysis_id": analysis.id,
        "coordinate_system": result.get(
            "coordinate_system"
        ),
        "zones": result.get(
            "zones",
            [],
        ),
        "floor": result_floor(
            result
        ),
    }


# =========================================================
# RECOMMENDATIONS
# =========================================================


@router.get(
    "/{analysis_id}/recommendations"
)
def analysis_recommendations(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(
        analysis_id,
        user,
        database,
    )

    result = require_result(
        analysis
    )

    if isinstance(
        result,
        JSONResponse,
    ):
        return result

    recommendations = result.get(
        "recommendations"
    )

    if recommendations is None:
        recommendations = [
            finding
            for finding in result.get(
                "findings",
                [],
            )
            if finding.get("type")
            == "recommendation"
        ]

    return {
        "analysis_id": analysis.id,
        "analysis_mode": result.get(
            "analysis_mode"
        ),
        "recommendations": recommendations,
    }


# =========================================================
# VISUALIZACIÓN 3D
# =========================================================


@router.get(
    "/{analysis_id}/visualization-3d"
)
def analysis_visualization_3d(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
):
    analysis, _ = owned_analysis(
        analysis_id,
        user,
        database,
    )

    result = require_result(
        analysis
    )

    if isinstance(
        result,
        JSONResponse,
    ):
        return result

    if (
        result.get("analysis_mode")
        != "advanced"
    ):
        return {
            "analysis_id": analysis.id,
            "available": False,
            "reason": (
                "3D requires calibrated camera"
            ),
        }

    configuration = (
        result
        .get("site", {})
        .get(
            "configuration",
            {},
        )
    )

    return {
        "analysis_id": analysis.id,
        "available": True,
        "configuration": configuration,
        "camera": configuration.get(
            "camera",
            {},
        ),
        "gondolas": result.get(
            "gondolas",
            [],
        ),
        "zones": result.get(
            "zones",
            [],
        ),
    }


# =========================================================
# EXPORTAR INSIGHTS COMO WORD (.docx)
# =========================================================


@router.get("/{analysis_id}/insights/export")
def export_insights_docx(
    analysis_id: str,
    user: User = Depends(user_from_query_token),
    database: Session = Depends(get_db),
):
    """Descarga las recomendaciones de Claude como archivo Word (.docx).
    Si aún no se han generado los insights, devuelve 409.
    """
    analysis = database.get(Analysis, analysis_id)
    site = database.get(Site, analysis.site_id) if analysis else None
    if not analysis or not can_access(user, site):
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    if not analysis.insights:
        raise HTTPException(
            status_code=409,
            detail="Genera las recomendaciones primero antes de exportar",
        )

    try:
        from docx import Document
        from docx.shared import Inches, Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="python-docx no está instalado. Agrega 'python-docx' a requirements.txt y reinicia el servidor.",
        )

    _NAVY = "0F172A"
    _ACCENT = "FF6B3D"
    _SLATE = "64748B"
    _BG_ALT = "F1F5F9"
    _PALETTE = ["#FF6B3D", "#0EA5E9", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899", "#14B8A6", "#6366F1"]

    def _shade(cell, color: str) -> None:
        shading = OxmlElement("w:shd")
        shading.set(qn("w:val"), "clear")
        shading.set(qn("w:fill"), color)
        cell._tc.get_or_add_tcPr().append(shading)

    def _cell_borders(cell, color: str = "E2E8F0", size: str = "6") -> None:
        tcPr = cell._tc.get_or_add_tcPr()
        borders = OxmlElement("w:tcBorders")
        for edge in ("top", "left", "bottom", "right"):
            el = OxmlElement(f"w:{edge}")
            el.set(qn("w:val"), "single")
            el.set(qn("w:sz"), size)
            el.set(qn("w:color"), color)
            borders.append(el)
        tcPr.append(borders)

    def _set_cell_margins(table, top: int = 60, bottom: int = 60, left: int = 120, right: int = 120) -> None:
        tblPr = table._tbl.tblPr
        mar = OxmlElement("w:tblCellMar")
        for edge, val in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
            el = OxmlElement(f"w:{edge}")
            el.set(qn("w:w"), str(val))
            el.set(qn("w:type"), "dxa")
            mar.append(el)
        tblPr.append(mar)

    def _modern_mpl():
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        plt.rcParams.update({
            "font.family": "DejaVu Sans",
            "axes.facecolor": "#FFFFFF",
            "figure.facecolor": "#FFFFFF",
            "axes.edgecolor": "#CBD5E1",
            "axes.grid": True,
            "grid.color": "#E2E8F0",
            "grid.linewidth": 0.7,
            "grid.alpha": 0.9,
            "axes.axisbelow": True,
        })
        return plt

    def _styled_table(headers: list[str], rows_data: list[list], col_widths: list | None = None) -> None:
        table = doc.add_table(rows=1, cols=len(headers))
        table.style = "Table Grid"
        table.autofit = False
        _set_cell_margins(table)
        if col_widths:
            for idx, w in enumerate(col_widths):
                for row in table.rows:
                    row.cells[idx].width = Inches(w)
        for cell, text in zip(table.rows[0].cells, headers):
            cell.text = ""
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(str(text))
            run.bold = True
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            run.font.name = "Segoe UI"
            _shade(cell, _NAVY)
            _cell_borders(cell)
        for r_idx, row_data in enumerate(rows_data):
            row = table.add_row()
            stripe = _BG_ALT if r_idx % 2 == 1 else "FFFFFF"
            for cell, value in zip(row.cells, row_data):
                cell.text = ""
                p = cell.paragraphs[0]
                run = p.add_run(str(value))
                run.font.size = Pt(9)
                run.font.name = "Segoe UI"
                run.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
                _shade(cell, stripe)
                _cell_borders(cell)
        doc.add_paragraph()

    def _caption(text: str) -> None:
        para = doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = para.add_run(text)
        run.italic = True
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
        run.font.name = "Segoe UI"

    def _section_heading(number: str, title: str, level: int = 1):
        h = doc.add_heading(f"{number}  {title}", level=level)
        for run in h.runs:
            run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        # Línea de acento naranja debajo del título
        bar = doc.add_table(rows=1, cols=1)
        bar.autofit = False
        bar.columns[0].width = Inches(1.1)
        cell = bar.cell(0, 0)
        cell.text = ""
        _shade(cell, _ACCENT)
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        run = p.add_run(" ")
        run.font.size = Pt(2)
        doc.add_paragraph()
        return h

    def _zone_chart(labels: list, values: list, title: str, xlabel: str, color: str = "#FF6B3D"):
        """Barras horizontales modernas: grilla suave, etiquetas de valor, dpi 200."""
        try:
            plt = _modern_mpl()
        except ImportError:
            return None
        try:
            import numpy as np

            n = max(len(labels), 1)
            fig, ax = plt.subplots(figsize=(7.2, max(3.0, 0.62 * n)))
            y = np.arange(n)
            bars = ax.barh(y, values, height=0.55, color=color, edgecolor="white", linewidth=1.2, zorder=3)
            ax.set_yticks(y)
            ax.set_yticklabels(labels, fontsize=9, color="#334155")
            ax.set_xlabel(xlabel, fontsize=9, color="#64748B")
            ax.set_title(title, fontweight="bold", fontsize=12, color="#0F172A", pad=12, loc="left")
            ax.invert_yaxis()
            ax.tick_params(axis="x", labelsize=8, colors="#64748B")
            for spine in ("top", "right"):
                ax.spines[spine].set_visible(False)
            for spine in ("left", "bottom"):
                ax.spines[spine].set_color("#CBD5E1")
            vmax = max(list(values) + [0]) or 1
            ax.set_xlim(0, vmax * 1.18)
            ax.bar_label(bars, fmt="%.1f" if any(isinstance(v, float) for v in values) else "%d",
                         fontsize=8, color="#0F172A", padding=4)
            fig.tight_layout()
            buf = BytesIO()
            fig.savefig(buf, format="png", dpi=200, bbox_inches="tight")
            plt.close(fig)
            buf.seek(0)
            return buf
        except Exception:
            return None

    def _zone_pie(labels: list, values: list, title: str):
        """Dona moderna con leyenda lateral y paleta de marca."""
        try:
            plt = _modern_mpl()
        except ImportError:
            return None
        try:
            total = sum(values or [])
            if not total:
                return None
            fig, ax = plt.subplots(figsize=(7.2, 3.8))
            colors = [_PALETTE[i % len(_PALETTE)] for i in range(len(labels))]
            wedges, _, autotexts = ax.pie(
                values, autopct=lambda p: f"{p:.1f}%" if p >= 4 else "",
                startangle=90, counterclock=False,
                colors=colors,
                wedgeprops=dict(width=0.46, edgecolor="white", linewidth=2),
                pctdistance=0.80, textprops=dict(fontsize=8, color="#0F172A", weight="bold"),
            )
            for t in autotexts:
                t.set_bbox(dict(boxstyle="round,pad=0.25", fc="white", ec="#E2E8F0", alpha=0.95))
            ax.set_title(title, fontweight="bold", fontsize=12, color="#0F172A", pad=12, loc="left")
            ax.axis("equal")
            ax.legend(wedges, labels, loc="center left", bbox_to_anchor=(1.0, 0.5),
                      fontsize=8, frameon=True, facecolor="white", edgecolor="#E2E8F0")
            fig.tight_layout()
            buf = BytesIO()
            fig.savefig(buf, format="png", dpi=200, bbox_inches="tight")
            plt.close(fig)
            buf.seek(0)
            return buf
        except Exception:
            return None

    insights = analysis.insights
    result = analysis.result or {}
    frame_dir = RESULT_DIR / analysis_id
    site_name = site.name if site else result.get("site", {}).get("name", "Tienda")
    video = result.get("video", {}) or {}
    metrics = result.get("metrics", {}) or {}
    zones_data = result.get("zones", []) or []
    heatmaps_meta = result.get("heatmaps", {}) or {}
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    doc = Document()
    doc.core_properties.title = "Recomendaciones de Space Management"
    doc.core_properties.author = "Scapder"

    # Márgenes y tipografía moderna
    for section in doc.sections:
        section.top_margin = Inches(0.7)
        section.bottom_margin = Inches(0.7)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)
        # Pie con número de página + privacidad
        footer = section.footer
        footer.is_linked_to_previous = False
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = fp.add_run()
        fld1 = OxmlElement("w:fldChar"); fld1.set(qn("w:fldCharType"), "begin")
        instr = OxmlElement("w:instrText"); instr.set(qn("xml:space"), "preserve"); instr.text = "PAGE"
        fld_sep = OxmlElement("w:fldChar"); fld_sep.set(qn("w:fldCharType"), "separate")
        fld2 = OxmlElement("w:fldChar"); fld2.set(qn("w:fldCharType"), "end")
        run._r.append(fld1); run2 = fp.add_run(); run2._r.append(instr)
        run_sep = fp.add_run(); run_sep._r.append(fld_sep)
        run3 = fp.add_run(); run3._r.append(fld2)
        tail = fp.add_run("  ·  Scapder · Espacio inteligente  ·  Confidencial")
        tail.font.size = Pt(7.5); tail.font.color.rgb = RGBColor(0x64, 0x74, 0x8B); tail.font.name = "Segoe UI"
        # Encabezado de marca
        header = section.header
        header.is_linked_to_previous = False
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hr = hp.add_run("SCAPDER  ·  SPACE INTELLIGENCE")
        hr.font.size = Pt(7.5); hr.font.color.rgb = RGBColor(0x64, 0x74, 0x8B); hr.bold = True; hr.font.name = "Segoe UI"

    # Tipografía del documento
    doc.styles["Normal"].font.name = "Segoe UI"
    doc.styles["Normal"].font.size = Pt(10)
    doc.styles["Normal"].font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
    doc.styles["Normal"].paragraph_format.space_after = Pt(6)
    doc.styles["Normal"].paragraph_format.line_spacing = 1.12
    for _level in (1, 2):
        _hs = doc.styles[f"Heading {_level}"]
        _hs.font.name = "Segoe UI"
        _hs.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        _hs.font.bold = True
    doc.styles["Title"].font.name = "Segoe UI"
    doc.styles["Title"].font.size = Pt(28)
    doc.styles["Title"].font.bold = True
    doc.styles["Title"].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    # ── PORTADA: banner navy + acento ─────────────────────────────
    cover = doc.add_table(rows=1, cols=1)
    cover.autofit = False
    cover.columns[0].width = Inches(6.8)
    ccell = cover.cell(0, 0)
    ccell.text = ""
    _shade(ccell, _NAVY)
    _set_cell_margins(cover, top=220, bottom=220, left=320, right=320)
    eyebrow = ccell.paragraphs[0]
    eyebrow.alignment = WD_ALIGN_PARAGRAPH.LEFT
    er = eyebrow.add_run("SCAPDER  ·  INTELIGENCIA ESPACIAL EN TIENDA")
    er.font.size = Pt(8); er.bold = True; er.font.color.rgb = RGBColor(0xFF, 0x6B, 0x3D); er.font.name = "Segoe UI"
    t2 = ccell.add_paragraph()
    tr = t2.add_run("Recomendaciones de\nSpace Management")
    tr.font.size = Pt(28); tr.bold = True; tr.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF); tr.font.name = "Segoe UI"
    sub = ccell.add_paragraph()
    sr = sub.add_run(f"{site_name}   ·   {generated_at}   ·   {result.get('analysis_mode', '')}   ·   ID {analysis_id[:8]}")
    sr.font.size = Pt(9); sr.font.color.rgb = RGBColor(0xC8, 0xD1, 0xE0); sr.font.name = "Segoe UI"
    doc.add_paragraph()

    # ── Tarjetas KPI (4 columnas) ─────────────────────────────────
    def _kpi_cards(cards: list[tuple[str, str]]):
        tbl = doc.add_table(rows=2, cols=len(cards))
        tbl.style = "Table Grid"
        tbl.autofit = False
        _set_cell_margins(tbl, top=90, bottom=90, left=140, right=140)
        for j, (label, _v) in enumerate(cards):
            cell = tbl.cell(0, j)
            cell.text = ""
            p = cell.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run(label.upper())
            r.font.size = Pt(7.5); r.bold = True; r.font.color.rgb = RGBColor(0x64, 0x74, 0x8B); r.font.name = "Segoe UI"
            _shade(cell, "F8FAFC"); _cell_borders(cell)
        for j, (_l, value) in enumerate(cards):
            cell = tbl.cell(1, j)
            cell.text = ""
            p = cell.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run(str(value))
            r.font.size = Pt(14); r.bold = True; r.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A); r.font.name = "Segoe UI"
            _shade(cell, "FFFFFF"); _cell_borders(cell)
        doc.add_paragraph()

    _kpi_cards([
        ("Personas", metrics.get("people_detected", metrics.get("tracked_presences", "—"))),
        ("Interacciones", metrics.get("interaction_events", "—")),
        ("Pickups", metrics.get("pickup_events", "—")),
        ("Zonas", len(zones_data)),
    ])

    # Ficha del análisis
    _section_heading("▸", "Ficha del análisis", level=1)
    _styled_table(
        ["Campo", "Valor"],
        [
        ["ID del análisis", analysis_id],
            ["Sede", site_name],
            ["Modo de análisis", result.get("analysis_mode", "")],
            ["Duración del video (s)", video.get("duration_seconds", "")],
            ["Personas detectadas", metrics.get("people_detected", metrics.get("tracked_presences", ""))],
            ["Eventos de interacción", metrics.get("interaction_events", "")],
            ["Eventos de pickup", metrics.get("pickup_events", "")],
            ["Zonas analizadas", len(zones_data)],
        ],
        col_widths=[2.2, 4.6],
    )

    # Hallazgo principal (callout con fondo claro)
    _section_heading("01", "Hallazgo principal", level=1)
    callout = doc.add_table(rows=1, cols=1)
    callout.autofit = False
    callout.columns[0].width = Inches(6.8)
    c0 = callout.cell(0, 0)
    c0.text = ""
    _shade(c0, "FFF7F2")
    _cell_borders(c0, color="FF6B3D", size="9")
    p = c0.paragraphs[0]
    r = p.add_run(insights.get("hallazgo_principal", ""))
    r.font.size = Pt(10.5); r.italic = True; r.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
    doc.add_paragraph()

    # Resumen ejecutivo
    _section_heading("02", "Resumen ejecutivo", level=1)
    doc.add_paragraph(insights.get("resumen_ejecutivo", ""))

    # Recomendaciones
    _section_heading("03", "Recomendaciones accionables", level=1)
    for i, rec in enumerate(insights.get("recomendaciones", []), start=1):
        doc.add_heading(f"3.{i} {rec.get('titulo', '')}", level=2)

        p_just = doc.add_paragraph()
        p_just.add_run("Justificación: ").bold = True
        p_just.add_run(rec.get("justificacion", ""))

        p_impact = doc.add_paragraph()
        p_impact.add_run("Impacto estimado: ").bold = True
        p_impact.add_run(rec.get("impacto_estimado", ""))

        evidencia = rec.get("evidencia_visual")
        if evidencia and evidencia != "null":
            p_ev = doc.add_paragraph()
            p_ev.add_run("📷 Evidencia visual: ").bold = True
            p_ev.add_run(evidencia)

            # Extraer nombre de frame con regex (ej. "frame_2" en cualquier formato)
            frame_match = re.search(r"frame_\d+", evidencia)
            frame_path = frame_dir / f"{frame_match.group(0)}.jpg" if frame_match else None
            if frame_path is not None and frame_path.exists():
                try:
                    doc.add_picture(str(frame_path), width=Inches(4.5))
                    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    _caption(f"Figura 3.{i} — {frame_match.group(0)}")
                except Exception:
                    pass  # Si la imagen falla, seguimos sin ella

        doc.add_paragraph()  # separador entre recomendaciones

    # ── Tabla de métricas por zona ───────────────────────────────────────────
    if zones_data:
        _section_heading("04", "Métricas por zona", level=1)
        doc.add_paragraph(
            "Detalle medido por zona. Usa los filtros del Excel para ordenar y comparar."
        ).runs[0].font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
        _styled_table(
            ["Zona", "Visitas", "Permanencia (s)", "Interacciones", "Heat index", "Clasificación"],
            [
                [
                    z.get("name", z.get("zone_id", "")),
                    z.get("visits", 0),
                    round(float(z.get("dwell_seconds", 0) or 0), 1),
                    z.get("interactions", 0),
                    z.get("heat_index", 0),
                    z.get("classification", ""),
                ]
                for z in zones_data
            ],
        )

    # ── Gráficas de zonas (barras generadas con matplotlib) ──────────────────
    if zones_data:
        zone_names = [z.get("name", z.get("zone_id", "")) for z in zones_data]
        zone_graphics = [
            ([z.get("visits", 0) for z in zones_data], "Visitas por zona", "Visitas", "#FF6B3D"),
            ([round(float(z.get("dwell_seconds", 0) or 0), 1) for z in zones_data], "Permanencia por zona (s)", "Segundos", "#0EA5E9"),
            ([z.get("heat_index", 0) for z in zones_data], "Heat index por zona (0-1)", "Heat index", "#10B981"),
        ]
        _section_heading("05", "Gráficas de zonas", level=1)
        intro = doc.add_paragraph(
            "Comparativa visual de las zonas a partir de los datos medidos por visión computacional. "
            "Barras con valores y donas con distribución porcentual."
        )
        intro.runs[0].font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
        for idx, (values, title, xlabel, color) in enumerate(zone_graphics, start=1):
            buf = _zone_chart(zone_names, values, title, xlabel, color)
            if buf is None:
                continue
            doc.add_picture(buf, width=Inches(6.0))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            _caption(f"Figura 5.{idx} — {title}")
            doc.add_paragraph()
        zone_pies = [
            ([z.get("visits", 0) for z in zones_data], "Distribución de visitas por zona (%)"),
            ([round(float(z.get("dwell_seconds", 0) or 0), 1) for z in zones_data], "Distribución de permanencia por zona (%)"),
        ]
        for j, (values, title) in enumerate(zone_pies, start=len(zone_graphics) + 1):
            buf = _zone_pie(zone_names, values, title)
            if buf is None:
                continue
            doc.add_picture(buf, width=Inches(6.0))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            _caption(f"Figura 5.{j} — {title}")
            doc.add_paragraph()

    # ── Sección de mapas de calor ────────────────────────────────────────────
    # Solo mapas reales con datos (el pipeline deja placeholders de ~2 KB sin datos).
    heatmap_labels = [
        ("traffic", "Mapa de tráfico (densidad de visitas por zona)"),
        ("dwell", "Mapa de permanencia (segundos acumulados por zona)"),
        ("interaction", "Mapa de interacciones (eventos pick-up / put-back)"),
        ("pickup", "Mapa de recogidas (pickup) por zona"),
    ]
    real_heatmaps = []
    for key, caption in heatmap_labels:
        fname = heatmaps_meta.get(key)
        if not fname:
            continue
        hmap_path = frame_dir / fname
        if hmap_path.exists() and hmap_path.stat().st_size >= 5120:
            real_heatmaps.append((hmap_path, caption))
    if real_heatmaps:
        _section_heading("06", "Mapas de calor", level=1)
        intro_h = doc.add_paragraph(
            "Mapas generados automáticamente por visión computacional (YOLO + ByteTrack). "
            "Reflejan datos reales del video analizado; se omiten placeholders sin datos."
        )
        intro_h.runs[0].font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
        for hmap_path, caption in real_heatmaps:
            try:
                doc.add_picture(str(hmap_path), width=Inches(6.0))
                doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                _caption(caption)
                doc.add_paragraph()
            except Exception:
                pass

    # Cierre / privacidad
    doc.add_paragraph()
    box = doc.add_table(rows=1, cols=1)
    box.autofit = False
    box.columns[0].width = Inches(6.8)
    bcell = box.cell(0, 0)
    bcell.text = ""
    _shade(bcell, "F8FAFC")
    _cell_borders(bcell)
    bp = bcell.paragraphs[0]
    br = bp.add_run(
        "Privacidad por diseño: sin biometría, sin reconocimiento facial, sin atributos personales. "
        "Cumple Ley 1581 de 2012 (Colombia). IDs de rastreo temporales, no persistidos."
    )
    br.font.size = Pt(7.5); br.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)

    safe_filename = f"recomendaciones_{analysis_id[:8]}.docx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


# =========================================================
# EXPORTAR INSIGHTS + MÉTRICAS COMO EXCEL (.xlsx)
# =========================================================

_ACCENT = "FF6B3D"
_DARK = "0F172A"
_NAVY = "0F172A"
_LIGHT_BG = "FFF7F2"
_ALT_ROW = "F8FAFC"
_GRID = "E2E8F0"
_SERIES_COLORS = ["FF6B3D", "0EA5E9", "10B981", "8B5CF6", "F59E0B", "EC4899", "14B8A6", "6366F1"]


def _excel_header_style(cell) -> None:
    from openpyxl.styles import Alignment, Font, PatternFill

    cell.fill = PatternFill("solid", fgColor=_NAVY)
    cell.font = Font(bold=True, color="FFFFFF", size=10, name="Calibri")
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def _excel_title_style(cell, size: int = 16) -> None:
    from openpyxl.styles import Font

    cell.font = Font(bold=True, color=_DARK, size=size, name="Calibri")


def _excel_band_row(ws, row: int, ncols: int, fill: str) -> None:
    from openpyxl.styles import PatternFill

    f = PatternFill("solid", fgColor=fill)
    for c in range(1, ncols + 1):
        ws.cell(row=row, column=c).fill = f


def _excel_chart_series_color(chart, color: str) -> None:
    try:
        for s in chart.series:
            s.graphicalProperties.solidFill = color
            s.graphicalProperties.line.solidFill = color
            s.smooth = False
    except Exception:
        pass


def _excel_multicolor_points(series, n_points: int, palette: list | None = None) -> None:
    """Colorea cada barra / porción con un color distinto de la paleta.

    openpyxl lo soporta vía series.dPt (DataPoint por índice). Si falla,
    se deja el color por defecto sin romper la exportación.
    """
    try:
        from openpyxl.chart.marker import DataPoint
        from openpyxl.chart.shapes import GraphicalProperties

        colors = palette or _SERIES_COLORS
        series.dPt = []
        for i in range(max(int(n_points or 0), 0)):
            pt = DataPoint(idx=i)
            pt.graphicalProperties = GraphicalProperties(solidFill=colors[i % len(colors)])
            try:
                pt.graphicalProperties.line.noFill = True
            except Exception:
                pass
            series.dPt.append(pt)
    except Exception:
        pass


@router.get("/{analysis_id}/insights/export-excel")
def export_insights_excel(
    analysis_id: str,
    user: User = Depends(user_from_query_token),
    database: Session = Depends(get_db),
):
    """Descarga recomendaciones + métricas como Excel (.xlsx) con gráficas.

    Hojas: Resumen, Zonas, Recomendaciones y Dashboard
    (gráficas nativas de Excel + heatmaps incrustados).
    Si aún no se generaron los insights, devuelve 409.
    """
    analysis = database.get(Analysis, analysis_id)
    site = database.get(Site, analysis.site_id) if analysis else None
    if not analysis or not can_access(user, site):
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    if not analysis.insights:
        raise HTTPException(
            status_code=409,
            detail="Genera las recomendaciones primero antes de exportar",
        )

    try:
        from openpyxl import Workbook
        from openpyxl.chart import BarChart, DoughnutChart, LineChart, PieChart, Reference
        from openpyxl.chart.label import DataLabelList
        from openpyxl.drawing.image import Image as XLImage
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="openpyxl no está instalado. Agrega 'openpyxl' a requirements.txt y reinicia el servidor.",
        )

    insights = analysis.insights or {}
    result = analysis.result or {}
    video = result.get("video", {}) or {}
    metrics = result.get("metrics", {}) or {}
    zones = result.get("zones", []) or []
    recommendations = insights.get("recomendaciones", []) or []
    frame_dir = RESULT_DIR / analysis_id
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    thin = Side(style="thin", color="E2E8F0")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    wb = Workbook()
    wb.properties.title = "Recomendaciones de Space Management"
    wb.properties.creator = "Scapder"

    # ── Hoja 1: Resumen ──────────────────────────────────────────────
    ws = wb.active
    ws.title = "Resumen"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.sheet_properties.tabColor = _NAVY
    ws.oddHeader.center.text = "Scapder · Space Intelligence"
    # Banner superior navy
    ws.merge_cells("A1:B1")
    ws["A1"] = "SCAPDER  ·  INTELIGENCIA ESPACIAL EN TIENDA"
    ws["A1"].fill = PatternFill("solid", fgColor=_NAVY)
    ws["A1"].font = Font(bold=True, color="FF6B3D", size=9, name="Calibri")
    ws["A1"].alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 20
    ws.merge_cells("A2:B2")
    ws["A2"] = "Recomendaciones de Space Management"
    _excel_title_style(ws["A2"], size=18)
    ws.row_dimensions[2].height = 26
    ws.merge_cells("A3:B3")
    site_label = site.name if site else result.get("site", {}).get("name", "Tienda")
    ws["A3"] = f"{site_label}  ·  {generated_at}  ·  Modo {result.get('analysis_mode', '')}  ·  ID {analysis_id[:8]}"
    ws["A3"].font = Font(color="64748B", size=10, italic=True, name="Calibri")
    ws.row_dimensions[3].height = 16

    def _section_title(row: int, title: str) -> None:
        ws.merge_cells(f"A{row}:B{row}")
        c = ws.cell(row=row, column=1, value=title)
        c.font = Font(bold=True, size=12, color=_NAVY, name="Calibri")
        # subrayado naranja: borde inferior en la fila
        for col in (1, 2):
            ws.cell(row=row, column=col).border = Border(bottom=Side(style="medium", color=_ACCENT))
        # banda de acento fina debajo
        ws.row_dimensions[row].height = 20

    def _kpi_table(start_row: int, title: str, rows: list) -> int:
        _section_title(start_row, title)
        header_row = start_row + 1
        ws.row_dimensions[header_row].height = 20
        ws.cell(row=header_row, column=1, value="Indicador")
        ws.cell(row=header_row, column=2, value="Valor")
        _excel_header_style(ws.cell(row=header_row, column=1))
        _excel_header_style(ws.cell(row=header_row, column=2))
        ws.cell(row=header_row, column=1).border = border
        ws.cell(row=header_row, column=2).border = border
        for i, (label, value) in enumerate(rows, start=header_row + 1):
            label_cell = ws.cell(row=i, column=1, value=label)
            label_cell.border = border
            label_cell.font = Font(bold=True, color="0F172A", size=10, name="Calibri")
            label_cell.alignment = Alignment(vertical="center")
            value_cell = ws.cell(row=i, column=2, value=value)
            value_cell.border = border
            value_cell.font = Font(size=10, name="Calibri")
            value_cell.alignment = Alignment(vertical="center", wrap_text=True)
            if i % 2 == 0:
                label_cell.fill = PatternFill("solid", fgColor=_ALT_ROW)
                value_cell.fill = PatternFill("solid", fgColor=_ALT_ROW)
            ws.row_dimensions[i].height = 18
        return header_row + len(rows) + 2  # siguiente fila libre (+1 de separación)

    next_row = _kpi_table(4, "1. Información del análisis", [
        ("ID del análisis", analysis_id),
        ("Modo de análisis", result.get("analysis_mode", "")),
        ("Duración del video (s)", video.get("duration_seconds", "")),
        ("FPS", video.get("fps", "")),
        ("Zonas analizadas", len(zones)),
    ])

    ws.cell(row=next_row, column=1, value="2. Hallazgo principal").font = Font(bold=True, size=13, color=_DARK)
    ws.cell(row=next_row + 1, column=1, value=insights.get("hallazgo_principal", "")).alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(f"A{next_row + 1}:B{next_row + 1}")
    ws.row_dimensions[next_row + 1].height = 45
    # resaltar hallazgo con fondo cálido
    for col in (1, 2):
        ws.cell(row=next_row + 1, column=col).fill = PatternFill("solid", fgColor=_LIGHT_BG)
        ws.cell(row=next_row + 1, column=col).border = border
        ws.cell(row=next_row + 1, column=col).font = Font(italic=True, size=10, color="0F172A", name="Calibri")

    ws.cell(row=next_row + 3, column=1, value="3. Resumen ejecutivo").font = Font(bold=True, size=13, color=_DARK)
    ws.cell(row=next_row + 4, column=1, value=insights.get("resumen_ejecutivo", "")).alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(f"A{next_row + 4}:B{next_row + 4}")
    ws.row_dimensions[next_row + 4].height = 45
    for col in (1, 2):
        ws.cell(row=next_row + 4, column=col).border = border

    speed_value = metrics.get("average_speed_m_s") or 0.0
    speed_label = "Velocidad prom. (m/s)"
    if result.get("analysis_mode") == "fast" or not speed_value:
        speed_value = metrics.get("average_speed_normalized", "")
        speed_label = "Velocidad prom. (normalizada, modo rápido)"
    kpi_row = _kpi_table(next_row + 6, "4. Indicadores de comportamiento", [
        ("Personas detectadas", metrics.get("people_detected", metrics.get("tracked_presences", ""))),
        ("Presencia máxima simultánea", metrics.get("peak_presence", "")),
        ("Trayectorias analizadas", metrics.get("trajectories", "")),
        ("Detecciones totales", metrics.get("detections", "")),
        ("Eventos de interacción", metrics.get("interaction_events", "")),
        ("Eventos de pickup", metrics.get("pickup_events", "")),
        ("Flujo por minuto", metrics.get("flow_per_minute", "")),
        (speed_label, speed_value),
    ])

    ws.column_dimensions["A"].width = 34
    ws.column_dimensions["B"].width = 62

    # ── Hoja 2: Zonas ────────────────────────────────────────────────
    wz = wb.create_sheet("Zonas")
    wz.sheet_properties.pageSetUpPr.fitToPage = True
    wz.sheet_properties.tabColor = "0EA5E9"
    wz.sheet_properties.pageSetUpPr.fitToPage = True
    wz.print_title_rows = "1:1"
    z_headers = ["Zona", "Visitas", "Densidad (vis/min)", "Permanencia (s)", "Dwell prom. (s)", "Interacciones", "Heat index", "Clasificación"]
    for col, header in enumerate(z_headers, start=1):
        cell = wz.cell(row=1, column=col, value=header)
        _excel_header_style(cell)
        cell.border = border
    wz.row_dimensions[1].height = 28
    for r, z in enumerate(zones, start=2):
        values = [
            z.get("name", z.get("zone_id", z.get("id", ""))),
            z.get("visits", 0),
            z.get("density", 0),
            z.get("dwell_seconds", 0),
            z.get("avg_dwell_seconds", 0),
            z.get("interactions", 0),
            z.get("heat_index", 0),
            z.get("classification", ""),
        ]
        is_alt = r % 2 == 1
        for col, value in enumerate(values, start=1):
            cell = wz.cell(row=r, column=col, value=value)
            cell.border = border
            cell.font = Font(size=10, name="Calibri", bold=(col == 1))
            if is_alt:
                cell.fill = PatternFill("solid", fgColor=_ALT_ROW)
            if col > 1:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")
            # formatos numéricos
            if col in (2, 6):
                cell.number_format = '#,##0'
            elif col in (3, 4, 5):
                cell.number_format = '#,##0.0'
            elif col == 7:
                cell.number_format = '0.00'
        wz.row_dimensions[r].height = 18
    for col, width in enumerate([24, 12, 18, 17, 16, 15, 12, 15], start=1):
        wz.column_dimensions[wz.cell(row=1, column=col).column_letter].width = width
    wz.freeze_panes = "A2"
    if zones:
        wz.auto_filter.ref = f"A1:H{len(zones) + 1}"
        # Formato condicional moderno: escala de color para Heat index + barras para Visitas
        try:
            from openpyxl.formatting.rule import ColorScaleRule, DataBarRule

            wz.conditional_formatting.add(f"G2:G{len(zones) + 1}",
                ColorScaleRule(start_type="min", start_color="F1F5F9",
                               mid_type="percentile", mid_value=50, mid_color="FED7AA",
                               end_type="max", end_color="FF6B3D"))
            wz.conditional_formatting.add(f"B2:B{len(zones) + 1}",
                DataBarRule(start_type="num", start_value=0, end_type="max", color="0EA5E9"))
        except Exception:
            pass

    # ── Hoja 3: Recomendaciones ──────────────────────────────────────
    wr = wb.create_sheet("Recomendaciones")
    wr.sheet_properties.pageSetUpPr.fitToPage = True
    wr.sheet_properties.tabColor = "FF6B3D"
    wr.print_title_rows = "1:1"
    wr.row_dimensions[1].height = 28
    r_headers = ["#", "Título", "Justificación", "Impacto estimado", "Evidencia visual"]
    for col, header in enumerate(r_headers, start=1):
        cell = wr.cell(row=1, column=col, value=header)
        _excel_header_style(cell)
        cell.border = border
    for i, rec in enumerate(recommendations, start=1):
        row = [
            i,
            rec.get("titulo", ""),
            rec.get("justificacion", ""),
            rec.get("impacto_estimado", ""),
        ]
        for col, value in enumerate(row, start=1):
            cell = wr.cell(row=i + 1, column=col, value=value)
            cell.border = border
            cell.alignment = Alignment(wrap_text=True, vertical="top", horizontal="center" if col == 1 else "left")
        # Columna E: imagen del frame de evidencia (si se puede resolver),
        # si no, el texto original como respaldo.
        evidencia = rec.get("evidencia_visual", "") or ""
        frame_match = re.search(r"frame_\d+", evidencia) if evidencia and evidencia != "null" else None
        frame_img_path = (frame_dir / f"{frame_match.group(0)}.jpg") if frame_match else None
        ev_cell = wr.cell(row=i + 1, column=5, value="")
        ev_cell.border = border
        embedded = False
        if frame_img_path is not None and frame_img_path.exists():
            try:
                from openpyxl.drawing.image import Image as _XLImage

                ev_img = _XLImage(str(frame_img_path))
                target_width = 300
                scale = target_width / max(ev_img.width, 1)
                ev_img.width = target_width
                ev_img.height = int(ev_img.height * scale)
                wr.add_image(ev_img, f"E{i + 1}")
                wr.row_dimensions[i + 1].height = max(60, ev_img.height * 0.75 + 8)
                embedded = True
            except Exception:
                embedded = False
        if not embedded:
            ev_cell.value = evidencia
            ev_cell.alignment = Alignment(wrap_text=True, vertical="top")
            wr.row_dimensions[i + 1].height = 60
    for col, width in enumerate([6, 32, 55, 32, 45], start=1):
        wr.column_dimensions[wr.cell(row=1, column=col).column_letter].width = width
    wr.freeze_panes = "A2"
    if recommendations:
        wr.auto_filter.ref = f"A1:E{len(recommendations) + 1}"

    # ── Hoja 4: Dashboard (gráficas nativas + heatmaps) ──────────────
    wd = wb.create_sheet("Dashboard")
    wd.sheet_properties.pageSetUpPr.fitToPage = True
    wd.sheet_properties.tabColor = "10B981"
    wd.merge_cells("A1:H1")
    wd["A1"] = "SCAPDER  ·  DASHBOARD DEL ANÁLISIS"
    wd["A1"].fill = PatternFill("solid", fgColor=_NAVY)
    wd["A1"].font = Font(bold=True, color="FF6B3D", size=10, name="Calibri")
    wd["A1"].alignment = Alignment(horizontal="left", vertical="center")
    wd.row_dimensions[1].height = 22
    wd.merge_cells("A2:H2")
    wd["A2"] = "Gráficas nativas de Excel vinculadas a la hoja Zonas — se actualizan si editas los valores."
    wd["A2"].font = Font(color="64748B", size=10, italic=True, name="Calibri")
    wd.row_dimensions[2].height = 18
    wd.column_dimensions["A"].width = 30

    def _bar(title: str, y_title: str, color: str = "FF6B3D", multicolor: bool = True):
        chart = BarChart()
        chart.type = "col"
        chart.style = 10  # estilo colorido de Excel
        chart.title = title
        chart.y_axis.title = y_title
        chart.y_axis.numFmt = '#,##0'
        chart.height = 10.5
        chart.width = 17.5
        chart.gapWidth = 70  # barras gruesas, look dashboard
        chart.overlap = 0
        chart.legend = None
        chart.dataLabels = DataLabelList()
        chart.dataLabels.showVal = True
        chart.dataLabels.showCatName = False
        chart.dataLabels.showSerName = False
        if not multicolor:
            _excel_chart_series_color(chart, color)
        return chart

    def _style_chart(chart):
        try:
            chart.y_axis.scaling.min = 0
            chart.y_axis.scaling.max = None
            chart.y_axis.majorGridlines = None
            chart.x_axis.tickLblPos = "low"
        except Exception:
            pass
        return chart

    # Altura 10.5cm ≈ 20 filas + 3 de respiro = 23 para que nunca se encimen.
    _CHART_GAP = 23
    chart_row = 4  # fila de anclaje

    n_zones = len(zones)
    if zones:
        z_last = n_zones + 1
        z_cats = Reference(wz, min_col=1, min_row=2, max_row=z_last)
        zone_visits = _style_chart(_bar("Visitas por zona", "Visitas", "FF6B3D"))
        zone_visits.add_data(Reference(wz, min_col=2, min_row=1, max_row=z_last), titles_from_data=True)
        zone_visits.set_categories(z_cats)
        for s in zone_visits.series:
            _excel_multicolor_points(s, n_zones)
        wd.add_chart(zone_visits, f"A{chart_row}")
        chart_row += _CHART_GAP

        zone_dwell = _style_chart(_bar("Permanencia por zona (s)", "Segundos", "0EA5E9"))
        zone_dwell.add_data(Reference(wz, min_col=4, min_row=1, max_row=z_last), titles_from_data=True)
        zone_dwell.set_categories(z_cats)
        for s in zone_dwell.series:
            _excel_multicolor_points(s, n_zones)
        wd.add_chart(zone_dwell, f"A{chart_row}")
        chart_row += _CHART_GAP

        zone_heat = _style_chart(_bar("Heat index por zona (0-1)", "Heat index", "10B981"))
        zone_heat.y_axis.numFmt = '0.00'
        zone_heat.add_data(Reference(wz, min_col=7, min_row=1, max_row=z_last), titles_from_data=True)
        zone_heat.set_categories(z_cats)
        for s in zone_heat.series:
            _excel_multicolor_points(s, n_zones)
        wd.add_chart(zone_heat, f"A{chart_row}")
        chart_row += _CHART_GAP

        def _pie(title: str, value_col: int):
            pie = PieChart()
            pie.title = title
            pie.style = 10  # rebanadas coloridas
            pie.height = 10.5
            pie.width = 17.5
            try:
                pie.legend.position = "b"  # leyenda abajo: no tapa el título
            except Exception:
                pass
            pie.add_data(Reference(wz, min_col=value_col, min_row=1, max_row=z_last), titles_from_data=True)
            pie.set_categories(z_cats)
            pie.dataLabels = DataLabelList()
            pie.dataLabels.showPercent = True
            pie.dataLabels.showCatName = False
            pie.dataLabels.showLeaderLines = True
            pie.dataLabels.showSerName = False
            for s in pie.series:
                _excel_multicolor_points(s, n_zones)
            return pie

        wd.add_chart(_pie("Distribución de visitas por zona (%)", 2), f"A{chart_row}")
        chart_row += _CHART_GAP
        wd.add_chart(_pie("Distribución de permanencia por zona (%)", 4), f"A{chart_row}")
        chart_row += _CHART_GAP

        doughnut = DoughnutChart()
        doughnut.title = "Interacciones por zona"
        doughnut.style = 10
        doughnut.height = 10.5
        doughnut.width = 17.5
        try:
            doughnut.legend.position = "b"  # leyenda abajo
        except Exception:
            pass
        try:
            doughnut.holeSize = 48  # dona moderna, agujero amplio
        except Exception:
            pass
        doughnut.add_data(Reference(wz, min_col=6, min_row=1, max_row=z_last), titles_from_data=True)
        doughnut.set_categories(z_cats)
        doughnut.dataLabels = DataLabelList()
        doughnut.dataLabels.showPercent = True
        doughnut.dataLabels.showCatName = False
        doughnut.dataLabels.showLeaderLines = True
        for s in doughnut.series:
            _excel_multicolor_points(s, n_zones)
        wd.add_chart(doughnut, f"A{chart_row}")
        chart_row += _CHART_GAP

    # Serie temporal (interacciones o pickups, la que tenga datos)
    histogram = result.get("interaction_histogram") or {}
    hist_label = "Interacciones"
    if not (histogram.get("buckets") or []):
        histogram = result.get("pickup_histogram") or {}
        hist_label = "Pickups"
    buckets = histogram.get("buckets", []) or []
    if buckets:
        wd["J3"] = "Intervalo (s)"
        wd["K3"] = hist_label
        _excel_header_style(wd["J3"])
        _excel_header_style(wd["K3"])
        for i, bucket in enumerate(buckets, start=4):
            wd.cell(row=i, column=10, value=f"{bucket.get('start', '')}-{bucket.get('end', '')}").border = border
            wd.cell(row=i, column=11, value=bucket.get("count", 0)).border = border
        line = LineChart()
        line.style = 10
        line.title = f"{hist_label} en el tiempo"
        line.y_axis.title = "Eventos"
        line.y_axis.numFmt = '#,##0'
        line.add_data(Reference(wd, min_col=11, min_row=3, max_row=3 + len(buckets)), titles_from_data=True)
        line.set_categories(Reference(wd, min_col=10, min_row=4, max_row=3 + len(buckets)))
        line.height = 10.5
        line.width = 17.5
        _excel_chart_series_color(line, "8B5CF6")
        try:
            from openpyxl.chart.marker import DataPointMarker

            for s in line.series:
                s.marker.symbol = "circle"
                s.marker.size = 7
                s.marker.graphicalProperties.solidFill = "8B5CF6"
                s.marker.graphicalProperties.line.solidFill = "FFFFFF"
                s.graphicalProperties.line.width = 32000  # línea gruesa moderna
                s.smooth = True
        except Exception:
            pass
        # Apilado vertical en columna A: antes estaba en J4 y las barras anchas
        # (que llegan hasta la col J) lo tapaban / se encimaban.
        wd.add_chart(line, f"A{chart_row}")
        chart_row += _CHART_GAP
        wd.column_dimensions["J"].width = 18
        wd.column_dimensions["K"].width = 15

    # Heatmaps incrustados como imágenes (solo mapas reales con datos;
    # el pipeline deja placeholders de ~2 KB cuando no hay datos).
    heatmaps_meta = result.get("heatmaps", {}) or {}
    heatmap_labels = [
        ("traffic", "Mapa de tráfico"),
        ("dwell", "Mapa de permanencia"),
        ("interaction", "Mapa de interacciones"),
        ("pickup", "Mapa de pickups"),
    ]
    img_row = chart_row + 1
    wd.merge_cells(f"A{img_row}:H{img_row}")
    wd.cell(row=img_row, column=1, value="MAPAS DE CALOR  ·  VISIÓN COMPUTACIONAL").font = Font(bold=True, size=11, color="FFFFFF", name="Calibri")
    wd.cell(row=img_row, column=1).fill = PatternFill("solid", fgColor=_NAVY)
    wd.cell(row=img_row, column=1).alignment = Alignment(horizontal="left", vertical="center")
    wd.row_dimensions[img_row].height = 20
    img_row += 1
    for key, caption in heatmap_labels:
        fname = heatmaps_meta.get(key)
        if not fname:
            continue
        hmap_path = frame_dir / fname
        if not hmap_path.exists() or hmap_path.stat().st_size < 5120:
            continue
        try:
            wd.cell(row=img_row, column=1, value=caption).font = Font(bold=True, color=_ACCENT)
            img = XLImage(str(hmap_path))
            scale = 520 / max(img.width, 1)
            img.width = 520
            img.height = int(img.height * scale)
            wd.add_image(img, f"A{img_row + 1}")
            img_row += max(18, int(img.height / 15) + 3)
        except Exception:
            continue

    # Nota de privacidad
    wd.cell(row=img_row + 1, column=1, value="Privacidad por diseño: sin biometría ni reconocimiento facial. Ley 1581 de 2012 (Colombia).").font = Font(size=8, color="7D8392")

    for sheet in (ws, wz, wr, wd):
        sheet.sheet_properties.pageSetUpPr.fitToPage = True

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    safe_filename = f"recomendaciones_{analysis_id[:8]}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


# =========================================================
# EXPORTAR INSIGHTS + MÉTRICAS COMO PDF (.pdf)
# =========================================================


@router.get("/{analysis_id}/insights/export-pdf")
def export_insights_pdf(
    analysis_id: str,
    user: User = Depends(user_from_query_token),
    database: Session = Depends(get_db),
):
    """Descarga recomendaciones + métricas como PDF (.pdf) con gráficas y tablas.
    Si aún no se han generado los insights, devuelve 409.
    """
    analysis = database.get(Analysis, analysis_id)
    site = database.get(Site, analysis.site_id) if analysis else None
    if not analysis or not can_access(user, site):
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    if not analysis.insights:
        raise HTTPException(
            status_code=409,
            detail="Genera las recomendaciones primero antes de exportar",
        )

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import Image as RLImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="reportlab no está instalado. Agrega 'reportlab' a requirements.txt y reinicia el servidor.",
        )

    insights = analysis.insights or {}
    result = analysis.result or {}
    video = result.get("video", {}) or {}
    metrics = result.get("metrics", {}) or {}
    zones = result.get("zones", []) or []
    recommendations = insights.get("recomendaciones", []) or []
    heatmaps_meta = result.get("heatmaps", {}) or {}
    frame_dir = RESULT_DIR / analysis_id
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    ACCENT = colors.HexColor("#FF6B3D")
    NAVY = colors.HexColor("#0F172A")
    DARK = colors.HexColor("#0F172A")
    GRAY = colors.HexColor("#64748B")
    LIGHT = colors.HexColor("#F8FAFC")
    PALETTE = ["#FF6B3D", "#0EA5E9", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899"]

    def _chart_png(kind: str, labels: list, values: list, title: str, xlabel: str = "", color: str = "#FF6B3D"):
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            import numpy as np
            plt.rcParams.update({
                "font.family": "DejaVu Sans",
                "axes.facecolor": "#FFFFFF", "figure.facecolor": "#FFFFFF",
                "axes.edgecolor": "#CBD5E1", "axes.grid": True,
                "grid.color": "#E2E8F0", "grid.linewidth": 0.7, "grid.alpha": 0.9,
                "axes.axisbelow": True,
            })
        except ImportError:
            return None
        try:
            if kind == "pie" and not any(values or []):
                return None
            if kind == "bar":
                n = max(len(labels), 1)
                fig, ax = plt.subplots(figsize=(6.8, max(3.2, 0.62 * n)))
                y = np.arange(n)
                bars = ax.barh(y, values, height=0.55, color=color, edgecolor="white", linewidth=1.2, zorder=3)
                ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=9, color="#334155")
                ax.set_xlabel(xlabel, fontsize=9, color="#64748B")
                ax.set_title(title, fontweight="bold", fontsize=12, color="#0F172A", pad=12, loc="left")
                ax.invert_yaxis()
                ax.tick_params(axis="x", labelsize=8, colors="#64748B")
                for s in ("top", "right"):
                    ax.spines[s].set_visible(False)
                vmax = max(list(values) + [0]) or 1
                ax.set_xlim(0, vmax * 1.18)
                try:
                    ax.bar_label(bars, fmt="%.1f" if any(isinstance(v, float) for v in values) else "%d",
                                 fontsize=8, color="#0F172A", padding=4)
                except Exception:
                    pass
            else:
                fig, ax = plt.subplots(figsize=(6.8, 3.8))
                clrs = [PALETTE[i % len(PALETTE)] for i in range(len(labels))]
                wedges, _, autotexts = ax.pie(
                    values, autopct=lambda p: f"{p:.1f}%" if p >= 4 else "",
                    startangle=90, counterclock=False, colors=clrs,
                    wedgeprops=dict(width=0.46, edgecolor="white", linewidth=2),
                    pctdistance=0.80, textprops=dict(fontsize=8, color="#0F172A", weight="bold"))
                for t in autotexts:
                    t.set_bbox(dict(boxstyle="round,pad=0.25", fc="white", ec="#E2E8F0", alpha=0.95))
                ax.set_title(title, fontweight="bold", fontsize=12, color="#0F172A", pad=12, loc="left")
                ax.axis("equal")
                ax.legend(wedges, labels, loc="center left", bbox_to_anchor=(1.0, 0.5),
                          fontsize=8, frameon=True, facecolor="white", edgecolor="#E2E8F0")
            fig.tight_layout()
            buf = BytesIO()
            fig.savefig(buf, format="png", dpi=200, bbox_inches="tight")
            plt.close(fig)
            buf.seek(0)
            return buf
        except Exception:
            return None

    def _scaled_image(source, max_width: float):
        """Crea una imagen reportlab escalada al ancho dado (path o BytesIO)."""
        try:
            from PIL import Image as PILImage
        except ImportError:
            return None
        try:
            if isinstance(source, (str, Path)):
                pil = PILImage.open(source)
            else:
                pos = source.tell()
                pil = PILImage.open(source)
                source.seek(pos)
            w, h = pil.size
            scale = max_width / max(w, 1)
            if isinstance(source, (str, Path)):
                return RLImage(str(source), width=max_width, height=h * scale)
            return RLImage(source, width=max_width, height=h * scale)
        except Exception:
            return None

    def _styled_table(headers: list[str], rows_data: list[list], col_widths: list | None = None):
        table = Table([headers] + rows_data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("LEADING", (0, 0), (-1, -1), 11),
            ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ]))
        return table

    def _section_bar():
        bar = Table([[" "]], colWidths=[2.2 * cm])
        bar.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), ACCENT),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
        return bar

    def _header_footer(canvas, doc_obj):
        canvas.saveState()
        canvas.setStrokeColor(ACCENT); canvas.setLineWidth(2)
        canvas.line(doc_obj.leftMargin, doc_obj.height + doc_obj.topMargin + 6,
                    doc_obj.width + doc_obj.leftMargin, doc_obj.height + doc_obj.topMargin + 6)
        canvas.setFont("Helvetica-Bold", 7); canvas.setFillColor(GRAY)
        canvas.drawString(doc_obj.leftMargin, doc_obj.height + doc_obj.topMargin + 12, "SCAPDER  ·  SPACE INTELLIGENCE")
        canvas.setFont("Helvetica", 7)
        canvas.drawRightString(doc_obj.width + doc_obj.leftMargin, 1.2 * cm, f"Página {doc_obj.page}")
        canvas.setFont("Helvetica", 6.5)
        canvas.drawCentredString(doc_obj.width / 2 + doc_obj.leftMargin, 0.8 * cm,
                                 "Confidencial  ·  Sin biometría  ·  Ley 1581 de 2012 (Colombia)")
        canvas.restoreState()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm, topMargin=2.2 * cm, bottomMargin=1.8 * cm,
        title="Recomendaciones de Space Management", author="Scapder",
    )
    styles = getSampleStyleSheet()
    eyebrow_style = ParagraphStyle("Eyebrow", parent=styles["Normal"], fontName="Helvetica-Bold",
                                   fontSize=8, textColor=ACCENT, spaceAfter=2)
    title_style = ParagraphStyle("Title2", parent=styles["Title"], fontName="Helvetica-Bold", textColor=colors.white, fontSize=24, leading=28, alignment=0)
    cover_sub = ParagraphStyle("CoverSub", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#CBD5E1"))
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", textColor=NAVY, fontSize=13, leading=16, spaceBefore=12, spaceAfter=2)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", textColor=NAVY, fontSize=11, leading=14, spaceBefore=8, spaceAfter=3)
    body = ParagraphStyle("Body2", parent=styles["Normal"], fontSize=9.5, leading=13.5, textColor=colors.HexColor("#1E293B"))
    callout_style = ParagraphStyle("Callout", parent=body, fontName="Helvetica-Oblique", fontSize=10, leading=14, textColor=NAVY)
    caption_style = ParagraphStyle("Caption2", parent=styles["Normal"], fontSize=7.5, textColor=GRAY, alignment=1, spaceBefore=2, spaceAfter=6)
    footer_style = ParagraphStyle("Footer2", parent=styles["Normal"], fontSize=7.5, textColor=GRAY)

    site_name_pdf = site.name if site else result.get("site", {}).get("name", "Tienda")
    story = []
    # Portada navy
    cover_tbl = Table([
        [Paragraph("SCAPDER  ·  INTELIGENCIA ESPACIAL EN TIENDA", eyebrow_style)],
        [Paragraph("Recomendaciones de<br/>Space Management", title_style)],
        [Paragraph(f"{site_name_pdf} &nbsp;·&nbsp; {generated_at} &nbsp;·&nbsp; Modo {result.get('analysis_mode', '')} &nbsp;·&nbsp; ID {analysis_id[:8]}", cover_sub)],
    ], colWidths=[17 * cm])
    cover_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, 0), 12),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
        ("LINEBELOW", (0, -1), (-1, -1), 3, ACCENT),
    ]))
    story.append(cover_tbl)
    story.append(Spacer(1, 0.4 * cm))
    # Mini KPIs en una fila
    kpi_data = [[
        Paragraph(f"<b><font size=13 color='#0F172A'>{metrics.get('people_detected', metrics.get('tracked_presences', '—'))}</font></b><br/><font size=7 color='#64748B'>PERSONAS</font>", body),
        Paragraph(f"<b><font size=13 color='#0F172A'>{metrics.get('interaction_events', '—')}</font></b><br/><font size=7 color='#64748B'>INTERACCIONES</font>", body),
        Paragraph(f"<b><font size=13 color='#0F172A'>{metrics.get('pickup_events', '—')}</font></b><br/><font size=7 color='#64748B'>PICKUPS</font>", body),
        Paragraph(f"<b><font size=13 color='#0F172A'>{len(zones)}</font></b><br/><font size=7 color='#64748B'>ZONAS</font>", body),
    ]]
    kpi_tbl = Table(kpi_data, colWidths=[4.25 * cm] * 4)
    kpi_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#E2E8F0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(kpi_tbl)
    story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph("Ficha del análisis", h1))
    story.append(_section_bar())
    story.append(_styled_table(["Campo", "Valor"], [
        ["ID del análisis", analysis_id],
        ["Sede", site_name_pdf],
        ["Modo de análisis", str(result.get("analysis_mode", ""))],
        ["Duración del video (s)", str(video.get("duration_seconds", ""))],
        ["Personas detectadas", str(metrics.get("people_detected", metrics.get("tracked_presences", "")))],
        ["Eventos de interacción", str(metrics.get("interaction_events", ""))],
        ["Eventos de pickup", str(metrics.get("pickup_events", ""))],
        ["Zonas analizadas", str(len(zones))],
    ], col_widths=[5 * cm, 12 * cm]))

    story.append(Paragraph("01 &nbsp;·&nbsp; Hallazgo principal", h1))
    story.append(_section_bar())
    callout_tbl = Table([[Paragraph(insights.get("hallazgo_principal", ""), callout_style)]], colWidths=[17 * cm])
    callout_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF7ED")),
        ("BOX", (0, 0), (-1, -1), 1, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(callout_tbl)
    story.append(Paragraph("02 &nbsp;·&nbsp; Resumen ejecutivo", h1))
    story.append(_section_bar())
    story.append(Paragraph(insights.get("resumen_ejecutivo", ""), body))

    story.append(Paragraph("03 &nbsp;·&nbsp; Recomendaciones accionables", h1))
    story.append(_section_bar())
    for i, rec in enumerate(recommendations, start=1):
        story.append(Paragraph(f"3.{i} {rec.get('titulo', '')}", h2))
        story.append(Paragraph(f"<b>Justificación:</b> {rec.get('justificacion', '')}", body))
        story.append(Paragraph(f"<b>Impacto estimado:</b> {rec.get('impacto_estimado', '')}", body))
        evidencia = rec.get("evidencia_visual", "") or ""
        frame_match = re.search(r"frame_\d+", evidencia) if evidencia and evidencia != "null" else None
        frame_path = (frame_dir / f"{frame_match.group(0)}.jpg") if frame_match else None
        if frame_path is not None and frame_path.exists():
            img = _scaled_image(frame_path, 12 * cm)
            if img is not None:
                story.append(Spacer(1, 0.2 * cm))
                story.append(img)
                story.append(Paragraph(f"Figura 3.{i} — {frame_match.group(0)}", caption_style))
        elif evidencia and evidencia != "null":
            story.append(Paragraph(f"📷 {evidencia}", body))

    if zones:
        story.append(Paragraph("04 &nbsp;·&nbsp; Métricas por zona", h1))
        story.append(_section_bar())
        story.append(Paragraph("Detalle medido por zona. Las gráficas siguientes comparan estos valores.", body))
        story.append(_styled_table(
            ["Zona", "Visitas", "Permanencia (s)", "Interacc.", "Heat", "Clasif."],
            [[z.get("name", z.get("zone_id", "")), z.get("visits", 0),
              round(float(z.get("dwell_seconds", 0) or 0), 1), z.get("interactions", 0),
              z.get("heat_index", 0), z.get("classification", "")] for z in zones],
        ))
        story.append(Paragraph("05 &nbsp;·&nbsp; Gráficas de zonas", h1))
        story.append(_section_bar())
        story.append(Paragraph("Barras con valores y donas con distribución porcentual.", body))
        zone_names = [z.get("name", z.get("zone_id", "")) for z in zones]
        graphics = [
            ("bar", [z.get("visits", 0) for z in zones], "Visitas por zona", "Visitas", "#FF6B3D"),
            ("bar", [round(float(z.get("dwell_seconds", 0) or 0), 1) for z in zones], "Permanencia por zona (s)", "Segundos", "#0EA5E9"),
            ("bar", [z.get("heat_index", 0) for z in zones], "Heat index por zona (0-1)", "Heat index", "#10B981"),
            ("pie", [z.get("visits", 0) for z in zones], "Distribución de visitas por zona (%)", "", "#FF6B3D"),
            ("pie", [round(float(z.get("dwell_seconds", 0) or 0), 1) for z in zones], "Distribución de permanencia por zona (%)", "", "#0EA5E9"),
        ]
        for idx, (kind, values, title, xlabel, color) in enumerate(graphics, start=1):
            buf = _chart_png(kind, zone_names, values, title, xlabel, color)
            if buf is None:
                continue
            img = _scaled_image(buf, 14 * cm)
            if img is not None:
                img.hAlign = "CENTER"
                story.append(Spacer(1, 0.2 * cm))
                story.append(img)
                story.append(Paragraph(f"Figura 5.{idx} — {title}", caption_style))

    heatmap_labels = [
        ("traffic", "Mapa de tráfico"), ("dwell", "Mapa de permanencia"),
        ("interaction", "Mapa de interacciones"), ("pickup", "Mapa de pickups"),
    ]
    real_heatmaps = []
    for key, caption in heatmap_labels:
        fname = heatmaps_meta.get(key)
        if not fname:
            continue
        hmap_path = frame_dir / fname
        if hmap_path.exists() and hmap_path.stat().st_size >= 5120:
            real_heatmaps.append((hmap_path, caption))
    if real_heatmaps:
        story.append(Paragraph("06 &nbsp;·&nbsp; Mapas de calor", h1))
        story.append(_section_bar())
        story.append(Paragraph(
            "Mapas generados automáticamente por visión computacional (YOLO + ByteTrack) con datos reales del video. Se omiten placeholders sin datos.", body))
        for hmap_path, caption in real_heatmaps:
            img = _scaled_image(hmap_path, 14 * cm)
            if img is not None:
                img.hAlign = "CENTER"
                story.append(Spacer(1, 0.2 * cm))
                story.append(img)
                story.append(Paragraph(caption, caption_style))

    story.append(Spacer(1, 0.5 * cm))
    closing = Table([[Paragraph(
        "Privacidad por diseño: sin biometría, sin reconocimiento facial, sin atributos personales. "
        "Cumple Ley 1581 de 2012 (Colombia). IDs de rastreo temporales, no persistidos.", footer_style)]], colWidths=[17 * cm])
    closing.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(closing)

    doc.build(story, onFirstPage=_header_footer, onLaterPages=_header_footer)
    buffer.seek(0)

    safe_filename = f"recomendaciones_{analysis_id[:8]}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )
