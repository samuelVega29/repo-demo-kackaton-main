import os
from contextlib import asynccontextmanager

from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .routers import analyses, analytics, auth, catalog, chat, users
from .seed import initialize_database


def _frontend_dist() -> Path | None:
    """Ubicación del frontend compilado (vite build).

    Orden: variable de entorno (desktop), carpeta del repo en dev,
    recursos empaquetados por PyInstaller (sys._MEIPASS).
    """
    override = os.environ.get("SCAPDER_FRONTEND_DIST")
    if override and (Path(override) / "index.html").exists():
        return Path(override)
    repo_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if (repo_dist / "index.html").exists():
        return repo_dist
    meipass = getattr(__import__("sys"), "_MEIPASS", None)
    if meipass:
        bundled = Path(meipass) / "_frontend_dist"
        if (bundled / "index.html").exists():
            return bundled
    return None


FRONTEND_DIST = _frontend_dist()


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Scapder Spatial Intelligence API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(analyses.router)
app.include_router(analytics.router)
app.include_router(users.router)
app.include_router(chat.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


if FRONTEND_DIST is not None:
    # En desktop (.exe) el backend sirve el frontend: mismo origen, sin CORS.
    # Se registra al final para no opacar /api, /docs ni /openapi.json.

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="No encontrado")
        if full_path:
            candidate = FRONTEND_DIST / full_path
            try:
                candidate.resolve().relative_to(FRONTEND_DIST.resolve())
            except (ValueError, RuntimeError):
                raise HTTPException(status_code=404, detail="No encontrado")
            if candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
