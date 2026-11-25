from __future__ import annotations

import json
import re
import shutil
import threading
import uuid
from datetime import datetime, timezone
from html import escape
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

from fastapi.responses import (
    FileResponse,
    JSONResponse,
    StreamingResponse,
)

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.insights import generate_insights
from ..cv.pipeline import run_analysis
from ..database import get_db
from ..models import Analysis, Site, User
from ..security import (
    current_user,
    user_from_query_token,
)


router = APIRouter(
    prefix="/api/analyses",
    tags=["analyses"],
)

DATA_DIR = (
    Path(__file__).resolve().parents[2]
    / "data"
)

UPLOAD_DIR = (
    DATA_DIR
    / "uploads"
)

RESULT_DIR = (
    DATA_DIR
    / "results"
)

MAX_VIDEO_DURATION_SECONDS = 120

UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

RESULT_DIR.mkdir(
    parents=True,
    exist_ok=True,
)


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
            or user.retailer_id
            == site.retailer_id
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

    if (
        not isinstance(raw, list)
        or len(raw) < 4
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "roi necesita un mínimo de 4 puntos"
            ),
        )

    if len(raw) > 16:
        raise HTTPException(
            status_code=400,
            detail=(
                "roi admite como máximo 16 puntos"
            ),
        )

    polygon: list[list[float]] = []

    for point in raw:

        if (
            not isinstance(
                point,
                (list, tuple),
            )
            or len(point) != 2
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "cada punto de roi debe ser [x, y]"
                ),
            )

        try:
            x = float(
                point[0]
            )

            y = float(
                point[1]
            )

        except (
            TypeError,
            ValueError,
        ) as exc:
            raise HTTPException(
                status_code=400,
                detail=(
                    "las coordenadas de roi "
                    "deben ser numéricas"
                ),
            ) from exc

        if not (
            0.0 <= x <= 1.0
            and
            0.0 <= y <= 1.0
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "las coordenadas de roi "
                    "deben estar entre 0 y 1"
                ),
            )

        polygon.append(
            [x, y]
        )

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
        return value.replace(
            tzinfo=timezone.utc
        )

    return value.astimezone(
        timezone.utc
    )


def payload(
    analysis: Analysis,
) -> dict:
    created_at = normalize_created_at(
        analysis.created_at
    )

    return {
        "id":
            analysis.id,

        "site_id":
            analysis.site_id,

        "filename":
            analysis.filename,

        "status":
            analysis.status,

        "stage":
            analysis.stage,

        "progress":
            analysis.progress,

        "message":
            analysis.message,

        "created_at": (
            created_at.isoformat()
            if created_at
            else None
        ),

        "result":
            analysis.result,

        "insights":
            analysis.insights,
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
            detail=(
                "Análisis no encontrado"
            ),
        )

    site = database.get(
        Site,
        analysis.site_id,
    )

    if (
        not site
        or not can_access(
            user,
            site,
        )
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "No tienes acceso "
                "a este análisis"
            ),
        )

    return (
        analysis,
        site,
    )


# =========================================================
# ESTADO
# =========================================================


def status_payload(
    analysis: Analysis,
) -> dict:

    return {
        "analysis_id":
            analysis.id,

        "status":
            analysis.status,

        "stage":
            analysis.stage,

        "progress":
            analysis.progress,

        "message":
            analysis.message,
    }


def not_ready_response(
    analysis: Analysis,
) -> JSONResponse:

    if analysis.status == "failed":
        code = 422

        detail = (
            "El análisis falló; "
            "no hay resultados disponibles"
        )

    elif analysis.status in {
        "cancelling",
        "cancelled",
    }:
        code = 409

        detail = (
            "El análisis fue cancelado "
            "o está siendo cancelado"
        )

    else:
        code = 409

        detail = (
            "El análisis aún no tiene "
            "resultados disponibles"
        )

    body = status_payload(
        analysis
    )

    body["detail"] = detail

    return JSONResponse(
        status_code=code,
        content=body,
    )


def require_result(
    analysis: Analysis,
) -> dict:

    if (
        analysis.status
        == "completed"
    ):
        return (
            analysis.result
            or {}
        )

    return not_ready_response(
        analysis
    )  # type: ignore[return-value]


# =========================================================
# HELPERS
# =========================================================


def result_floor(
    result: dict,
) -> dict:

    return (
        result
        .get(
            "site",
            {},
        )
        .get(
            "configuration",
            {},
        )
        .get(
            "floor",
            {},
        )
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
            sum(values)
            / len(values),
            2,
        )

        if values

        else 0.0
    )


