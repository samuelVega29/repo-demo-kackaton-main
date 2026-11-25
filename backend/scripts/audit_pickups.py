"""Audit análisis de pick-ups contra falsos positivos.

Recorre los results de la base SQLite y, para cada análisis/góndola, cuantifica
posibles falsos positivos:

1) pickups > interactions  (no debería haber más pick-ups que interacciones si cada
   pick-up requiere una interacción distinta).
2) pick-ups repetidos por el mismo track dentro de una ventana corta / estancia.
3) pick-ups cuya posición (x, z) cae fuera del rectángulo (AABB) de su góndola.

Es de solo lectura: no modifica la base ni el producto.
"""

from __future__ import annotations

import json
import sqlite3
from argparse import ArgumentParser
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "scapder.db"

# Umbral para considerar que dos pick-ups del mismo track son "la misma estancia".
RUNAWAY_SECONDS = 8.0
# Margen (m) para considerar un pick-up dentro del AABB de su góndola.
AABB_MARGIN = 0.5


def point_in_gondola(gondola: dict, x: float, z: float, margin: float = AABB_MARGIN) -> bool:
    return (
        gondola["x"] - margin <= x <= gondola["x"] + gondola["width"] + margin
        and gondola["z"] - margin <= z <= gondola["z"] + gondola["depth"] + margin
    )


def audit_result(aid: str, filename: str, result: dict) -> dict:
    gondolas = result.get("gondolas", [])
    summary = {"analysis": aid[:8], "filename": filename}
    issues = []
    for g in gondolas:
        gid = g["id"]
        pickups = int(g.get("pickups", 0))
        interactions = int(g.get("interactions", 0))
        events = g.get("pickup_events", [])

        # 1) pickups vs interactions
        if interactions == 0 and pickups > 0:
            issues.append(f"{gid}: {pickups} pickups con 0 interacciones")
        elif pickups > interactions:
            issues.append(
                f"{gid}: {pickups} pickups > {interactions} interacciones "
                f"({(pickups / interactions * 100) if interactions else 0:.0f}%)"
            )

        # 2) pickups repetidos por track en una estancia continua
        by_track: dict[int, list[float]] = {}
        for ev in events:
            by_track.setdefault(ev.get("track_id"), []).append(float(ev.get("t", 0)))
        repeated = []
        for tid, times in by_track.items():
            times_sorted = sorted(times)
            runs = 1
            for prev, cur in zip(times_sorted, times_sorted[1:]):
                if cur - prev >= RUNAWAY_SECONDS:
                    runs += 1
            if runs < len(times_sorted):
                repeated.append(f"track {tid}: {len(times_sorted)} picks en {runs} estancia(s)")

        # 3) posiciones fuera del AABB
        outside = 0
        for ev in events:
            if not point_in_gondola(g, float(ev.get("x", 0)), float(ev.get("z", 0))):
                outside += 1
        if outside:
            issues.append(f"{gid}: {outside}/{len(events)} picks fuera del AABB (margen {AABB_MARGIN}m)")

        if repeated:
            issues.append(f"{gid}: picks repetidos por track -> {'; '.join(repeated)}")

    summary["gondolas"] = len(gondolas)
    summary["total_pickups"] = sum(int(g.get("pickups", 0)) for g in gondolas)
    summary["total_interactions"] = sum(int(g.get("interactions", 0)) for g in gondolas)
    summary["issues"] = issues
    return summary


def main() -> None:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Ruta a la base SQLite")
    parser.add_argument(
        "--limit-analyses",
        type=int,
        default=None,
        help="Limitar a los N archivos más recientes (por created_at)",
    )
    args = parser.parse_args()

    connection = sqlite3.connect(args.db)
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        "SELECT id, filename, result FROM analyses ORDER BY created_at DESC"
    ).fetchall()
    if args.limit_analyses:
        rows = rows[: args.limit_analyses]

    print("Auditoría de pick-ups (falsos positivos posibles)\n")
    tot_issues = 0
    for row in rows:
        if not row["result"]:
            print(f"[{row['id'][:8]}] {row['filename']}: (sin result)\n")
            continue
        try:
            result = json.loads(row["result"])
        except json.JSONDecodeError:
            print(f"[{row['id'][:8]}] {row['filename']}: (result no JSON)\n")
            continue
        s = audit_result(row["id"], row["filename"], result)
        print(f"== {s['filename']}  [{s['analysis']}]")
        print(
            f"   pickups={s['total_pickups']} interactions={s['total_interactions']} "
            f"(exceso={max(0, s['total_pickups'] - s['total_interactions'])})"
        )
        if s["issues"]:
            for issue in s["issues"]:
                print(f"   - {issue}")
                tot_issues += 1
        else:
            print("   - Sin indicios de falsos positivos.")
        print()
    print(f"Total indicios de falsos positivos: {tot_issues}")
    connection.close()


if __name__ == "__main__":
    main()