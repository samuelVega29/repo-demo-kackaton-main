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
        from docx.shared import Inches, Pt
        from docx.enum.text import WD_ALIGN_PARAGRAPH
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="python-docx no está instalado. Agrega 'python-docx' a requirements.txt y reinicia el servidor.",
        )

    insights = analysis.insights
    frame_dir = RESULT_DIR / analysis_id
    site_name = site.name if site else "Tienda"

    doc = Document()

    # Título principal
    title = doc.add_heading(f"Recomendaciones de Space Management — {site_name}", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph(
        f"Análisis ID: {analysis_id}  |  Generado por Scapder · Góndola Inteligente"
    ).alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_paragraph()  # espacio

    # Hallazgo principal
    doc.add_heading("Hallazgo principal", level=1)
    doc.add_paragraph(insights.get("hallazgo_principal", ""))

    # Resumen ejecutivo
    doc.add_heading("Resumen ejecutivo", level=1)
    doc.add_paragraph(insights.get("resumen_ejecutivo", ""))

    # Recomendaciones
    doc.add_heading("Recomendaciones accionables", level=1)
    for i, rec in enumerate(insights.get("recomendaciones", []), start=1):
        doc.add_heading(f"{i}. {rec.get('titulo', '')}", level=2)

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

            # Extraer nombre de frame de la cadena (ej. "frame_2: cliente...")
            frame_name = evidencia.split(":")[0].strip()  # "frame_2"
            frame_path = frame_dir / f"{frame_name}.jpg"
            if frame_path.exists():
                try:
                    doc.add_picture(str(frame_path), width=Inches(4.5))
                    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                except Exception:
                    pass  # Si la imagen falla, seguimos sin ella

        doc.add_paragraph()  # separador entre recomendaciones

    # ── Sección de gráficas / heatmaps ──────────────────────────────────────
    heatmap_labels = [
        ("traffic.png", "Mapa de tráfico (densidad de visitas por góndola)"),
        ("dwell.png", "Mapa de permanencia (segundos acumulados por zona)"),
        ("interaction.png", "Mapa de interacciones (eventos pick-up / put-back)"),
        ("pickup.png", "Mapa de recogidas (pickup) por zona"),
    ]
    any_heatmap = any((frame_dir / fn).exists() for fn, _ in heatmap_labels)
    if any_heatmap:
        doc.add_heading("Gráficas de métricas espaciales", level=1)
        doc.add_paragraph(
            "Los siguientes mapas de calor son generados automáticamente por el sistema de visión "
            "computacional (YOLO + ByteTrack). Reflejan datos reales del video analizado."
        )
        for fname, caption in heatmap_labels:
            hmap_path = frame_dir / fname
            if hmap_path.exists():
                try:
                    doc.add_paragraph(caption).runs[0].bold = True
                    doc.add_picture(str(hmap_path), width=Inches(5.5))
                    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    doc.add_paragraph()
                except Exception:
                    pass

    # ── Tabla de métricas por góndola ────────────────────────────────────────
    gondolas_data = analysis.result.get("gondolas", []) if analysis.result else []
    if gondolas_data:
        doc.add_heading("Métricas por góndola", level=1)
        table = doc.add_table(rows=1, cols=4)
        table.style = "Table Grid"
        hdr = table.rows[0].cells
        for cell, text in zip(hdr, ["Góndola", "Tráfico (visitas)", "Permanencia (seg)", "Interacciones"]):
            cell.text = text
            cell.paragraphs[0].runs[0].bold = True
        for g in gondolas_data:
            row = table.add_row().cells
            row[0].text = str(g.get("name", ""))
            row[1].text = str(g.get("traffic", g.get("visitors", 0)))
            row[2].text = str(round(float(g.get("dwell_seconds", 0)), 1))
            row[3].text = str(g.get("interactions", 0))
        doc.add_paragraph()

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