def get_video_duration_seconds(
    video_path: Path,
) -> float:

    capture = cv2.VideoCapture(
        str(video_path)
    )

    try:
        fps = capture.get(
            cv2.CAP_PROP_FPS
        )

        frame_count = capture.get(
            cv2.CAP_PROP_FRAME_COUNT
        )

    finally:
        capture.release()

    if (
        fps <= 0
        or frame_count <= 0
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "No se pudo leer la duracion del video. "
                "Carga un MP4 valido."
            ),
        )

    return (
        frame_count
        / fps
    )


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

    if not can_access(
        user,
        site,
    ):
        raise HTTPException(
            status_code=404,
            detail=(
                "Sede no encontrada"
            ),
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
            detail=(
                "Carga un archivo MP4 válido"
            ),
        )

    roi_polygon = parse_roi(
        roi
    )

    analysis_id = (
        uuid.uuid4().hex
    )

    video_path = (
        UPLOAD_DIR
        / f"{analysis_id}.mp4"
    )

    # =====================================================
    # GUARDAR VIDEO
    # =====================================================

    with video_path.open(
        "wb"
    ) as target:

        shutil.copyfileobj(
            video.file,
            target,
        )

    if (
        video_path
        .stat()
        .st_size
        == 0
    ):
        video_path.unlink(
            missing_ok=True
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "El archivo está vacío"
            ),
        )

    # =====================================================
    # VALIDAR DURACIÓN
    # =====================================================

    try:
        duration_seconds = (
            get_video_duration_seconds(
                video_path
            )
        )

    except HTTPException:

        video_path.unlink(
            missing_ok=True
        )

        raise

    if (
        duration_seconds
        > MAX_VIDEO_DURATION_SECONDS
    ):
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

    # =====================================================
    # HORA REAL DE CREACIÓN
    # =====================================================

    current_utc = (
        datetime.now(
            timezone.utc
        )
    )

    analysis = Analysis(
        id=analysis_id,

        site_id=
            site.id,

        user_id=
            user.id,

        filename=
            Path(filename).name,

        video_path=
            str(video_path),

        status=
            "queued",

        stage=
            "upload",

        progress=
            1,

        message=(
            "Video guardado; "
            "esperando inferencia"
        ),

        created_at=
            current_utc,
    )

    database.add(
        analysis
    )

    database.commit()

    database.refresh(
        analysis
    )

    # =====================================================
    # INICIAR PROCESAMIENTO
    # =====================================================

    threading.Thread(
        target=
            run_analysis,

        args=(
            analysis_id,
        ),

        kwargs={
            "roi":
                roi_polygon,
        },

        daemon=True,
    ).start()

    return {
        "id":
            analysis_id,

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
            Analysis
            .created_at
            .desc()
        )
    )

    if (
        user.role
        != "admin"
    ):
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

        for item
        in analyses
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
            detail=(
                "Análisis no encontrado"
            ),
        )

    return payload(
        analysis
    )


# =========================================================
# INSIGHTS (IA)
# =========================================================


@router.post(
    "/{analysis_id}/insights"
)
def create_insights(
    analysis_id: str,
    regenerate: bool = False,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:

    analysis, _ = owned_analysis(
        analysis_id,
        user,
        database,
    )

    if (
        analysis.status != "completed"
        or not analysis.result
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "El análisis todavía no tiene "
                "resultados para interpretar"
            ),
        )

    if (
        analysis.insights
        and not regenerate
    ):
        return analysis.insights

    try:
        frame_dir = RESULT_DIR / analysis_id
        frame_paths = sorted(
            frame_dir.glob("frame_*.jpg")
        )
        insights = generate_insights(
            analysis.result,
            frame_paths=frame_paths,
        )

    except RuntimeError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc

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
            detail=(
                "Artefacto no encontrado"
            ),
        )

    safe_name = Path(
        filename
    ).name

    base_ok = (
        safe_name
        in {
            "traffic.png",
            "dwell.png",
            "interaction.png",
            "pickup.png",
        }
    )

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
            detail=(
                "Artefacto no encontrado"
            ),
        )

    path = (
        RESULT_DIR
        / analysis_id
        / safe_name
    )

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                "Artefacto no encontrado"
            ),
        )

    return FileResponse(
        path
    )


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
            detail=(
                "Análisis no encontrado"
            ),
        )

    anonymized_path = (
        RESULT_DIR
        / analysis_id
        / "anonymized.mp4"
    )

    path = (
        anonymized_path
        if anonymized_path.exists()
        else Path(
            analysis.video_path
        )
    )

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                "Video no encontrado"
            ),
        )

    return FileResponse(
        path,
        media_type=
            "video/mp4",
    )


# =========================================================
# EXPORTAR INSIGHTS
# =========================================================


def require_insights_export_context(
    analysis_id: str,
    user: User,
    database: Session,
) -> tuple[Analysis, Site, dict, dict]:

    analysis, site = owned_analysis(
        analysis_id,
        user,
        database,
    )

    if not analysis.insights:
        raise HTTPException(
            status_code=409,
            detail=(
                "Genera las recomendaciones primero "
                "antes de exportar"
            ),
        )

    return (
        analysis,
        site,
        analysis.insights or {},
        analysis.result or {},
    )


def analysis_result_dir(analysis_id: str) -> Path:
    return RESULT_DIR / analysis_id


def existing_artifact_path(analysis_id: str, filename: str | None) -> Path | None:
    if not filename:
        return None
    safe_name = Path(filename).name
    path = analysis_result_dir(analysis_id) / safe_name
    return path if path.exists() else None


def evidence_frame_names(text: str | None) -> list[str]:
    if not text:
        return []
    seen = set()
    names = []
    for match in re.findall(r"frame_\d+", text):
        filename = f"{match}.jpg"
        if filename not in seen:
            seen.add(filename)
            names.append(filename)
    return names


def selected_heatmap_paths(analysis_id: str, result: dict) -> list[tuple[str, Path]]:
    heatmaps = result.get("heatmaps", {}) or {}
    candidates = [
        ("Mapa de trafico", heatmaps.get("traffic") or "traffic.png"),
        ("Mapa de permanencia", heatmaps.get("dwell") or "dwell.png"),
        ("Mapa de interacciones", heatmaps.get("interaction")),
        ("Mapa de pick-ups", heatmaps.get("pickup")),
    ]
    found = []
    for label, filename in candidates:
        path = existing_artifact_path(analysis_id, filename)
        if path:
            found.append((label, path))
    return found


