from __future__ import annotations

import json
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

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
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


@router.post("/{analysis_id}/insights")
def create_insights(
    analysis_id: str,
    regenerate: bool = False,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
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

    def _shade(cell, color: str) -> None:
        shading = OxmlElement("w:shd")
        shading.set(qn("w:val"), "clear")
        shading.set(qn("w:fill"), color)
        cell._tc.get_or_add_tcPr().append(shading)

    def _styled_table(headers: list[str], rows_data: list[list]) -> None:
        table = doc.add_table(rows=1, cols=len(headers))
        table.style = "Table Grid"
        for cell, text in zip(table.rows[0].cells, headers):
            cell.text = str(text)
            cell.paragraphs[0].runs[0].bold = True
            cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            _shade(cell, "FF6B3D")
        for row_data in rows_data:
            for cell, value in zip(table.add_row().cells, row_data):
                cell.text = str(value)
        doc.add_paragraph()

    def _caption(text: str) -> None:
        para = doc.add_paragraph(text)
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = para.runs[0]
        run.italic = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0x7D, 0x83, 0x92)

    def _zone_chart(labels: list, values: list, title: str, xlabel: str, color: str = "#FF6B3D"):
        """Genera una gráfica de barras horizontales como PNG en memoria (o None si falla)."""
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
        except ImportError:
            return None
        try:
            fig, ax = plt.subplots(figsize=(7, max(2.8, 0.5 * len(labels))))
            ax.barh(labels, values, color=color)
            ax.set_xlabel(xlabel)
            ax.set_title(title, fontweight="bold")
            ax.invert_yaxis()
            fig.tight_layout()
            buf = BytesIO()
            fig.savefig(buf, format="png", dpi=150)
            plt.close(fig)
            buf.seek(0)
            return buf
        except Exception:
            return None

    def _zone_pie(labels: list, values: list, title: str):
        """Genera una gráfica de torta con porcentajes como PNG en memoria (o None si falla)."""
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
        except ImportError:
            return None
        try:
            if not any(values):
                return None
            fig, ax = plt.subplots(figsize=(6, 4))
            ax.pie(values, labels=labels, autopct="%1.1f%%", startangle=90)
            ax.set_title(title, fontweight="bold")
            ax.axis("equal")
            fig.tight_layout()
            buf = BytesIO()
            fig.savefig(buf, format="png", dpi=150)
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

    # Tipografía del documento
    doc.styles["Normal"].font.name = "Segoe UI"
    doc.styles["Normal"].font.size = Pt(10.5)
    for _level in (1, 2):
        _hs = doc.styles[f"Heading {_level}"]
        _hs.font.name = "Segoe UI"
        _hs.font.color.rgb = RGBColor(0x15, 0x13, 0x23)
    doc.styles["Title"].font.name = "Georgia"
    doc.styles["Title"].font.size = Pt(26)
    doc.styles["Title"].font.bold = True
    doc.styles["Title"].font.color.rgb = RGBColor(0x15, 0x13, 0x23)

    # Título principal (sin nombre de sede)
    title = doc.add_heading("Recomendaciones de Space Management", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    subtitle = doc.add_paragraph(f"Generado por Scapder · {generated_at}")
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Ficha del análisis
    doc.add_heading("Ficha del análisis", level=1)
    _styled_table(
        ["Campo", "Valor"],
        [
        ["ID del análisis", analysis_id],
            ["Modo de análisis", result.get("analysis_mode", "")],
            ["Duración del video (s)", video.get("duration_seconds", "")],
            ["Personas detectadas", metrics.get("people_detected", metrics.get("tracked_presences", ""))],
            ["Eventos de interacción", metrics.get("interaction_events", "")],
            ["Eventos de pickup", metrics.get("pickup_events", "")],
            ["Zonas analizadas", len(zones_data)],
        ],
    )

    # Hallazgo principal
    doc.add_heading("1. Hallazgo principal", level=1)
    doc.add_paragraph(insights.get("hallazgo_principal", ""))

    # Resumen ejecutivo
    doc.add_heading("2. Resumen ejecutivo", level=1)
    doc.add_paragraph(insights.get("resumen_ejecutivo", ""))

    # Recomendaciones
    doc.add_heading("3. Recomendaciones accionables", level=1)
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
        doc.add_heading("4. Métricas por zona", level=1)
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
            ([round(float(z.get("dwell_seconds", 0) or 0), 1) for z in zones_data], "Permanencia por zona (s)", "Segundos", "#2D9CDB"),
            ([z.get("heat_index", 0) for z in zones_data], "Heat index por zona (0-1)", "Heat index", "#27AE60"),
        ]
        doc.add_heading("5. Gráficas de zonas", level=1)
        doc.add_paragraph(
            "Comparativa visual de las zonas a partir de los datos medidos por visión computacional."
        )
        for values, title, xlabel, color in zone_graphics:
            buf = _zone_chart(zone_names, values, title, xlabel, color)
            if buf is None:
                continue
            doc.add_picture(buf, width=Inches(5.5))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            _caption(title)
            doc.add_paragraph()
        zone_pies = [
            ([z.get("visits", 0) for z in zones_data], "Distribución de visitas por zona (%)"),
            ([round(float(z.get("dwell_seconds", 0) or 0), 1) for z in zones_data], "Distribución de permanencia por zona (%)"),
        ]
        for values, title in zone_pies:
            buf = _zone_pie(zone_names, values, title)
            if buf is None:
                continue
            doc.add_picture(buf, width=Inches(5.0))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            _caption(title)
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
        doc.add_heading("6. Mapas de calor", level=1)
        doc.add_paragraph(
            "Los siguientes mapas de calor son generados automáticamente por el sistema de visión "
            "computacional (YOLO + ByteTrack). Reflejan datos reales del video analizado."
        )
        for hmap_path, caption in real_heatmaps:
            try:
                doc.add_picture(str(hmap_path), width=Inches(5.5))
                doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                _caption(caption)
                doc.add_paragraph()
            except Exception:
                pass

    # Pie de página de privacidad
    doc.add_paragraph()
    footer_para = doc.add_paragraph(
        "Privacidad por diseño: sin biometría, sin reconocimiento facial, sin atributos personales. "
        "Cumple Ley 1581 de 2012 (Colombia). IDs de rastreo son temporales y no se persisten."
    )
    footer_para.runs[0].font.size = Pt(8)

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
_DARK = "151323"
_LIGHT_BG = "FFF7F2"


