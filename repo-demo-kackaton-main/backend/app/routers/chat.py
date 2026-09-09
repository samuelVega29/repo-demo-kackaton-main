"""Asistente conversacional de SCAPDER.

Responde en español usando Google Gemini. Su rol es doble:
  1. Guiar al usuario para usar el programa (flujo y métricas).
  2. Explicar el informe de la sede: si llega ``site_id``, inyectamos un
     resumen compacto del análisis más reciente como contexto, de modo que el
     bot solo hable con datos reales y nunca invente cifras.

El análisis se resuelve de forma tolerante según su estado:
  - ``completed``  -> ``INFORMACION_DEL_INFORME`` (datos del último informe).
  - en curso       -> ``ESTADO_DEL_ANALISIS`` (etapa, % de progreso y mensaje)
                      para que el bot responda "cómo va el análisis".
  - ninguno        -> el bot explica que todavía no hay análisis en la sede.

Sin ``GEMINI_API_KEY`` configurada responde un mensaje de configuración en
lugar de fallar, para que la demo nunca se rompa.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Analysis, User
from ..security import current_user
from .analytics import site_or_403

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)

MAX_HISTORY_TURNS = 10
VALID_ROLES = {"user", "model"}
IN_PROGRESS_STATUSES = {"queued", "processing", "uploading", "running"}

NO_KEY_REPLY = (
    "Todavía no puedo responderte: falta configurar la clave de Gemini en el backend. "
    "Pide al administrador que defina la variable de entorno GEMINI_API_KEY y reinicie el servidor."
)

UNAVAILABLE_REPLY = (
    "No pude conectarme con el asistente en este momento (el servicio de Gemini está saturado o no respondió). "
    "Probá de nuevo en unos segundos."
)

# Etiqueta legible para cada etapa que reporta el pipeline de análisis.
STAGE_LABELS = {
    "upload": "Carga del video",
    "metadata": "Leyendo metadatos del video",
    "model": "Preparando detección y seguimiento de personas",
    "preprocessing": "Preparando detección y seguimiento de personas",
    "tracking": "Analizando trayectorias",
    "dwell": "Calculando tiempo de permanencia",
    "heatmaps": "Generando mapas de calor",
    "interactions": "Detectando interacciones",
    "recommendations": "Generando recomendaciones",
    "results": "Finalizando el análisis",
}

SYSTEM_PROMPT = """Eres el asistente de SCAPDER, una plataforma de retail analytics que analiza videos de tiendas con visión por computadora (detección de personas YOLO, tracking ByteTrack y proyección al piso en metros con homografía).

Tu rol es doble:
1) Ayudar al usuario a usar el programa paso a paso.
2) Explicar el informe de análisis de la sede usando ÚNICAMENTE el contexto que recibes. Este contexto puede ser:
   - INFORMACION_DEL_INFORME: datos reales del último análisis terminado. Nunca inventes métricas, góndolas ni recomendaciones que no aparezcan en ese bloque.
   - ESTADO_DEL_ANALISIS: un análisis se está procesando AHORA mismo. Nunca inventes números: usa exactamente la etapa, el porcentaje y el mensaje del bloque.

FLUJO DE USO DE LA APP:
1. Login con credenciales de la plataforma (admin o analista).
2. Elegir Retailer y luego la Sede (tienda).
3. Opcional: editar el planograma (definir geometría de la tienda y góndolas en metros) y calibrar la cámara con 4 puntos (P1-P4) que alinean la rejilla en metros con el piso del video.
4. Subir un video MP4 del piso con cámara fija y esperar a que termine el análisis.
5. Ver resultados: mapa 3D con heatmaps (tráfico, permanencia, interacción), video con overlay, matriz por góndola y recomendaciones.

GLOSARIO DE MÉTRICAS:
- Tráfico: tracks únicos próximos a cada góndola.
- Permanencia (dwell): segundos observados calculados con el FPS real.
- Interacción inferida: proximidad + baja velocidad + tiempo mínimo; no confirma contacto.
- Pickups: tomas probables de producto (solo en modo avanzado y con pose).
- Presencias rastreadas: tracks ByteTrack con al menos 2 segundos; puede sobre-contar si un track se fragmenta.
- Zonas: hot (congestión), normal, cold (sin actividad).
- Modelo: yolo11n / yolo11n-pose con ByteTrack.