def recommendation_evidence_path(
    analysis_id: str,
    result: dict,
    evidence_text: str | None,
    index: int,
) -> Path | None:
    for frame_name in evidence_frame_names(evidence_text):
        path = existing_artifact_path(analysis_id, frame_name)
        if path:
            return path

    frames = result.get("annotated_frames", []) or []
    fallback_name = frames[index - 1] if index - 1 < len(frames) else None
    return existing_artifact_path(analysis_id, fallback_name)


@router.get(
    "/{analysis_id}/insights/export"
)
def export_insights_docx(
    analysis_id: str,
    user: User = Depends(user_from_query_token),
    database: Session = Depends(get_db),
):

    analysis, site, insights, result = require_insights_export_context(
        analysis_id,
        user,
        database,
    )

    try:
        from docx import Document
        from docx.shared import Inches
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "python-docx no está instalado. "
                "Ejecuta: pip install -r backend/requirements.txt "
                "y reinicia el servidor."
            ),
        ) from exc

    document = Document()
    document.add_heading("Recomendaciones de Space Management", 0)
    document.add_paragraph(f"Tienda: {site.name}")
    document.add_paragraph(f"Análisis: {analysis.id}")
    document.add_heading("Hallazgo principal", level=1)
    document.add_paragraph(insights.get("hallazgo_principal", ""))
    document.add_heading("Visión general", level=1)
    document.add_paragraph(insights.get("resumen_ejecutivo", ""))
    document.add_heading("Métricas", level=1)

    for key, value in (result.get("metrics", {}) or {}).items():
        document.add_paragraph(f"{key}: {value}")

    document.add_heading("Recomendaciones", level=1)
    for index, rec in enumerate(
        insights.get("recomendaciones", []) or [],
        start=1,
    ):
        document.add_heading(
            f"{index}. {rec.get('titulo', '')}",
            level=2,
        )
        document.add_paragraph(rec.get("justificacion", ""))
        if rec.get("impacto_estimado"):
            document.add_paragraph(
                f"Impacto estimado: {rec.get('impacto_estimado')}"
            )
        if rec.get("evidencia_visual"):
            document.add_paragraph(
                f"Evidencia: {rec.get('evidencia_visual')}"
            )
            frame_path = recommendation_evidence_path(
                analysis_id,
                result,
                rec.get("evidencia_visual"),
                index,
            )
            if frame_path:
                document.add_picture(str(frame_path), width=Inches(5.8))
                document.add_paragraph(f"Figura {index} - {frame_path.name}")

    zones = result.get("zones", []) or []
    if zones:
        document.add_heading("Metricas por zona", level=1)
        table = document.add_table(rows=1, cols=6)
        headers = ["Zona", "Visitas", "Permanencia (s)", "Interacciones", "Heat index", "Clasificacion"]
        for cell, header in zip(table.rows[0].cells, headers):
            cell.text = header
        for zone in zones:
            cells = table.add_row().cells
            cells[0].text = str(zone.get("name", zone.get("zone_id", "")))
            cells[1].text = str(zone.get("visits", 0))
            cells[2].text = str(round(float(zone.get("dwell_seconds", 0) or 0), 1))
            cells[3].text = str(zone.get("interactions", 0))
            cells[4].text = str(round(float(zone.get("heat_index", 0) or 0), 3))
            cells[5].text = str(zone.get("classification", ""))

    heatmap_paths = selected_heatmap_paths(analysis_id, result)
    if heatmap_paths:
        document.add_heading("Mapas de calor", level=1)
        for label, path in heatmap_paths[:2]:
            document.add_paragraph(label)
            document.add_picture(str(path), width=Inches(5.8))

    buffer = BytesIO()
    document.save(buffer)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
        headers={
            "Content-Disposition":
                f'attachment; filename="recomendaciones_{analysis_id[:8]}.docx"'
        },
    )


