import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def _data_dir() -> Path:
    """Directorio de datos. En desktop (.exe) se define con SCAPDER_DATA_DIR."""
    override = os.environ.get("SCAPDER_DATA_DIR")
    if override:
        path = Path(override)
        path.mkdir(parents=True, exist_ok=True)
        return path
    return Path(__file__).resolve().parents[1] / "data"


DATABASE_PATH = _data_dir() / "scapder.db"
engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()