REGLA DE ORO:
- Si el usuario pregunta por cifras, recomendaciones o góndolas y SOLO tienes ESTADO_DEL_ANALISIS, no inventes números: responde que el análisis todavía se está procesando, da la etapa actual y el porcentaje de progreso que aparecen en el bloque, y sugiere esperar un momento y volver a preguntar.
- Si el usuario pregunta por cifras y no recibiste ni INFORMACION_DEL_INFORME ni ESTADO_DEL_ANALISIS, responde que todavía no hay un análisis cargado para esa sede y sugiere subir un video o seleccionar una sede.
- Si recibiste INFORMACION_DEL_INFORME, responde con esos datos exactos y con calma.

PREGUNTAS SOBRE EL PROCESO (fundamentales para esta app):
- Cuando te pregunten "¿cómo va el análisis?" o "¿cuánto falta?", mira si recibiste ESTADO_DEL_ANALISIS. Si lo tienes, responde con la etapa legible, el porcentaje y el mensaje del servidor, en una o dos frases cortas.
- Si el usuario pregunta algo y el análisis acaba de terminar, es posible que el contexto sea de un análisis anterior: menciónalo si es evidente.

ESTILO DE RESPUESTA (muy importante):
- Hablás con dueños o encargados de tienda, no con programadores ni científicos de datos. Nada de jerga técnica sin explicarla.
- Frases cortas y directas. Un párrafo corto o una lista, nunca ambas para lo mismo.
- Si necesitás nombrar un término técnico (tracking, homografía, ByteTrack, YOLO, dwell, etc.), traducilo a la vez a lenguaje simple entre paréntesis o en la misma frase. Ejemplo: "el tráfico (cuántas personas pasaron cerca)".
- Preferí ejemplos concretos y cotidianos por sobre definiciones abstractas.
- Máximo 4-6 líneas por respuesta salvo que el usuario pida explícitamente más detalle.
- Nunca respondas solo con una lista de puntos sueltos sin una frase que los introduzca o los cierre.
"""


class ChatTurn(BaseModel):
    role: str = Field(..., description="Rol del turno: user | model")
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    site_id: int | None = None
    analysis_id: str | None = Field(
        default=None,
        max_length=64,
        description="Id del análisis en curso (para responder con su progreso real).",
    )
    history: list[ChatTurn] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    report_context: bool = False
    analysis_id: str | None = None
    status: str | None = None
    stage: str | None = None
    progress: int | None = None


def _stamp_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _stage_label(stage: str | None) -> str:
    return STAGE_LABELS.get(stage or "", stage or "procesando")


def build_report_context(analysis: Analysis) -> str:
    """Resumen compacto del informe para dárselo al modelo como contexto."""
    result: dict[str, Any] = analysis.result or {}
    lines: list[str] = [
        "INFORMACION_DEL_INFORME (datos reales del último análisis):",
        f"- Sede: {result.get('site', {}).get('name', '?')} ({result.get('site', {}).get('city', '?')})",
        f"- Análisis: {analysis.id} · modo {result.get('analysis_mode', '?')} · coordenadas {result.get('coordinate_system', '?')}",
        f"- Video: {result.get('video', {}).get('duration_seconds', '?')} s, {result.get('video', {}).get('total_frames', '?')} frames",
        f"- Métricas: tracked_presences={result.get('metrics', {}).get('tracked_presences', '?')}, "
        f"interactions={result.get('metrics', {}).get('interaction_events', '?')}, "
        f"pickups={result.get('metrics', {}).get('pickup_events', '?')}, "
        f"flow_per_minute={result.get('metrics', {}).get('flow_per_minute', '?')}, "
        f"avg_speed_m_s={result.get('metrics', {}).get('average_speed_m_s', '?')}",
    ]

    gondolas = result.get("gondolas", [])
    if gondolas:
        lines.append("- Góndolas:")
        for gondola in gondolas:
            lines.append(
                f"  · {gondola.get('name', '?')}: traffic={gondola.get('traffic', '?')}, "
                f"dwell_seconds={gondola.get('dwell_seconds', '?')}, "
                f"interactions={gondola.get('interactions', '?')}, pickups={gondola.get('pickups', 0)}"
            )
    else:
        lines.append("- Góndolas: ninguna definida para esta sede.")

    zones = result.get("zones", [])
    if zones:
        lines.append("- Zonas:")
        for zone in zones:
            lines.append(
                f"  · {zone.get('name', '?')}: classification={zone.get('classification', '?')}, "
                f"visits={zone.get('visits', '?')}, dwell_seconds={zone.get('dwell_seconds', '?')}, "
                f"heat_index={zone.get('heat_index', '?')}"
            )

    recommendations = result.get("recommendations") or result.get("findings") or []
    if recommendations:
        lines.append("- Recomendaciones:")
        for item in recommendations:
            if item.get("type", "recommendation") == "recommendation":
                lines.append(f"  · {item.get('title', '?')}: {item.get('detail', '')}")
    else:
        lines.append("- Recomendaciones: no hay recomendaciones generadas.")

    return "\n".join(lines)


def build_progress_context(analysis: Analysis) -> str:
    """Contexto para un análisis que todavía se está procesando."""
    started = _stamp_utc(analysis.created_at) or "?"
    return "\n".join(
        [
            "ESTADO_DEL_ANALISIS (un análisis se está procesando en esta sede):",
            f"- Análisis: {analysis.id} · archivo: {analysis.filename}",
            f"- Etapa: {_stage_label(analysis.stage)} ({analysis.stage or 'procesando'})",
            f"- Progreso: {analysis.progress}%",
            f"- Mensaje del servidor: {analysis.message or 'Procesando...'}",
            f"- Iniciado: {started}",
        ]
    )


def build_no_analysis_context(site_name: str) -> str:
    """Contexto usado cuando la sede todavía no tiene ningún análisis."""
    return (
        "INFORMACION_DEL_INFORME (datos reales del último análisis):\n"
        f"- Sede: {site_name or '?'}.\n"
        "- Todavía no hay ningún análisis completado ni en curso para esta sede. "
        "No hay métricas ni progreso que reportar todavía."
    )


def _resolve_analysis(
    user: User,
    site_id: int,
    analysis_id: str | None,
    database: Session,
) -> tuple[Analysis | None, bool]:
    """Devuelve el análisis más relevante de la sede, sin filtrar por estado.

    Prioridad:
      1. ``analysis_id`` si pertenece a la sede (el job en ejecución).
      2. El análisis más reciente de la sede (cualquier estado).

    Lanza 403/404 si la sede no existe o el usuario no tiene acceso.
    """
    site = site_or_403(user, site_id, database)
    if analysis_id:
        analysis = database.get(Analysis, analysis_id)
        if analysis and analysis.site_id == site.id:
            return analysis, True
    latest = database.scalars(
        select(Analysis)
        .where(Analysis.site_id == site.id)
        .order_by(Analysis.created_at.desc(), Analysis.id.desc())
        .limit(1)
    ).first()
    return latest, True


def _build_context(
    user: User,
    payload: ChatRequest,
    database: Session,
) -> tuple[str | None, bool, Analysis | None]:
    """Compone el bloque de contexto + el prompt del sistema según el estado."""
    if payload.site_id is None:
        return SYSTEM_PROMPT, False, None

    analysis, _ = _resolve_analysis(user, payload.site_id, payload.analysis_id, database)
    context_used = True
    site = site_or_403(user, payload.site_id, database)
    if analysis is None:
        block = build_no_analysis_context(site.name)
    elif (
        analysis.status in IN_PROGRESS_STATUSES
        or analysis.status not in {"completed", "failed"}
    ):
        block = build_progress_context(analysis)
    elif analysis.status == "failed" or not analysis.result:
        block = build_no_analysis_context(site.name)
    else:
        block = build_report_context(analysis)

    prompt = f"{SYSTEM_PROMPT}\n\n{block}"
    return prompt, context_used, analysis


def _progress_info(analysis: Analysis | None) -> dict:
    if analysis is None:
        return {"analysis_id": None, "status": None, "stage": None, "progress": None}
    return {
        "analysis_id": analysis.id,
        "status": analysis.status,
        "stage": analysis.stage,
        "progress": analysis.progress,
    }


def _messages_from(payload: ChatRequest) -> list[dict]:
    messages = [
        {"role": turn.role if turn.role in VALID_ROLES else "user", "content": turn.content}
        for turn in (payload.history or [])[-MAX_HISTORY_TURNS:]
    ]
    messages.append({"role": "user", "content": payload.message})
    return messages


def _ask_gemini(system_prompt: str, messages: list[dict]) -> str:
    """Llama a Gemini probando el modelo configurado y, si falla, los alternativos.

    Se mantiene aislada para poder mockearla en tests.
    """
    from google import genai
    from google.genai import types

    client = genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options=types.HttpOptions(
            timeout=45_000,
            retry_options=types.HttpRetryOptions(attempts=2),
        ),
    )
    contents = [
        types.Content(
            role=turn["role"] if turn["role"] in VALID_ROLES else "user",
            parts=[types.Part(text=turn["content"])],
        )
        for turn in messages
    ]
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.4,
    )

    candidates = [settings.GEMINI_MODEL, *settings.GEMINI_FALLBACK_MODELS]
    last_error: Exception | None = None
    for model in candidates:
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            text = (response.text or "").strip()
            if text:
                return text
        except Exception as exc:
            last_error = exc
            logger.warning("Gemini con modelo %s falló: %s", model, exc)
    if last_error is not None:
        raise last_error
    return ""


def _stream_gemini(system_prompt: str, messages: list[dict]) -> Iterator[str]:
    """Streaming de Gemini token a token. Aislada para poder mockearla en tests."""
    from google import genai
    from google.genai import types

    client = genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options=types.HttpOptions(
            timeout=45_000,
            retry_options=types.HttpRetryOptions(attempts=2),
        ),
    )
    contents = [
        types.Content(
            role=turn["role"] if turn["role"] in VALID_ROLES else "user",
            parts=[types.Part(text=turn["content"])],
        )
        for turn in messages
    ]
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.4,
    )

    candidates = [settings.GEMINI_MODEL, *settings.GEMINI_FALLBACK_MODELS]
    last_error: Exception | None = None
    for model in candidates:
        try:
            stream = client.models.generate_content_stream(
                model=model,
                contents=contents,
                config=config,
            )
            yielded = False
            for chunk in stream:
                piece = (getattr(chunk, "text", None) or "")
                if piece:
                    yielded = True
                    yield piece
            if not yielded:
                raise RuntimeError(f"Gemini devolvió una respuesta vacía con {model}")
            return
        except Exception as exc:
            last_error = exc
            logger.warning("Gemini stream con modelo %s falló: %s", model, exc)
    if last_error is not None:
        raise last_error


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> ChatResponse:
    system_prompt, context_used, analysis = _build_context(user, payload, database)
    info = _progress_info(analysis)

    if not settings.GEMINI_API_KEY:
        return ChatResponse(reply=NO_KEY_REPLY, report_context=context_used, **info)

    messages = _messages_from(payload)

    try:
        reply = _ask_gemini(system_prompt, messages)
    except Exception:
        logger.exception("Gemini call failed")
        return ChatResponse(reply=UNAVAILABLE_REPLY, report_context=context_used, **info)

    if not reply:
        reply = UNAVAILABLE_REPLY
    return ChatResponse(reply=reply, report_context=context_used, **info)


@router.post("/stream")
def chat_stream(
    payload: ChatRequest,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> StreamingResponse:
    """Igual que POST /api/chat pero en streaming SSE (token a token).

    Emite eventos ``data: {"type":"delta","delta":"..."}`` y al final
    ``data: {"type":"done"}`` (o ``{"type":"error"}`` si algo falló).
    """
    system_prompt, _context_used, analysis = _build_context(user, payload, database)

    if not settings.GEMINI_API_KEY:
        def setup_stream():
            yield _sse({"type": "delta", "delta": NO_KEY_REPLY})
            yield _sse({"type": "done"})
        return StreamingResponse(setup_stream(), media_type="text/event-stream")

    messages = _messages_from(payload)

    def event_stream():
        try:
            for delta in _stream_gemini(system_prompt, messages):
                if delta:
                    yield _sse({"type": "delta", "delta": delta})
            yield _sse({"type": "done"})
        except Exception:
            logger.exception("Gemini stream failed")
            yield _sse({"type": "delta", "delta": UNAVAILABLE_REPLY})
            yield _sse({"type": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )