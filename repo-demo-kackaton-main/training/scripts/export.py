"""Export gate for a validated behavior model."""

from pathlib import Path


def exported_path(model_name: str) -> Path:
    return Path(__file__).resolve().parents[2] / "models" / "exported" / f"{model_name}.onnx"


if __name__ == "__main__":
    raise SystemExit("Evaluate on the held-out test split before enabling ONNX export.")
