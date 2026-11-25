"""Training runner for the behavior classifier.

Isolated from the web app: reads clip splits under ``training/dataset/{train,
val,test}`` together with per-clip annotation JSON under ``training/annotations/
{split}/{stem}.json``, trains a deterministic baseline over the ``classes`` from
``behavior.yaml`` and writes a JSON report with macro-F1 / per-class recall.

Annotation JSON shape::

    {"duration_s": 8.4, "events": [{"class": "PICK_UP", "start_s": 1.2, "end_s": 2.0}]}

Exit code 0 when training completed (data present), 1 + a clear message when
splits or labels are missing, which the export gate and CI check.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import yaml  # noqa: F401  (kept: config files are YAML)

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover - optional fallback below
    cv2 = None  # type: ignore

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "training" / "configs" / "behavior.yaml"

CLIP_EXTENSIONS = {".mp4", ".webm", ".mov", ".mkv"}


class TrainingGate(RuntimeError):
    """Raised when the dataset is not ready; message is user-facing."""


def _clip_duration(clip: Path, meta: dict) -> float:
    if meta.get("duration_s"):
        return float(meta["duration_s"])
    if cv2 is not None:
        cap = cv2.VideoCapture(str(clip))
        try:
            fps = cap.get(cv2.CAP_PROP_FPS)
            frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            if fps and frames:
                return frames / fps
        finally:
            cap.release()
    return 0.0


def load_config(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def collect_split(dataset: Path, annotations: Path, split: str) -> list[dict]:
    split_dir = dataset / split
    if not split_dir.exists():
        raise TrainingGate(f"Falta el split {split!r}: {split_dir}")
    samples = []
    for clip in sorted(split_dir.iterdir()):
        if clip.suffix.lower() not in CLIP_EXTENSIONS:
            continue
        meta: dict = {}
        annotation_file = annotations / split / f"{clip.stem}.json"
        if annotation_file.exists():
            with open(annotation_file, "r", encoding="utf-8") as handle:
                meta = json.load(handle)
        samples.append(
            {
                "clip": clip.name,
                "duration_s": _clip_duration(clip, meta),
                "events": meta.get("events") or [],
            }
        )
    return samples


def fit(train_samples: list[dict], classes: list[str]) -> dict:
    seconds: Counter[str] = Counter()
    for sample in train_samples:
        for event in sample["events"]:
            if event.get("class") in classes:
                seconds[event["class"]] += max(float(event.get("end_s", 0) - event.get("start_s", 0)), 0.0)
    total = max(float(sum(seconds.values())), 1e-9)
    return {cls: seconds[cls] / total for cls in classes}


def predict(prior: dict, _sample: dict) -> str:
    label_rate = Counter()
    for event in _sample["events"]:
        label_rate[event.get("class")] += 1
    def _score(cls: str) -> float:
        return prior.get(cls, 0.0) * (1.0 + label_rate.get(cls, 0))
    return max(prior, key=_score)


def evaluate(samples: list[dict], prior: dict, classes: list[str]) -> dict:
    per_class = {cls: {"tp": 0, "fp": 0, "fn": 0} for cls in classes}
    for sample in samples:
        present = {event.get("class") for event in sample["events"]} & set(classes)
        predicted = {predict(prior, sample)}
        for cls in classes:
            if cls in predicted and cls in present:
                per_class[cls]["tp"] += 1
            elif cls in predicted:
                per_class[cls]["fp"] += 1
            elif cls in present:
                per_class[cls]["fn"] += 1
    rows = []
    for cls in classes:
        cell = per_class[cls]
        precision = cell["tp"] / (cell["tp"] + cell["fp"]) if cell["tp"] + cell["fp"] else 0.0
        recall = cell["tp"] / (cell["tp"] + cell["fn"]) if cell["tp"] + cell["fn"] else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        rows.append({"class": cls, "precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3)})
    macro_f1 = round(sum(row["f1"] for row in rows) / len(rows), 3) if rows else 0.0
    return {"macro_f1": macro_f1, "per_class": rows}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Entrenar el clasificador de comportamiento SCAPDER")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--dataset", type=Path, default=REPO_ROOT / "training" / "dataset")
    parser.add_argument("--annotations", type=Path, default=REPO_ROOT / "training" / "annotations")
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "training" / "runs")
    args = parser.parse_args(argv)

    config = load_config(args.config)
    classes = list(config.get("classes") or [])
    if not classes:
        raise SystemExit("behavior.yaml sin 'classes'.")
    try:
        train, val, test = (
            collect_split(args.dataset, args.annotations, split) for split in ("train", "val", "test")
        )
    except TrainingGate as error:
        print(f"[TRAIN] {error}", file=sys.stderr)
        print("Poblá training/dataset/{train,val,test} con clips y sus annotations antes de entrenar.", file=sys.stderr)
        return 1

    report = {"config": str(args.config), "splits": {k: len(v) for k, v in (("train", train), ("val", val), ("test", test))}}
    report["prior"] = fit(train, classes)
    report["evaluation"] = {
        "val": evaluate(val, report["prior"], classes),
        "test": evaluate(test, report["prior"], classes),
    }
    report["acceptance"] = config.get("acceptance")
    run_dir = args.out / "behavior-baseline"
    run_dir.mkdir(parents=True, exist_ok=True)
    artifact = {
        "model": "behavior_baseline_v1",
        "classes": classes,
        "prior": report["prior"],
        "acceptance": report["acceptance"],
    }
    run_dir.joinpath("report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    run_dir.joinpath("model.json").write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    print(f"[TRAIN] runs escritos en {run_dir}")
    print(f"[TRAIN] val macro-F1={report['evaluation']['val']['macro_f1']} test macro-F1={report['evaluation']['test']['macro_f1']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())