@router.get(
    "/{analysis_id}/insights/export-excel"
)
def export_insights_excel(
    analysis_id: str,
    user: User = Depends(user_from_query_token),
    database: Session = Depends(get_db),
):

    _, site, insights, result = require_insights_export_context(
        analysis_id,
        user,
        database,
    )

    try:
        from openpyxl import Workbook
        from openpyxl.chart import BarChart, PieChart, Reference
        from openpyxl.drawing.image import Image as ExcelImage
        from openpyxl.styles import Alignment, Font, PatternFill
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "openpyxl no está instalado. "
                "Ejecuta: pip install -r backend/requirements.txt "
                "y reinicia el servidor."
            ),
        ) from exc

    workbook = Workbook()

    def excel_value(value):
        if isinstance(value, (dict, list, tuple)):
            return json.dumps(
                value,
                ensure_ascii=False,
            )

        if value is None:
            return ""

        return value

    metrics = result.get("metrics", {}) or {}
    video = result.get("video", {}) or {}
    zones = result.get("zones", []) or []
    recommendations = insights.get("recomendaciones", []) or []

    summary_ws = workbook.active
    summary_ws.title = "Resumen"
    summary_ws.merge_cells("A1:B1")
    summary_ws["A1"] = f"Recomendaciones de Space Management - {site.name}"
    summary_ws["A2"] = "Scapder - Inteligencia espacial"
    summary_ws["A4"] = "1. Informacion del analisis"
    summary_ws["A5"] = "Indicador"
    summary_ws["B5"] = "Valor"
    summary_rows = [
        ("Sede", site.name),
        ("ID del analisis", analysis_id),
        ("Modo de analisis", result.get("analysis_mode", "")),
        ("Duracion del video (s)", video.get("duration_seconds", "")),
        ("FPS", video.get("fps", "")),
        ("Zonas analizadas", len(zones)),
        ("Personas detectadas", metrics.get("tracked_presences", metrics.get("people_detected", 0))),
        ("Eventos de interaccion", metrics.get("interaction_events", 0)),
        ("Eventos de pickup", metrics.get("pickup_events", 0)),
        ("Flujo por minuto", metrics.get("flow_per_minute", 0)),
    ]
    for row_index, (label, value) in enumerate(summary_rows, start=6):
        summary_ws.cell(row_index, 1, label)
        summary_ws.cell(row_index, 2, excel_value(value))
    section_row = len(summary_rows) + 8
    summary_ws.cell(section_row, 1, "2. Hallazgo principal")
    summary_ws.merge_cells(start_row=section_row + 1, start_column=1, end_row=section_row + 1, end_column=2)
    summary_ws.cell(section_row + 1, 1, excel_value(insights.get("hallazgo_principal", "")))
    summary_ws.row_dimensions[section_row + 1].height = 92
    section_row += 3
    summary_ws.cell(section_row, 1, "3. Resumen ejecutivo")
    summary_ws.merge_cells(start_row=section_row + 1, start_column=1, end_row=section_row + 1, end_column=2)
    summary_ws.cell(section_row + 1, 1, excel_value(insights.get("resumen_ejecutivo", "")))
    summary_ws.row_dimensions[section_row + 1].height = 92

    zones_ws = workbook.create_sheet("Zonas")
    zones_ws.append([
        "Zona",
        "Visitas",
        "Densidad (vis/min)",
        "Permanencia (s)",
        "Dwell prom. (s)",
        "Interacciones",
        "Heat index",
        "Clasificacion",
    ])
    for zone in zones:
        zones_ws.append([
            excel_value(zone.get("name", zone.get("zone_id", ""))),
            excel_value(zone.get("visits", 0)),
            excel_value(zone.get("density", 0)),
            excel_value(zone.get("dwell_seconds", 0)),
            excel_value(zone.get("avg_dwell_seconds", 0)),
            excel_value(zone.get("interactions", 0)),
            excel_value(zone.get("heat_index", 0)),
            excel_value(zone.get("classification", "")),
        ])

    rec_ws = workbook.create_sheet("Recomendaciones")
    rec_ws.append([
        "#",
        "Titulo",
        "Justificacion",
        "Impacto estimado",
        "Evidencia visual",
        "Imagen",
    ])
    for index, rec in enumerate(recommendations, start=1):
        row = rec_ws.max_row + 1
        rec_ws.append([
            index,
            excel_value(rec.get("titulo", "")),
            excel_value(rec.get("justificacion", "")),
            excel_value(rec.get("impacto_estimado", "")),
            excel_value(rec.get("evidencia_visual", "")),
            "",
        ])
        rec_ws.row_dimensions[row].height = 150
        frame_path = recommendation_evidence_path(
            analysis_id,
            result,
            rec.get("evidencia_visual"),
            index,
        )
        if frame_path:
            image = ExcelImage(str(frame_path))
            image.width = 260
            image.height = 146
            rec_ws.add_image(image, f"F{row}")

    dash_ws = workbook.create_sheet("Dashboard")
    dash_ws.sheet_view.showGridLines = False
    dash_ws.merge_cells("A1:H1")
    dash_ws["A1"] = f"Dashboard - {site.name}"
    dash_ws.merge_cells("A2:H2")
    dash_ws["A2"] = "Graficas nativas de Excel con datos de zonas y mapas de calor."
    dash_ws["A4"] = "Indicador"
    dash_ws["B4"] = "Valor"
    chart_metrics = [
        ("Personas rastreadas", metrics.get("tracked_presences", metrics.get("people_detected", 0))),
        ("Interacciones", metrics.get("interaction_events", 0)),
        ("Pick-ups", metrics.get("pickup_events", 0)),
        ("Zonas calientes", len([zone for zone in zones if zone.get("classification") == "hot"])),
    ]
    for row_index, (label, value) in enumerate(chart_metrics, start=5):
        dash_ws.cell(row_index, 1, label)
        dash_ws.cell(row_index, 2, value or 0)

    overview_chart = BarChart()
    overview_chart.title = "Indicadores del analisis"
    overview_chart.y_axis.title = "Valor"
    overview_chart.add_data(Reference(dash_ws, min_col=2, min_row=4, max_row=4 + len(chart_metrics)), titles_from_data=True)
    overview_chart.set_categories(Reference(dash_ws, min_col=1, min_row=5, max_row=4 + len(chart_metrics)))
    overview_chart.legend = None
    overview_chart.height = 6.2
    overview_chart.width = 11.5
    dash_ws.add_chart(overview_chart, "D4")

    zone_count = len(zones)
    if zone_count:
        visits_chart = BarChart()
        visits_chart.title = "Visitas por zona"
        visits_chart.y_axis.title = "Visitas"
        visits_chart.add_data(Reference(zones_ws, min_col=2, min_row=1, max_row=zone_count + 1), titles_from_data=True)
        visits_chart.set_categories(Reference(zones_ws, min_col=1, min_row=2, max_row=zone_count + 1))
        visits_chart.legend = None
        visits_chart.height = 7.5
        visits_chart.width = 14
        dash_ws.add_chart(visits_chart, "A22")

        dwell_chart = BarChart()
        dwell_chart.title = "Permanencia por zona (s)"
        dwell_chart.y_axis.title = "Segundos"
        dwell_chart.add_data(Reference(zones_ws, min_col=4, min_row=1, max_row=zone_count + 1), titles_from_data=True)
        dwell_chart.set_categories(Reference(zones_ws, min_col=1, min_row=2, max_row=zone_count + 1))
        dwell_chart.legend = None
        dwell_chart.height = 7.5
        dwell_chart.width = 14
        dash_ws.add_chart(dwell_chart, "I22")

        heat_chart = BarChart()
        heat_chart.title = "Heat index por zona"
        heat_chart.y_axis.title = "Heat index"
        heat_chart.add_data(Reference(zones_ws, min_col=7, min_row=1, max_row=zone_count + 1), titles_from_data=True)
        heat_chart.set_categories(Reference(zones_ws, min_col=1, min_row=2, max_row=zone_count + 1))
        heat_chart.legend = None
        heat_chart.height = 7.5
        heat_chart.width = 14
        dash_ws.add_chart(heat_chart, "A40")

        class_start = 10
        dash_ws.cell(class_start, 1, "Clasificacion")
        dash_ws.cell(class_start, 2, "Zonas")
        classifications = {}
        for zone in zones:
            label = zone.get("classification") or "sin clasificar"
            classifications[label] = classifications.get(label, 0) + 1
        for row_index, (label, value) in enumerate(classifications.items(), start=class_start + 1):
            dash_ws.cell(row_index, 1, label)
            dash_ws.cell(row_index, 2, value)
        pie = PieChart()
        pie.title = "Distribucion de actividad"
        pie.add_data(Reference(dash_ws, min_col=2, min_row=class_start, max_row=class_start + len(classifications)), titles_from_data=True)
        pie.set_categories(Reference(dash_ws, min_col=1, min_row=class_start + 1, max_row=class_start + len(classifications)))
        pie.height = 6.2
        pie.width = 9.5
        dash_ws.add_chart(pie, "I4")

    image_row = 60
    for label, path in selected_heatmap_paths(analysis_id, result)[:2]:
        dash_ws.cell(image_row, 1, label)
        dash_ws.cell(image_row, 1).font = Font(bold=True, color="151323")
        image = ExcelImage(str(path))
        image.width = 520
        image.height = 292
        dash_ws.add_image(image, f"A{image_row + 1}")
        image_row += 24

    for row_index in range(1, 110):
        dash_ws.row_dimensions[row_index].height = 21
    for row_index in (1, 2, 4, 10, 22, 40, 60, 84):
        dash_ws.row_dimensions[row_index].height = 26

    widths = {
        "Resumen": {"A": 34, "B": 72},
        "Zonas": {"A": 24, "B": 12, "C": 18, "D": 18, "E": 18, "F": 16, "G": 12, "H": 16},
        "Recomendaciones": {"A": 6, "B": 34, "C": 58, "D": 34, "E": 44, "F": 38},
        "Dashboard": {"A": 24, "B": 14, "C": 4, "D": 14, "E": 14, "F": 14, "G": 14, "H": 14, "I": 14, "J": 14, "K": 14, "L": 14, "M": 14, "N": 14, "O": 14},
    }
    for sheet in workbook.worksheets:
        sheet.freeze_panes = "A2" if sheet.title in {"Zonas", "Recomendaciones"} else None
        for col, width in widths.get(sheet.title, {}).items():
            sheet.column_dimensions[col].width = width
        for cell in sheet[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="151323")
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        for row in sheet.iter_rows():
            for cell in row:
                cell.alignment = Alignment(vertical="top", wrap_text=True)
    for cell in ("A4",):
        summary_ws[cell].font = Font(bold=True, color="CF4921")

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition":
                f'attachment; filename="recomendaciones_{analysis_id[:8]}.xlsx"'
        },
    )

    ws = workbook.active
    ws.title = "Resumen"
    ws.append(["Tienda", excel_value(site.name)])
    ws.append(["Hallazgo principal", excel_value(insights.get("hallazgo_principal", ""))])
    ws.append(["Visión general", excel_value(insights.get("resumen_ejecutivo", ""))])

    metrics_ws = workbook.create_sheet("Métricas")
    metrics_ws.append(["Métrica", "Valor"])
    for key, value in (result.get("metrics", {}) or {}).items():
        metrics_ws.append([
            excel_value(key),
            excel_value(value),
        ])

    zones_ws = workbook.create_sheet("Zonas")
    zones_ws.append([
        "Zona",
        "Visitas",
        "Permanencia",
        "Dwell prom.",
        "Interacciones",
        "Heat index",
        "Clasificación",
    ])
    for zone in result.get("zones", []) or []:
        zones_ws.append([
            excel_value(zone.get("name", zone.get("zone_id", ""))),
            excel_value(zone.get("visits", 0)),
            excel_value(zone.get("dwell_seconds", 0)),
            excel_value(zone.get("avg_dwell_seconds", 0)),
            excel_value(zone.get("interactions", 0)),
            excel_value(zone.get("heat_index", 0)),
            excel_value(zone.get("classification", "")),
        ])

    rec_ws = workbook.create_sheet("Recomendaciones")
    rec_ws.append([
        "#",
        "Título",
        "Justificación",
        "Impacto estimado",
        "Evidencia",
    ])
    for index, rec in enumerate(
        insights.get("recomendaciones", []) or [],
        start=1,
    ):
        rec_ws.append([
            index,
            excel_value(rec.get("titulo", "")),
            excel_value(rec.get("justificacion", "")),
            excel_value(rec.get("impacto_estimado", "")),
            excel_value(rec.get("evidencia_visual", "")),
        ])

    charts_ws = workbook.create_sheet("Dashboard")
    charts_ws.append([f"Dashboard - {site.name}"])
    charts_ws.append(["Graficas nativas de Excel y mapas de calor del analisis."])
    charts_ws.append([])
    charts_ws.append(["Resumen visual", "Valor"])
    chart_metrics = [
        ("Personas rastreadas", result.get("metrics", {}).get("tracked_presences", 0)),
        ("Interacciones", result.get("metrics", {}).get("interaction_events", 0)),
        ("Pick-ups", result.get("metrics", {}).get("pickup_events", 0)),
        ("Zonas calientes", len([zone for zone in result.get("zones", []) or [] if zone.get("classification") == "hot"])),
    ]
    for label, value in chart_metrics:
        charts_ws.append([label, value or 0])

    metric_chart = BarChart()
    metric_chart.title = "Indicadores del analisis"
    metric_chart.y_axis.title = "Valor"
    metric_chart.x_axis.title = "Indicador"
    metric_chart.add_data(Reference(charts_ws, min_col=2, min_row=4, max_row=4 + len(chart_metrics)), titles_from_data=True)
    metric_chart.set_categories(Reference(charts_ws, min_col=1, min_row=5, max_row=4 + len(chart_metrics)))
    metric_chart.height = 8
    metric_chart.width = 15
    charts_ws.add_chart(metric_chart, "D2")

    zone_count = len(result.get("zones", []) or [])
    if zone_count:
        visits_chart = BarChart()
        visits_chart.title = "Visitas por zona"
        visits_chart.y_axis.title = "Visitas"
        visits_chart.x_axis.title = "Zona"
        visits_chart.add_data(Reference(zones_ws, min_col=2, min_row=1, max_row=zone_count + 1), titles_from_data=True)
        visits_chart.set_categories(Reference(zones_ws, min_col=1, min_row=2, max_row=zone_count + 1))
        visits_chart.height = 9
        visits_chart.width = 19
        charts_ws.add_chart(visits_chart, "D18")

        dwell_chart = BarChart()
        dwell_chart.title = "Permanencia por zona"
        dwell_chart.y_axis.title = "Segundos"
        dwell_chart.x_axis.title = "Zona"
        dwell_chart.add_data(Reference(zones_ws, min_col=3, min_row=1, max_row=zone_count + 1), titles_from_data=True)
        dwell_chart.set_categories(Reference(zones_ws, min_col=1, min_row=2, max_row=zone_count + 1))
        dwell_chart.height = 9
        dwell_chart.width = 19
        charts_ws.add_chart(dwell_chart, "D35")

        heat_chart = BarChart()
        heat_chart.title = "Heat index por zona"
        heat_chart.y_axis.title = "Heat index"
        heat_chart.x_axis.title = "Zona"
        heat_chart.add_data(Reference(zones_ws, min_col=6, min_row=1, max_row=zone_count + 1), titles_from_data=True)
        heat_chart.set_categories(Reference(zones_ws, min_col=1, min_row=2, max_row=zone_count + 1))
        heat_chart.height = 9
        heat_chart.width = 19
        charts_ws.add_chart(heat_chart, "D52")

        class_start = 10
        charts_ws.cell(class_start, 1, "Clasificacion")
        charts_ws.cell(class_start, 2, "Zonas")
        classifications = {}
        for zone in result.get("zones", []) or []:
            label = zone.get("classification") or "sin clasificar"
            classifications[label] = classifications.get(label, 0) + 1
        for row, (label, value) in enumerate(classifications.items(), start=class_start + 1):
            charts_ws.cell(row, 1, label)
            charts_ws.cell(row, 2, value)
        pie = PieChart()
        pie.title = "Distribucion de actividad"
        pie.add_data(Reference(charts_ws, min_col=2, min_row=class_start, max_row=class_start + len(classifications)), titles_from_data=True)
        pie.set_categories(Reference(charts_ws, min_col=1, min_row=class_start + 1, max_row=class_start + len(classifications)))
        pie.height = 8
        pie.width = 12
        charts_ws.add_chart(pie, "J2")

    image_row = 70
    for label, path in selected_heatmap_paths(analysis_id, result)[:2]:
        charts_ws.cell(image_row, 1, label)
        charts_ws.cell(image_row, 1).font = Font(bold=True, color="151323")
        image = ExcelImage(str(path))
        image.width = 520
        image.height = 292
        charts_ws.add_image(image, f"A{image_row + 1}")
        image_row += 24

    for sheet in workbook.worksheets:
        for cell in sheet[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="FF6B3D")
            cell.alignment = Alignment(horizontal="center")

        for column in sheet.columns:
            letter = column[0].column_letter
            sheet.column_dimensions[letter].width = min(
                55,
                max(
                    14,
                    max(len(str(cell.value or "")) for cell in column) + 2,
                ),
            )

        for row in sheet.iter_rows():
            for cell in row:
                cell.alignment = Alignment(
                    vertical="top",
                    wrap_text=True,
                )

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition":
                f'attachment; filename="recomendaciones_{analysis_id[:8]}.xlsx"'
        },
    )


