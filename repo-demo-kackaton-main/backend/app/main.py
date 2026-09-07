from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import analyses, analytics, auth, catalog, users
from .seed import initialize_database


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Scapder Spatial Intelligence API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(analyses.router)
app.include_router(analytics.router)
app.include_router(users.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
