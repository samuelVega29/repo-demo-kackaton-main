from __future__ import annotations

import json
import math
import os
from pathlib import Path

import cv2
from anthropic import Anthropic

from ..cv.spatial import SpatialEngine
from .layout_mapping import project_suggestion_to_meters
from .layout_suggestion import suggest_gondolas_from_frame

MODEL_NAME = os.getenv("SCAPDER_INSIGHTS_MODEL", "claude-sonnet-4-6")

# Radio en metros dentro del cual dos sugerencias de frames distintos se
# consideran la MISMA góndola por cercanía de centro (vista desde ángulos
# ligeramente distintos del video).
DEDUPE_RADIUS_METERS = 1.2

# Si dos rectángulos sugeridos se traslapan más de este porcentaje de su
# área menor, también se consideran duplicados aunque sus centros estén
# lejos (pasa con formas alargadas mal orientadas).
OVERLAP_MERGE_RATIO = 0.35

# Si una góndola sugerida se solapa con una zona de acceso/entrada más de
# este porcentaje de su propia área, se descarta: no tiene sentido poner
# una góndola sobre el pasillo de entrada.
ACCESS_OVERLAP_RATIO = 0.3
ACCESS_KEYWORDS = ("acceso", "entrance", "entrada", "access")

CONFIDENCE_RANK = {"alta": 3, "media": 2, "baja": 1}

PRODUCTS_SYSTEM_PROMPT = """Eres un consultor de retail armando el planograma
de una góndola de tienda. Dado el nombre/categoría de una góndola, sugiere una
grilla de 3x3 (filas: Superior, Media, Inferior; columnas: Izquierda, Centro,
Derecha) con nombres de subcategorías de producto típicas y realistas para esa
góndola, en español, cortas (2-3 palabras cada una).

Responde ÚNICAMENTE con un JSON (sin texto antes o después, sin bloques de
código markdown) con esta forma exacta:
{
  "segments": {"rows": ["Superior", "Media", "Inferior"], "columns": ["Izquierda", "Centro", "Derecha"]},
  "products": [["...", "...", "..."], ["...", "...", "..."], ["...", "...", "..."]]
}"""


def _center(gondola_meters: dict) -> tuple[float, float]:
    return (
        gondola_meters["x"] + gondola_meters["width"] / 2,
        gondola_meters["z"] + gondola_meters.get("depth", 0.6) / 2,
    )


def _rect_overlap_ratio(a: dict, b: dict) -> float:
    """Devuelve qué fracción del área del rectángulo MÁS PEQUEÑO está
    cubierta por el traslape con el otro. 0 = no se tocan, 1 = uno contiene
    al otro por completo."""
    ax0, ax1 = a["x"], a["x"] + a["width"]
    az0, az1 = a["z"], a["z"] + a["depth"]
    bx0, bx1 = b["x"], b["x"] + b["width"]
    bz0, bz1 = b["z"], b["z"] + b["depth"]
    overlap_x = max(0.0, min(ax1, bx1) - max(ax0, bx0))
    overlap_z = max(0.0, min(az1, bz1) - max(az0, bz0))
    overlap_area = overlap_x * overlap_z
    if overlap_area <= 0:
        return 0.0
    area_a = max(a["width"] * a["depth"], 0.01)
    area_b = max(b["width"] * b["depth"], 0.01)
    return overlap_area / min(area_a, area_b)


def _is_access_zone(zone: dict) -> bool:
    text = f"{zone.get('id', '')} {zone.get('name', '')}".lower()
    return any(keyword in text for keyword in ACCESS_KEYWORDS)


def _overlaps_access_zone(gondola_meters: dict, zones: list[dict]) -> bool:
    gx0, gx1 = gondola_meters["x"], gondola_meters["x"] + gondola_meters["width"]
    gz0, gz1 = gondola_meters["z"], gondola_meters["z"] + gondola_meters["depth"]
    gondola_area = max(gondola_meters["width"] * gondola_meters["depth"], 0.01)
    for zone in zones:
        if not _is_access_zone(zone):
            continue
        xs = [p[0] for p in zone.get("polygon", [])]
        zs = [p[1] for p in zone.get("polygon", [])]
        if not xs or not zs:
            continue
        overlap_x = max(0.0, min(gx1, max(xs)) - max(gx0, min(xs)))
        overlap_z = max(0.0, min(gz1, max(zs)) - max(gz0, min(zs)))
        if (overlap_x * overlap_z) / gondola_area >= ACCESS_OVERLAP_RATIO:
            return True
    return False


