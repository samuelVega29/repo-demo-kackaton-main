"""Paquete App: carga el archivo .env del proyecto al arrancar.

Uvicorn no lee .env por sí solo, así que lo parseamos aquí (antes de que
cualquier módulo consulte os.environ). Busca el .env en la raíz del repo y en
``backend/``, y solo define variables que aún no existan en el entorno.
"""
import os
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        if key not in os.environ:
            os.environ[key] = value


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]
_load_dotenv(PROJECT_ROOT / ".env")
_load_dotenv(BACKEND_ROOT / ".env")