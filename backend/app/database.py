import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


BACKEND_ROOT = Path(os.environ.get("SCAPDER_BACKEND_ROOT", Path(__file__).resolve().parents[1]))
DATABASE_PATH = BACKEND_ROOT / "data" / "scapder.db"
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
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