def _excel_header_style(cell) -> None:
    from openpyxl.styles import Alignment, Font, PatternFill

    cell.fill = PatternFill("solid", fgColor=_ACCENT)
    cell.font = Font(bold=True, color="FFFFFF", size=11)
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def _excel_title_style(cell, size: int = 16) -> None:
    from openpyxl.styles import Font

    cell.font = Font(bold=True, color=_DARK, size=size)


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

    thin = Side(style="thin", color="E5E7EE")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    wb = Workbook()

    # ── Hoja 1: Resumen ──────────────────────────────────────────────
    ws = wb.active
    ws.title = "Resumen"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws["A1"] = "Recomendaciones de Space Management"
    _excel_title_style(ws["A1"])
    ws["A2"] = f"Scapder · Inteligencia espacial  |  Generado: {generated_at}"
    ws["A2"].font = Font(color="7D8392", size=10)

    def _kpi_table(start_row: int, title: str, rows: list) -> int:
        ws.cell(row=start_row, column=1, value=title).font = Font(bold=True, size=13, color=_DARK)
        header_row = start_row + 1
        ws.cell(row=header_row, column=1, value="Indicador")
        ws.cell(row=header_row, column=2, value="Valor")
        _excel_header_style(ws.cell(row=header_row, column=1))
        _excel_header_style(ws.cell(row=header_row, column=2))
        for i, (label, value) in enumerate(rows, start=header_row + 1):
            label_cell = ws.cell(row=i, column=1, value=label)
            label_cell.border = border
            label_cell.font = Font(bold=True, color="29263D")
            value_cell = ws.cell(row=i, column=2, value=value)
            value_cell.border = border
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

    ws.cell(row=next_row + 3, column=1, value="3. Resumen ejecutivo").font = Font(bold=True, size=13, color=_DARK)
    ws.cell(row=next_row + 4, column=1, value=insights.get("resumen_ejecutivo", "")).alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(f"A{next_row + 4}:B{next_row + 4}")
    ws.row_dimensions[next_row + 4].height = 45

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
    z_headers = ["Zona", "Visitas", "Densidad (vis/min)", "Permanencia (s)", "Dwell prom. (s)", "Interacciones", "Heat index", "Clasificación"]
    for col, header in enumerate(z_headers, start=1):
        cell = wz.cell(row=1, column=col, value=header)
        _excel_header_style(cell)
        cell.border = border
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
        for col, value in enumerate(values, start=1):
            cell = wz.cell(row=r, column=col, value=value)
            cell.border = border
            if col > 1:
                cell.alignment = Alignment(horizontal="center")
    for col, width in enumerate([24, 12, 18, 17, 16, 15, 12, 15], start=1):
        wz.column_dimensions[wz.cell(row=1, column=col).column_letter].width = width
    wz.freeze_panes = "A2"
    if zones:
        wz.auto_filter.ref = f"A1:H{len(zones) + 1}"

    # ── Hoja 3: Recomendaciones ──────────────────────────────────────
    wr = wb.create_sheet("Recomendaciones")
    wr.sheet_properties.pageSetUpPr.fitToPage = True
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
    wd["A1"] = "Dashboard"
    _excel_title_style(wd["A1"])
    wd["A2"] = "Gráficas nativas de Excel con los datos de la hoja Zonas (se actualizan si editas los valores)."
    wd["A2"].font = Font(color="7D8392", size=10, italic=True)
    wd.column_dimensions["A"].width = 30

    def _bar(title: str, y_title: str):
        chart = BarChart()
        chart.type = "col"
        chart.style = 10
        chart.title = title
        chart.y_axis.title = y_title
        chart.height = 7.5
        chart.width = 15
        return chart

    chart_row = 4  # fila de anclaje; cada gráfica ocupa ~15 filas

    n_zones = len(zones)
    if zones:
        z_last = n_zones + 1
        z_cats = Reference(wz, min_col=1, min_row=2, max_row=z_last)
        zone_visits = _bar("Visitas por zona", "Visitas")
        zone_visits.add_data(Reference(wz, min_col=2, min_row=1, max_row=z_last), titles_from_data=True)
        zone_visits.set_categories(z_cats)
        wd.add_chart(zone_visits, f"A{chart_row}")
        chart_row += 15

        zone_dwell = _bar("Permanencia por zona (s)", "Segundos")
        zone_dwell.add_data(Reference(wz, min_col=4, min_row=1, max_row=z_last), titles_from_data=True)
        zone_dwell.set_categories(z_cats)
        wd.add_chart(zone_dwell, f"A{chart_row}")
        chart_row += 15

        zone_heat = _bar("Heat index por zona (0-1)", "Heat index")
        zone_heat.add_data(Reference(wz, min_col=7, min_row=1, max_row=z_last), titles_from_data=True)
        zone_heat.set_categories(z_cats)
        wd.add_chart(zone_heat, f"A{chart_row}")
        chart_row += 15

        def _pie(title: str, value_col: int):
            pie = PieChart()
            pie.title = title
            pie.style = 10
            pie.height = 7.5
            pie.width = 14
            pie.add_data(Reference(wz, min_col=value_col, min_row=1, max_row=z_last), titles_from_data=True)
            pie.set_categories(z_cats)
            pie.dataLabels = DataLabelList()
            pie.dataLabels.showPercent = True
            return pie

        wd.add_chart(_pie("Distribución de visitas por zona (%)", 2), f"A{chart_row}")
        chart_row += 15
        wd.add_chart(_pie("Distribución de permanencia por zona (%)", 4), f"A{chart_row}")
        chart_row += 15

        doughnut = DoughnutChart()
        doughnut.title = "Interacciones por zona"
        doughnut.style = 10
        doughnut.height = 7.5
        doughnut.width = 14
        doughnut.add_data(Reference(wz, min_col=6, min_row=1, max_row=z_last), titles_from_data=True)
        doughnut.set_categories(z_cats)
        doughnut.dataLabels = DataLabelList()
        doughnut.dataLabels.showPercent = True
        wd.add_chart(doughnut, f"A{chart_row}")
        chart_row += 15

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
        line.add_data(Reference(wd, min_col=11, min_row=3, max_row=3 + len(buckets)), titles_from_data=True)
        line.set_categories(Reference(wd, min_col=10, min_row=4, max_row=3 + len(buckets)))
        line.height = 7.5
        line.width = 14
        wd.add_chart(line, "J4")
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
    wd.cell(row=img_row, column=1, value="Mapas de calor (visión computacional)").font = Font(bold=True, size=13, color=_DARK)
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
    DARK = colors.HexColor("#151323")
    GRAY = colors.HexColor("#7D8392")

    def _chart_png(kind: str, labels: list, values: list, title: str, xlabel: str = "", color: str = "#FF6B3D"):
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
        except ImportError:
            return None
        try:
            if kind == "pie" and not any(values):
                return None
            fig, ax = plt.subplots(figsize=(6.5, 3.8))
            if kind == "bar":
                ax.barh(labels, values, color=color)
                ax.set_xlabel(xlabel)
                ax.invert_yaxis()
            else:
                ax.pie(values, labels=labels, autopct="%1.1f%%", startangle=90)
                ax.axis("equal")
            ax.set_title(title, fontweight="bold")
            fig.tight_layout()
            buf = BytesIO()
            fig.savefig(buf, format="png", dpi=150)
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
            ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EE")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FFF7F2")]),
        ]))
        return table

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
        title="Recomendaciones de Space Management", author="Scapder",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title2", parent=styles["Title"], fontName="Helvetica-Bold", textColor=DARK, fontSize=22, alignment=1)
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", textColor=DARK, fontSize=14, spaceBefore=14, spaceAfter=6)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", textColor=DARK, fontSize=12, spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("Body2", parent=styles["Normal"], fontSize=10, leading=14)
    caption_style = ParagraphStyle("Caption2", parent=styles["Normal"], fontSize=8, textColor=GRAY, alignment=1)
    footer_style = ParagraphStyle("Footer2", parent=styles["Normal"], fontSize=8, textColor=GRAY)

    story = []
    story.append(Paragraph("Recomendaciones de Space Management", title_style))
    story.append(Paragraph(f"Generado por Scapder · {generated_at}", caption_style))
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph("Ficha del análisis", h1))
    story.append(_styled_table(["Campo", "Valor"], [
        ["ID del análisis", analysis_id],
        ["Modo de análisis", str(result.get("analysis_mode", ""))],
        ["Duración del video (s)", str(video.get("duration_seconds", ""))],
        ["Personas detectadas", str(metrics.get("people_detected", metrics.get("tracked_presences", "")))],
        ["Eventos de interacción", str(metrics.get("interaction_events", ""))],
        ["Eventos de pickup", str(metrics.get("pickup_events", ""))],
        ["Zonas analizadas", str(len(zones))],
    ], col_widths=[5 * cm, 10 * cm]))

    story.append(Paragraph("1. Hallazgo principal", h1))
    story.append(Paragraph(insights.get("hallazgo_principal", ""), body))
    story.append(Paragraph("2. Resumen ejecutivo", h1))
    story.append(Paragraph(insights.get("resumen_ejecutivo", ""), body))

    story.append(Paragraph("3. Recomendaciones accionables", h1))
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
        story.append(Paragraph("4. Métricas por zona", h1))
        story.append(_styled_table(
            ["Zona", "Visitas", "Permanencia (s)", "Interacc.", "Heat", "Clasif."],
            [[z.get("name", z.get("zone_id", "")), z.get("visits", 0),
              round(float(z.get("dwell_seconds", 0) or 0), 1), z.get("interactions", 0),
              z.get("heat_index", 0), z.get("classification", "")] for z in zones],
        ))
        story.append(Paragraph("5. Gráficas de zonas", h1))
        zone_names = [z.get("name", z.get("zone_id", "")) for z in zones]
        graphics = [
            ("bar", [z.get("visits", 0) for z in zones], "Visitas por zona", "Visitas", "#FF6B3D"),
            ("bar", [round(float(z.get("dwell_seconds", 0) or 0), 1) for z in zones], "Permanencia por zona (s)", "Segundos", "#2D9CDB"),
            ("bar", [z.get("heat_index", 0) for z in zones], "Heat index por zona (0-1)", "Heat index", "#27AE60"),
            ("pie", [z.get("visits", 0) for z in zones], "Distribución de visitas por zona (%)", "", "#FF6B3D"),
            ("pie", [round(float(z.get("dwell_seconds", 0) or 0), 1) for z in zones], "Distribución de permanencia por zona (%)", "", "#2D9CDB"),
        ]
        for kind, values, title, xlabel, color in graphics:
            buf = _chart_png(kind, zone_names, values, title, xlabel, color)
            if buf is None:
                continue
            img = _scaled_image(buf, 13 * cm)
            if img is not None:
                story.append(img)
                story.append(Paragraph(title, caption_style))

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
        story.append(Paragraph("6. Mapas de calor", h1))
        story.append(Paragraph(
            "Mapas generados automáticamente por visión computacional (YOLO + ByteTrack) con datos reales del video.", body))
        for hmap_path, caption in real_heatmaps:
            img = _scaled_image(hmap_path, 13 * cm)
            if img is not None:
                story.append(img)
                story.append(Paragraph(caption, caption_style))

    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(
        "Privacidad por diseño: sin biometría, sin reconocimiento facial, sin atributos personales. "
        "Cumple Ley 1581 de 2012 (Colombia). IDs de rastreo son temporales y no se persisten.", footer_style))

    doc.build(story)
    buffer.seek(0)

    safe_filename = f"recomendaciones_{analysis_id[:8]}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )