"""Regresión real: re-corre un análisis existente con el código actual (corregido)
y muestra el antes/después de pickups/interacciones por góndola.

No toca el análisis original: crea una copia con ID nuevo, la corre con run_analysis
(bloqueante, YOLO en CPU tarda varios minutos por video) y compara el `result`
guardado original contra el resultado recién calculado.

Uso (desde backend/):
    python scripts/regression_replay.py  <analysis_id_original>
    python scripts/regression_replay.py  --list
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.database import SessionLocal  # noqa: E402
from app.cv.pipeline import run_analysis  # noqa: E402
from app.models import Analysis  # noqa: E402


def summarize(result: dict | None, analysis_id: str) -> dict:
    plain = {"analysis_id": analysis_id, "gondolas": []}
    if not result:
        return {**plain, "note": "Sin resultado"}
    for g in result.get("gondolas", []):
        plain["gondolas"].append(
            {
                "id": g["id"],
                "name": g["name"],
                "visitors": g["visitors"],
                "interactions": g["interactions"],
                "pickups": g["pickups"],
                "pickup_ratio_percent": g.get("pickup_ratio_percent"),
                "pickup_events": len(g.get("pickup_events", [])),
            }
        )
    return plain


def fmt_delta(before: Any, after: Any) -> str:
    try:
        return f"{before} -> {after}"
    except Exception:
        return f"{before} -> {after}"


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "-h"):
        print(__doc__)
        return 2

    if sys.argv[1] == "--list":
        with SessionLocal() as db:
            for a in db.query(Analysis).order_by(Analysis.created_at.desc()).all():
                meta = summarize(a.result, a.id)
                tind = ", ".join(f"{g['id']}:P{g['pickups']}/I{g['interactions']}" for g in meta["gondolas"])
                print(f"{a.id[:12]}  {a.filename:<22} status={a.status:<10} {tind}")
        return 0

    source_id = sys.argv[1]
    with SessionLocal() as db:
        src = db.get(Analysis, source_id)
        if not src or not src.result:
            print(f"Análisis {source_id} no existe o sin resultado.")
            return 2
        video_path = Path(src.video_path)
        if not video_path.exists():
            print(f"Video no encontrado: {video_path}")
            return 2

        before = summarize(src.result, src.id)
        # Usar la misma configuración (layout de góndolas) con la que se corrió el
        # análisis original, para comparar manzanas con manzanas aunque el site haya
        # cambiado de planograma desde entonces.
        original_config = (src.result.get("site") or {}).get("configuration")
        new_id = "fgx" + source_id[-37:]
        copy = Analysis(
            id=new_id,
            site_id=src.site_id,
            user_id=src.user_id,
            filename=f"[replay] {src.filename}",
            video_path=str(video_path),
            status="queued",
            stage="upload",
            progress=0,
            message="Regresión: re-corriendo con lógica corregida",
        )
        db.add(copy)
        db.commit()
        print(f"Corriendo {src.filename} -> {new_id} ...")

    run_analysis(new_id, configuration=original_config, site_id=src.site_id)

    with SessionLocal() as db:
        after = None
        copy = db.get(Analysis, new_id)
        after = summarize(copy.result if copy else None, new_id)
        if copy and copy.status != "completed":
            print(f"  status={copy.status}: {copy.message}")

    print("\n=== DIFF pickups/interacciones por góndola ===")
    before_by = {g["id"]: g for g in before["gondolas"]}
    print(f"{'GONDOLA':<22}{'visitors':>10}{'interactions':>14}{'pickups':>10}{'ratio%':>10}")
    for g in after["gondolas"]:
        b = before_by.get(g["id"], {})
        print(f"{g['name']:<22}{fmt_delta(b.get('visitors'), g['visitors']):>10}"
              f"{fmt_delta(b.get('interactions'), g['interactions']):>14}"
              f"{fmt_delta(b.get('pickups'), g['pickups']):>10}"
              f"{fmt_delta(b.get('pickup_ratio_percent'), g['pickup_ratio_percent']):>10}")
    print("\nNuevo análisis:", after["analysis_id"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())