@router.get(
    "/{analysis_id}/insights/export-pdf"
)
def export_insights_pdf(
    analysis_id: str,
    user: User = Depends(user_from_query_token),
    database: Session = Depends(get_db),
):

    analysis, site, insights, result = require_insights_export_context(
        analysis_id,
        user,
        database,
    )

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "reportlab no está instalado. "
                "Ejecuta: pip install -r backend/requirements.txt "
                "y reinicia el servidor."
            ),
        ) from exc

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ScapderTitle",
        parent=styles["Title"],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#151323"),
        spaceAfter=10,
    ))
    styles.add(ParagraphStyle(
        name="ScapderHeading",
        parent=styles["Heading1"],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#CF4921"),
        spaceBefore=10,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="ScapderBody",
        parent=styles["BodyText"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#334155"),
        wordWrap="CJK",
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="ScapderSmall",
        parent=styles["BodyText"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#475569"),
        wordWrap="CJK",
    ))

    def pdf_text(value) -> str:
        if isinstance(value, (dict, list, tuple)):
            value = json.dumps(value, ensure_ascii=False)
        return escape(str(value or ""))

    def p(value, style="ScapderBody"):
        return Paragraph(pdf_text(value), styles[style])
    story = [
        Paragraph("Recomendaciones de Space Management", styles["ScapderTitle"]),
        p(f"Tienda: {site.name}", "ScapderSmall"),
        Paragraph(f"Análisis: {analysis.id}", styles["Normal"]),
        Spacer(1, 12),
        Paragraph("Hallazgo principal", styles["ScapderHeading"]),
        p(insights.get("hallazgo_principal", "")),
        Paragraph("Visión general", styles["Heading1"]),
        p(insights.get("resumen_ejecutivo", "")),
        Paragraph("Métricas", styles["Heading1"]),
    ]

    metrics_rows = [["Métrica", "Valor"]]
    for key, value in (result.get("metrics", {}) or {}).items():
        metrics_rows.append([p(key, "ScapderSmall"), p(value, "ScapderSmall")])

    metrics_table = Table(
        metrics_rows,
        colWidths=[8.2 * cm, 7.0 * cm],
        repeatRows=1,
    )
    metrics_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FF6B3D")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EE")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(metrics_table)
    story.append(Spacer(1, 12))
    story.append(Paragraph("Recomendaciones", styles["ScapderHeading"]))

    for index, rec in enumerate(
        insights.get("recomendaciones", []) or [],
        start=1,
    ):
        recommendation_items = [
            Paragraph(
                pdf_text(f"{index}. {rec.get('titulo', '')}"),
                styles["ScapderHeading"],
            ),
            p(rec.get("justificacion", "")),
        ]
        if rec.get("impacto_estimado"):
            recommendation_items.append(
                p(f"Impacto estimado: {rec.get('impacto_estimado')}")
            )
        if rec.get("evidencia_visual"):
            recommendation_items.append(
                p(f"Evidencia: {rec.get('evidencia_visual')}")
            )
        story.extend(recommendation_items)
        story.append(Spacer(1, 8))

    zones = result.get("zones", []) or []
    if zones:
        story.append(Paragraph("Metricas por zona", styles["ScapderHeading"]))
        zone_rows = [[
            p("Zona", "ScapderSmall"),
            p("Visitas", "ScapderSmall"),
            p("Permanencia (s)", "ScapderSmall"),
            p("Interacciones", "ScapderSmall"),
            p("Heat index", "ScapderSmall"),
            p("Clasificacion", "ScapderSmall"),
        ]]
        for zone in zones:
            zone_rows.append([
                p(zone.get("name", zone.get("zone_id", "")), "ScapderSmall"),
                p(zone.get("visits", 0), "ScapderSmall"),
                p(round(float(zone.get("dwell_seconds", 0) or 0), 1), "ScapderSmall"),
                p(zone.get("interactions", 0), "ScapderSmall"),
                p(round(float(zone.get("heat_index", 0) or 0), 3), "ScapderSmall"),
                p(zone.get("classification", ""), "ScapderSmall"),
            ])
        zone_table = Table(
            zone_rows,
            colWidths=[3.4 * cm, 1.7 * cm, 2.5 * cm, 2.2 * cm, 2.0 * cm, 2.6 * cm],
            repeatRows=1,
        )
        zone_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#151323")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EE")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(zone_table)
        story.append(Spacer(1, 12))

    heatmap_paths = selected_heatmap_paths(analysis_id, result)
    if heatmap_paths:
        from reportlab.platypus import Image as PdfImage

        story.append(Paragraph("Mapas de calor", styles["ScapderHeading"]))
        for label, path in heatmap_paths[:2]:
            story.append(p(label, "ScapderSmall"))
            image = PdfImage(str(path))
            image._restrictSize(15.2 * cm, 8.6 * cm)
            story.append(image)
            story.append(Spacer(1, 8))

    document.build(story)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f'attachment; filename="recomendaciones_{analysis_id[:8]}.pdf"'
        },
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

    analysis, _ = (
        owned_analysis(
            analysis_id,
            user,
            database,
        )
    )

    return status_payload(
        analysis
    )


