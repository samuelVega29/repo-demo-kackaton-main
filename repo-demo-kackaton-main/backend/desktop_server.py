"""Entry point del backend para la app de escritorio (PyInstaller + Electron).

Uso:
    python desktop_server.py [--host 127.0.0.1] [--port 8000]

En modo congelado (.exe) configura:
  - SCAPDER_DATA_DIR  -> %APPDATA%/SCAPDER/data (DB, uploads, resultados)
  - SCAPDER_MODEL_DIR -> modelos .pt empaquetados junto al exe
  - SCAPDER_FRONTEND_DIST -> frontend compilado empaquetado
  - SCAPDER_BEHAVIOR_CONFIG -> behavior.yaml empaquetado
y carga el .env que esté junto al exe o en %APPDATA%/SCAPDER/.env
(sirve para poner ANTHROPIC_API_KEY sin recompilar).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def _appdata() -> Path:
    base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    return Path(base) / "SCAPDER"


def _bundle_dir() -> Path | None:
    meipass = getattr(sys, "_MEIPASS", None)
    return Path(meipass) if meipass else None


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def configure() -> None:
    frozen = getattr(sys, "frozen", False)
    exe_dir = Path(sys.executable).resolve().parent if frozen else Path(__file__).resolve().parent

    # 1. Datos persistentes del usuario
    data_dir = Path(os.environ.get("SCAPDER_DATA_DIR", _appdata() / "data"))
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("SCAPDER_DATA_DIR", str(data_dir))

    # 2. Recursos empaquetados (solo .exe)
    bundle = _bundle_dir()
    if bundle is not None:
        model_dir = bundle / "models"
        if model_dir.is_dir():
            os.environ.setdefault("SCAPDER_MODEL_DIR", str(model_dir))
        frontend = bundle / "_frontend_dist"
        if (frontend / "index.html").exists():
            os.environ.setdefault("SCAPDER_FRONTEND_DIST", str(frontend))
        behavior = bundle / "training" / "configs" / "behavior.yaml"
        if behavior.exists():
            os.environ.setdefault("SCAPDER_BEHAVIOR_CONFIG", str(behavior))

    # 3. Claves (.env junto al exe > .env en APPDATA > entorno real)
    _load_env_file(exe_dir / ".env")
    _load_env_file(_appdata() / ".env")

    # 4. Trabajar sobre el directorio de datos (no ensuciar el exe)
    os.chdir(data_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Scapder backend (desktop)")
    parser.add_argument("--host", default=os.environ.get("SCAPDER_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("SCAPDER_PORT", "8000")))
    args = parser.parse_args()

    configure()

    import uvicorn

    from app.main import app

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
