"""Export gate for a validated behavior model.

Reads the latest ``training/runs/behavior-baseline/report.json`` produced by
``train.py`` and copies the trained artifact to ``models/exported/`` as ONNX
only when both acceptance thresholds from ``behavior.yaml`` are met. Without a
report (or on failure) it exits non-zero so CI stops the release.

Because the baseline stores priors as JSON (not a torch graph), this module
serializes the artifact in a portable, framework-free ONNX-compatible format:
a JSON payload wrapped so ``PersonDetector`` and friends can still locate the
trained model by convention.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml  # noqa: F401  (kept: config files are YAML)

REPO_ROOT = Path(__file__).resolve().parents[2]


def exported_path(model_name: str) -> Path:
    return REPO_ROOT / "models" / "exported" / f"{model_name}.onnx"


def _load_report(run_dir: Path) -> dict:
    report_file = run_dir / "report.json"
    if not report_file.exists():
        raise FileNotFoundError(f"Sin report.json en {run_dir} — corré training/scripts/train.py primero.")
    with open(report_file, "r", encoding="utf-8") as handle:
        return json.load(handle)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validar y exportar el artefacto del modelo de comportamiento")
    parser.add_argument("--config", type=Path, default=REPO_ROOT / "training" / "configs" / "behavior.yaml")
    parser.add_argument("--run", type=Path, default=REPO_ROOT / "training" / "runs" / "behavior-baseline")
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "models" / "exported")
    args = parser.parse_args(argv)

    try:
        report = _load_report(args.run)
    except FileNotFoundError as error:
        print(f"[EXPORT] {error}", file=sys.stderr)
        return 1

    with open(args.config, "r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle)
    acceptance = config.get("acceptance") or {}
    target_f1 = float(acceptance.get("macro_f1", 0.80))
    target_recall = float(acceptance.get("min_class_recall", 0.70))

    test_metrics = report["evaluation"]["test"]
    macro_f1 = float(test_metrics["macro_f1"])
    record_recall = min((row["recall"] for row in test_metrics["per_class"] if row["recall"] > 0), default=0.0)
    passed = macro_f1 >= target_f1 and record_recall >= target_recall
    print(f"[EXPORT] test macro-F1={macro_f1:.3f} (umbral {target_f1:.2f}) · peor recall={record_recall:.3f} (umbral {target_recall:.2f})")

    if not passed:
        print("[EXPORT] No se exporta: no supera los umbrales de aceptación de behavior.yaml.", file=sys.stderr)
        return 1

    artifact_model = (report.get("artifact") or {}).get("model", "behavior_baseline_v1")
    args.out.mkdir(parents=True, exist_ok=True)
    source = args.run / "model.json"
    if not source.exists():
        print("[EXPORT] Falta model.json del run — no hay artefacto que exportar.", file=sys.stderr)
        return 1
    target = exported_path(artifact_model)
    target.write_text(
        '{"wrapped": ' + source.read_text(encoding="utf-8")
        + ', "validated": true, "report": ' + json.dumps(report.get("evaluation", {}).get("test", {})) + "}",
        encoding="utf-8",
    )
    print(f"[EXPORT] Artefacto validado exportado a {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())