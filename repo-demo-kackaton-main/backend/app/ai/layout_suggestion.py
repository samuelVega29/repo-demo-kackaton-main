from __future__ import annotations

import base64
import json
import os
from pathlib import Path

from anthropic import Anthropic

MODEL_NAME = os.getenv("SCAPDER_INSIGHTS_MODEL", "claude-sonnet-4-6")

SYSTEM_PROMPT = """Eres un arquitecto de retail experto en diseño de tiendas.
Vas a recibir una imagen tomada por una cámara de vigilancia de un pasillo o
sección de una tienda. Tu tarea es identificar las góndolas/estantes/exhibidores
visibles en la imagen y sugerir sus posiciones aproximadas para que un humano
las confirme o ajuste después en un editor visual (no es la ubicación final,
es solo una sugerencia inicial que ahorra trabajo manual).

Usa un sistema de coordenadas normalizado: x=0 es el borde izquierdo de la
imagen, x=1 el derecho; y=0 el borde superior, y=1 el inferior. Cada góndola
se describe con un rectángulo aproximado (x, y = esquina superior izquierda;
width, height = ancho y alto), todo en escala 0-1.

Si la perspectiva de la cámara dificulta estimar bien una zona, dilo en el
campo "confianza" en vez de inventar una posición precisa.

Indica también la orientación real del mueble en el espacio 3D: "frontal" si
el frente/ancho de la góndola mira hacia la cámara (se ve su ancho de
frente), o "lateral" si la góndola se ve de perfil o se aleja de la cámara
(se ve su lado angosto, típico de estanterías pegadas a la pared vistas en
ángulo). Esto es clave para no confundir el ancho real con el fondo real.


Responde ÚNICAMENTE con un JSON (sin texto antes o después, sin bloques de
código markdown) con esta forma exacta:
{
  "gondolas_sugeridas": [
    {
      "nombre_sugerido": "categoría breve del producto visible, ej. 'Snacks'",
      "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0,
      "orientacion": "frontal | lateral",
      "confianza": "alta | media | baja",
      "nota": "breve justificación de qué se ve ahí"
    }
  ]
}
Incluye solo góndolas/estantes reales y claramente distinguibles en la imagen,
no inventes más de las que realmente se ven."""


def _load_image_as_base64(path: Path) -> tuple[str, str]:
    media_type = "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    data = base64.standard_b64encode(path.read_bytes()).decode("utf-8")
    return data, media_type


def suggest_gondolas_from_frame(frame_path: Path) -> dict:
    """Manda un frame ya extraído del video a Claude Vision y devuelve
    posiciones sugeridas de góndolas en coordenadas normalizadas 0-1.

    Lanza RuntimeError con mensaje entendible si falta la API key, si el
    archivo no existe, o si la respuesta no pudo interpretarse como JSON.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("Falta configurar ANTHROPIC_API_KEY en el entorno del backend")
    if not frame_path.exists():
        raise RuntimeError(f"No se encontró el frame {frame_path.name} para analizar")

    image_data, media_type = _load_image_as_base64(frame_path)

    client = Anthropic(api_key=api_key)
    message = client.messages.create(
        model=MODEL_NAME,
        max_tokens=1500,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": image_data},
                    },
                    {
                        "type": "text",
                        "text": "Identifica las góndolas visibles en esta imagen y sugiere sus posiciones.",
                    },
                ],
            }
        ],
    )

    text = "".join(block.text for block in message.content if getattr(block, "type", None) == "text").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
        raise RuntimeError(
            f"Claude no devolvió un JSON válido para las góndolas sugeridas. Respuesta cruda: {text[:300]}"
        )