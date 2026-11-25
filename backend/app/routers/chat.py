"""Asistente conversacional de SCAPDER.

Responde en español usando Google Gemini. Su rol es doble:
  1. Guiar al usuario para usar el programa (flujo y métricas).
  2. Explicar el informe de la sede: si llega ``site_id``, inyectamos un
     resumen compacto del último ``Analysis.result`` como contexto, de modo
     que el bot solo hable con datos reales y nunca invente cifras.

Sin ``GEMINI_API_KEY`` configurada responde un mensaje de configuración en
lugar de fallar, para que la demo nunca se rompa.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Analysis, User
from ..security import current_user
from .analytics import latest_analysis, site_or_403

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)

MAX_HISTORY_TURNS = 10
VALID_ROLES = {"user", "model"}

NO_KEY_REPLY = (
    "Todavía no puedo responderte: falta configurar la clave de Gemini en el backend. "
    "Pide al administrador que defina la variable de entorno GEMINI_API_KEY y reinicie el servidor."
)

UNAVAILABLE_REPLY = (
    "No pude conectarme con el asistente en este momento (el servicio de Gemini está saturado o no respondió). "
    "Probá de nuevo en unos segundos."
)

SYSTEM_PROMPT = """Eres el asistente de SCAPDER, una plataforma de retail analytics que analiza videos de tiendas con visión por computadora (detección de personas YOLO, tracking ByteTrack y proyección al piso en metros con homografía).

Tu rol es doble:
1) Ayudar al usuario a usar el programa paso a paso.
2) Explicar el informe de análisis de la sede usando ÚNICAMENTE el contexto que recibes marcado como INFORMACION_DEL_INFORME. Nunca inventes métricas, góndolas ni recomendaciones que no aparezcan en ese contexto.

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

REGLA DE ORO: si el usuario pregunta por cifras, recomendaciones o góndolas y no tienes la INFORMACION_DEL_INFORME, responde que no tienes un análisis cargado para esa sede y sugiere subir un video o seleccionar una sede.

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
    history: list[ChatTurn] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    report_context: bool = False


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


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> ChatResponse:
    context_used = False
    if payload.site_id is not None:
        site = site_or_403(user, payload.site_id, database)
        analysis = latest_analysis(user, site.id, database)
        report_context = build_report_context(analysis)
        context_used = True
    else:
        report_context = ""

    system_prompt = SYSTEM_PROMPT
    if report_context:
        system_prompt = f"{system_prompt}\n\n{report_context}"

    if not settings.GEMINI_API_KEY:
        return ChatResponse(reply=NO_KEY_REPLY, report_context=context_used)

    messages = [
        {"role": turn.role if turn.role in VALID_ROLES else "user", "content": turn.content}
        for turn in (payload.history or [])[-MAX_HISTORY_TURNS:]
    ]
    messages.append({"role": "user", "content": payload.message})

    try:
        reply = _ask_gemini(system_prompt, messages)
    except Exception:
        logger.exception("Gemini call failed")
        return ChatResponse(reply=UNAVAILABLE_REPLY, report_context=context_used)

    if not reply:
        reply = UNAVAILABLE_REPLY
    return ChatResponse(reply=reply, report_context=context_used)