def _merge_duplicates(candidates: list[dict]) -> list[dict]:
    """Agrupa sugerencias que son la MISMA góndola vista en frames distintos:
    o bien sus centros están cerca, o bien sus rectángulos se traslapan
    significativamente (formas alargadas con centros lejanos). Se queda con
    la de mayor confianza de cada grupo."""
    accepted: list[dict] = []
    for candidate in candidates:
        cx, cz = _center(candidate["mapeo_metros"])
        match = None
        for existing in accepted:
            ex, ez = _center(existing["mapeo_metros"])
            close_centers = math.hypot(cx - ex, cz - ez) <= DEDUPE_RADIUS_METERS
            overlapping = _rect_overlap_ratio(candidate["mapeo_metros"], existing["mapeo_metros"]) >= OVERLAP_MERGE_RATIO
            if close_centers or overlapping:
                match = existing
                break
        if match is None:
            accepted.append(candidate)
            continue
        existing_rank = CONFIDENCE_RANK.get(match.get("confianza", "baja"), 1)
        candidate_rank = CONFIDENCE_RANK.get(candidate.get("confianza", "baja"), 1)
        if candidate_rank > existing_rank:
            accepted[accepted.index(match)] = candidate
    return accepted


def _suggest_products_grid(nombre: str) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("Falta configurar ANTHROPIC_API_KEY en el entorno del backend")

    client = Anthropic(api_key=api_key)
    message = client.messages.create(
        model=MODEL_NAME,
        max_tokens=500,
        system=PRODUCTS_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Góndola: {nombre}"}],
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
        return {
            "segments": {"rows": ["Superior", "Media", "Inferior"], "columns": ["Izquierda", "Centro", "Derecha"]},
            "products": [["", "", ""], ["", "", ""], ["", "", ""]],
        }


def suggest_full_layout(frame_paths: list[Path], site_configuration: dict) -> dict:
    """Combina sugerencias de varios frames del mismo video en una sola
    estructura de góndolas, en el mismo formato que usa el editor manual
    (id, name, x, z, width, depth, segments, products), lista para prellenar
    la pantalla de configuración de la sede."""
    if not frame_paths:
        raise RuntimeError("No se recibió ningún frame para analizar")

    all_candidates: list[dict] = []
    warnings: list[str] = []

    for frame_path in frame_paths:
        if not frame_path.exists():
            warnings.append(f"Frame {frame_path.name} no encontrado, se omitió")
            continue

        image = cv2.imread(str(frame_path))
        if image is None:
            warnings.append(f"No se pudo leer {frame_path.name}, se omitió")
            continue
        frame_height, frame_width = image.shape[:2]
        engine = SpatialEngine(site_configuration, frame_width, frame_height)

        raw = suggest_gondolas_from_frame(frame_path)
        for item in raw.get("gondolas_sugeridas", []):
            meters = project_suggestion_to_meters(item, engine, frame_width, frame_height)
            if meters is None:
                warnings.append(
                    f"'{item.get('nombre_sugerido', '?')}' en {frame_path.name} cae fuera del área calibrada, se omitió"
                )
                continue
            if _overlaps_access_zone(meters, site_configuration.get("zones", [])):
                warnings.append(
                    f"'{item.get('nombre_sugerido', '?')}' en {frame_path.name} cae sobre una zona de acceso/entrada, se omitió"
                )
                continue
            all_candidates.append({**item, "mapeo_metros": meters, "frame_origen": frame_path.name})

    merged = _merge_duplicates(all_candidates)

    gondolas = []
    for index, item in enumerate(merged, start=1):
        products = _suggest_products_grid(item.get("nombre_sugerido", "Góndola"))
        gondolas.append({
            "id": f"g{index}",
            "name": item.get("nombre_sugerido", f"Góndola {index}"),
            "x": item["mapeo_metros"]["x"],
            "z": item["mapeo_metros"]["z"],
            "width": item["mapeo_metros"]["width"],
            "depth": item["mapeo_metros"]["depth"],
            "segments": products["segments"],
            "products": products["products"],
            "confianza": item.get("confianza", "media"),
            "origen": "ia_sugerida",
            "nota": item.get("nota", ""),
        })

    return {
        "gondolas": gondolas,
        "frames_analizados": [p.name for p in frame_paths],
        "advertencias": warnings,
    }