from __future__ import annotations

import math
from pathlib import Path

import cv2

from ..cv.spatial import SpatialEngine
from .layout_suggestion import suggest_gondolas_from_frame

# Grosor típico de una góndola de retail cuando no se puede derivar de la
# imagen (una sola vista 2D solo revela el borde frontal visible, nunca el
# grosor real del mueble). Se documenta explícitamente en la respuesta para
# que quede claro que es un supuesto, no una medición.
DEFAULT_THICKNESS_METERS = 0.6


def project_suggestion_to_meters(item: dict, engine: SpatialEngine, frame_width: int, frame_height: int) -> dict | None:
    """Proyecta una sugerencia normalizada (0-1, coordenadas de imagen) a
    metros reales de piso usando la homografía del sitio.

    Usa el campo "orientacion" que Claude ya juzga viendo la imagen
    ("frontal" o "lateral") en vez de adivinar por geometría de la
    proyección: con una homografía no calibrada, una línea horizontal en
    la imagen casi siempre se proyecta mayormente en X del piso sin
    importar la orientación real del mueble en 3D, así que la heurística
    geométrica no es confiable. El eje que no se puede medir directamente
    se asume con DEFAULT_THICKNESS_METERS.

    Devuelve None si el punto cae fuera del área calibrada.
    """
    x0 = item["x"] * frame_width
    x1 = (item["x"] + item["width"]) * frame_width
    y0 = item["y"] * frame_height
    y1 = (item["y"] + item["height"]) * frame_height
    orientation = item.get("orientacion", "frontal")

    if orientation == "lateral":
        top = engine.project([x0, y0])
        bottom = engine.project([x0, y1])
        if top is None or bottom is None:
            return None
        depth_m = math.hypot(bottom[0] - top[0], bottom[1] - top[1])
        return {
            "x": round(min(top[0], bottom[0]), 2),
            "z": round(min(top[1], bottom[1]), 2),
            "width": DEFAULT_THICKNESS_METERS,
            "depth": round(max(depth_m, 0.3), 2),
        }

    left = engine.project([x0, y1])
    right = engine.project([x1, y1])
    if left is None or right is None:
        return None
    width_m = math.hypot(right[0] - left[0], right[1] - left[1])
    return {
        "x": round(min(left[0], right[0]), 2),
        "z": round(min(left[1], right[1]), 2),
        "width": round(max(width_m, 0.3), 2),
        "depth": DEFAULT_THICKNESS_METERS,
    }

def suggest_gondolas_in_meters(frame_path: Path, site_configuration: dict) -> dict:
    """Toma la sugerencia visual de UN frame y la proyecta a metros reales.
    Se mantiene por compatibilidad con el endpoint de depuración de anoche;
    para la estructura completa (varios frames + productos + filtro de
    zonas de acceso) usar app.ai.layout_builder.suggest_full_layout."""
    raw = suggest_gondolas_from_frame(frame_path)

    image = cv2.imread(str(frame_path))
    if image is None:
        raise RuntimeError(f"No se pudo leer la imagen {frame_path.name} para mapear a metros")
    frame_height, frame_width = image.shape[:2]

    engine = SpatialEngine(site_configuration, frame_width, frame_height)

    mapped = []
    for item in raw.get("gondolas_sugeridas", []):
        meters = project_suggestion_to_meters(item, engine, frame_width, frame_height)
        if meters is None:
            mapped.append({
                **item,
                "mapeo_metros": None,
                "advertencia": "Cae fuera del área calibrada del piso; ajustar manualmente en el editor",
            })
            continue
        mapped.append({**item, "mapeo_metros": meters})

    return {"gondolas_sugeridas": mapped, "unidades": "metros", "frame_usado": frame_path.name}