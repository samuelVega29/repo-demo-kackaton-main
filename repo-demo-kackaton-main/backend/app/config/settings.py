"""Runtime settings for the Scapder backend and training scripts.

Single source of truth for model/dataset/mode output paths and the behavior
thresholds that the tracker and the inference pipeline consume. Values come
from ``training/configs/behavior.yaml`` (committed defaults) and can be
overridden with ``SCAPDER_*`` environment variables.
"""

import os
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


try:
    from dotenv import load_dotenv

    load_dotenv(REPO_ROOT / ".env")
except ModuleNotFoundError:
    _load_env_file(REPO_ROOT / ".env")

BACKEND_ROOT = REPO_ROOT / "backend"
DATA_ROOT = REPO_ROOT / "data"
MEDIA_ROOT = REPO_ROOT / "media"
DATASET_ROOT = Path(os.environ.get("SCAPDER_DATASET", REPO_ROOT / "training" / "dataset"))
ANNOTATIONS_ROOT = Path(os.environ.get("SCAPDER_ANNOTATIONS", REPO_ROOT / "training" / "annotations"))
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_FALLBACK_MODELS = [
    item.strip()
    for item in os.environ.get(
        "GEMINI_FALLBACK_MODELS",
        "gemini-3.1-flash-lite-preview,gemini-flash-lite-latest",
    ).split(",")
    if item.strip()
]
MODELS_ROOT = Path(os.environ.get("SCAPDER_MODELS", REPO_ROOT / "models"))
EXPORTED_MODELS = MODELS_ROOT / "exported"
BEHAVIOR_CONFIG = REPO_ROOT / "training" / "configs" / "behavior.yaml"


def _load_behavior() -> dict:
    if not BEHAVIOR_CONFIG.exists():
        return {}
    with open(BEHAVIOR_CONFIG, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


BEHAVIOR = _load_behavior()


def behavior_classes() -> list[str]:
    return list(BEHAVIOR.get("classes") or [])


def acceptance() -> dict:
    return dict(BEHAVIOR.get("acceptance") or {})


# Baseline thresholds that mirror the YAML. ``thresholds()`` merges YAML over
# these so a config can also drop a key safely.
_DEFAULT_THRESHOLDS: dict[str, float] = {
    "hand_reach_m": 0.5,
    "pick_min_seconds": 0.8,
    "putback_min_seconds": 0.8,
    "minimum_track_seconds": 1.0,
}


def thresholds() -> dict[str, float]:
    merged = dict(_DEFAULT_THRESHOLDS)
    for key, value in (BEHAVIOR.get("thresholds") or {}).items():
        if value is not None:
            merged[key] = float(value)
    return merged


def detector_model() -> Path:
    """Resolve the detector entry point.

    Priority: ``SCAPDER_DETECTOR_MODEL`` env var (a weight file or a YOLO
    name), then an exported artifact, then the bundled weight file.
    """
    override = os.environ.get("SCAPDER_DETECTOR_MODEL")
    if override:
        return Path(override)
    return EXPORTED_MODELS / "people-yolo11n.pt"