# =========================================================
# CANCELAR ANÁLISIS
# =========================================================


@router.post(
    "/{analysis_id}/cancel"
)
def cancel_analysis(
    analysis_id: str,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    """
    Solicita la cancelación de un análisis.

    Este endpoint NO mata directamente el thread.

    Cambia el estado del análisis a "cancelling".
    El pipeline debe consultar ese estado periódicamente
    y detenerse cuando lo encuentre.
    """

    analysis, _ = (
        owned_analysis(
            analysis_id,
            user,
            database,
        )
    )

    # -----------------------------------------------------
    # YA FINALIZÓ
    # -----------------------------------------------------

    if (
        analysis.status
        == "completed"
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "El análisis ya finalizó "
                "y no puede cancelarse"
            ),
        )

    # -----------------------------------------------------
    # YA FALLÓ
    # -----------------------------------------------------

    if (
        analysis.status
        == "failed"
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "El análisis ya falló "
                "y no puede cancelarse"
            ),
        )

    # -----------------------------------------------------
    # YA ESTÁ CANCELADO
    # -----------------------------------------------------

    if (
        analysis.status
        == "cancelled"
    ):
        return status_payload(
            analysis
        )

    # -----------------------------------------------------
    # CANCELACIÓN YA SOLICITADA
    # -----------------------------------------------------

    if (
        analysis.status
        == "cancelling"
    ):
        return status_payload(
            analysis
        )

    # -----------------------------------------------------
    # SOLICITAR CANCELACIÓN
    # -----------------------------------------------------

    analysis.status = (
        "cancelling"
    )

    analysis.message = (
        "Cancelación solicitada; "
        "deteniendo el procesamiento"
    )

    database.add(
        analysis
    )

    database.commit()

    database.refresh(
        analysis
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

    analysis, _ = (
        owned_analysis(
            analysis_id,
            user,
            database,
        )
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
        "analysis_id":
            analysis.id,

        "analysis_mode":
            result.get(
                "analysis_mode"
            ),

        "coordinate_system":
            result.get(
                "coordinate_system"
            ),

        "video":
            result.get(
                "video",
                {},
            ),

        "metrics":
            result.get(
                "metrics",
                {},
            ),

        "zones":
            result.get(
                "zones",
                [],
            ),

        "gondolas":
            result.get(
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

    analysis, _ = (
        owned_analysis(
            analysis_id,
            user,
            database,
        )
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
        "analysis_id":
            analysis.id,

        "analysis_mode":
            result.get(
                "analysis_mode"
            ),

        "heatmaps":
            result.get(
                "heatmaps",
                {},
            ),

        "floor":
            result_floor(
                result
            ),

        "roi":
            result.get(
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

    analysis, _ = (
        owned_analysis(
            analysis_id,
            user,
            database,
        )
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
        "analysis_id":
            analysis.id,

        "coordinate_system":
            result.get(
                "coordinate_system"
            ),

        "trajectories":
            result.get(
                "trajectories",
                [],
            ),

        "metrics":
            result.get(
                "metrics",
                {},
            ),

        "floor":
            result_floor(
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

    analysis, _ = (
        owned_analysis(
            analysis_id,
            user,
            database,
        )
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
        "analysis_id":
            analysis.id,

        "duration_seconds": (
            result.get(
                "video"
            )
            or {}
        ).get(
            "duration_seconds"
        ),

        "avg_dwell_seconds":
            average_dwell(
                zones
            ),

        "zones":
            zones,

        "gondolas":
            result.get(
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

    analysis, _ = (
        owned_analysis(
            analysis_id,
            user,
            database,
        )
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
        "analysis_id":
            analysis.id,

        "gondolas":
            result.get(
                "gondolas",
                [],
            ),

        "interaction_events_log":
            result.get(
                "interaction_events_log",
                [],
            ),

        "interaction_histogram":
            result.get(
                "interaction_histogram"
            ),

        "pickup_events_log":
            result.get(
                "pickup_events_log",
                [],
            ),

        "pickup_histogram":
            result.get(
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

    analysis, _ = (
        owned_analysis(
            analysis_id,
            user,
            database,
        )
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
        "analysis_id":
            analysis.id,

        "coordinate_system":
            result.get(
                "coordinate_system"
            ),

        "zones":
            result.get(
                "zones",
                [],
            ),

        "floor":
            result_floor(
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

    analysis, _ = (
        owned_analysis(
            analysis_id,
            user,
            database,
        )
    )

    result = require_result(
        analysis
    )

    if isinstance(
        result,
        JSONResponse,
    ):
        return result

    recommendations = (
        result.get(
            "recommendations"
        )
    )

    if recommendations is None:

        recommendations = [
            finding

            for finding
            in result.get(
                "findings",
                [],
            )

            if finding.get(
                "type"
            )
            == "recommendation"
        ]

    return {
        "analysis_id":
            analysis.id,

        "analysis_mode":
            result.get(
                "analysis_mode"
            ),

        "recommendations":
            recommendations,
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

    analysis, _ = (
        owned_analysis(
            analysis_id,
            user,
            database,
        )
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
        result.get(
            "analysis_mode"
        )
        != "advanced"
    ):
        return {
            "analysis_id":
                analysis.id,

            "available":
                False,

            "reason": (
                "3D requires calibrated camera"
            ),
        }

    configuration = (
        result
        .get(
            "site",
            {},
        )
        .get(
            "configuration",
            {},
        )
    )

    return {
        "analysis_id":
            analysis.id,

        "available":
            True,

        "configuration":
            configuration,

        "camera":
            configuration.get(
                "camera",
                {},
            ),

        "gondolas":
            result.get(
                "gondolas",
                [],
            ),

        "zones":
            result.get(
                "zones",
                [],
            ),
    }
