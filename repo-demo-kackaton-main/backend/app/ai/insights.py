from __future__ import annotations

import base64
import json
import os
from pathlib import Path

from anthropic import Anthropic

# Modelo Claude a usar para razonar sobre los resultados ya calculados por el
# pipeline de visión (nunca sobre el video crudo: eso sigue siendo trabajo de
# YOLO/ByteTrack en app/cv/). Se puede sobreescribir con una variable de
# entorno si el equipo prefiere otro tier.
MODEL_NAME = os.getenv("SCAPDER_INSIGHTS_MODEL", "claude-sonnet-4-6")

SYSTEM_PROMPT = """Eres un consultor senior de retail y space management.
Recibes DOS tipos de evidencia sobre góndolas de una tienda:

1. Métricas YA MEDIDAS por un sistema de visión computacional (tráfico,
   permanencia/dwell, tasa de interacción pick-up/put-back por segmento).
2. Frames reales del video, cada uno etiquetado con su número (ej. "frame_3").

Usa ambas fuentes: las métricas para fundamentar cifras exactas, y los
frames para describir brevemente qué se observa (ej. "en el frame_3 se ve a
un cliente frente a la góndola de Bebidas"). Cuando cites un frame, usa
SIEMPRE su nombre exacto tal como aparece etiquetado (ej. "frame_5"), nunca
inventes un número de frame que no se te haya mostrado.

Nunca inventes cifras que no estén en los datos recibidos: toda afirmación
numérica debe poder rastrearse a un campo del JSON de entrada. El sistema no
identifica personas, no usa biometría ni reconoce rostros ni emociones
(privacidad por diseño, Ley 1581 de 2012 en Colombia); no describas ni
propongas nada que dependa de identificar a alguien — describe solo
comportamiento general y anónimo (ej. "un cliente se detiene", nunca
características de la persona).

Responde ÚNICAMENTE con un objeto JSON (sin texto antes o después, sin
bloques de código markdown) con esta forma exacta:
{
  "hallazgo_principal": "una frase con la cifra exacta que la respalda",
  "recomendaciones": [
    {
      "titulo": "acción concreta y corta",
      "justificacion": "por qué, citando los números de origen",
      "evidencia_visual": "qué frame(s) respaldan esto y qué se observa ahí, ej. 'frame_2: cliente se detiene frente a la góndola sin tomar producto'. Usa null si ningún frame aplica directamente a esta recomendación.",
      "impacto_estimado": "rango cualitativo/cuantitativo conservador, ej. '+10-15% interacción esperada'"
    }
  ],
  "resumen_ejecutivo": "3 líneas máximo, lenguaje para un gerente de tienda sin jerga técnica"
}
Incluye entre 1 y 3 recomendaciones, priorizadas por impacto. Si los datos
son insuficientes para una recomendación sólida, dilo explícitamente en
"hallazgo_principal" en vez de forzar una conclusión."""


def _build_metrics_summary(result: dict) -> str:
    trimmed = {
        "site": result.get("site", {}).get("name"),
        "video_duration_seconds": result.get("video", {}).get("duration_seconds"),
        "metrics": result.get("metrics", {}),
        "gondolas": [
            {
                "name": g.get("name"),
                "traffic": g.get("traffic"),
                "dwell_seconds": g.get("dwell_seconds"),
                "interactions": g.get("interactions"),
                "product_events": g.get("product_events"),
            }
            for g in result.get("gondolas", [])
        ],
        "zones": [
            {"name": z.get("name"), "dwell_seconds": z.get("dwell_seconds")}
            for z in result.get("zones", [])
        ],
        "calibration_status": result.get("quality", {}).get("calibration"),
        "interaction_confidence": result.get("quality", {}).get("interaction"),
    }
    return json.dumps(trimmed, ensure_ascii=False)


def _load_evidence_images(frame_paths: list[Path]) -> list[dict]:
    """Convierte frames de evidencia ya guardados en bloques de imagen para
    el mensaje a Claude, cada uno precedido por su nombre para que el
    modelo pueda citarlo por nombre exacto en la respuesta."""
    blocks: list[dict] = []
    for path in frame_paths:
        if not path.exists():
            continue
        media_type = "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
        data = base64.standard_b64encode(path.read_bytes()).decode("utf-8")
        blocks.append({"type": "text", "text": f"Imagen etiquetada como: {path.stem}"})
        blocks.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}})
    return blocks


def generate_insights(result: dict, frame_paths: list[Path] | None = None) -> dict:
    """Llama a Claude sobre los resultados ya calculados (y opcionalmente
    los frames de evidencia reales) y devuelve un dict con hallazgo
    principal, recomendaciones accionables con evidencia visual citada, y
    resumen ejecutivo.

    Lanza RuntimeError con un mensaje entendible si falta la API key o si la
    respuesta no pudo interpretarse como JSON, para que el router la
    convierta en un 502/500 claro en vez de un 500 genérico.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("Falta configurar ANTHROPIC_API_KEY en el entorno del backend")

    content = [{"type": "text", "text": _build_metrics_summary(result)}]
    if frame_paths:
        content.extend(_load_evidence_images(frame_paths))

    client = Anthropic(api_key=api_key)
    message = client.messages.create(
        model=MODEL_NAME,
        max_tokens=1400,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )

    text = "".join(block.text for block in message.content if getattr(block, "type", None) == "text").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
        raise RuntimeError(f"Claude no devolvió un JSON válido para los insights. Respuesta cruda: {text[:300]}")

    return parsed