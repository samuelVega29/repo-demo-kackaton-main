from sqlalchemy import inspect, select

from .database import Base, SessionLocal, engine
from .models import Analysis, Retailer, Site, User
from .routers.catalog import empty_site_configuration
from .security import hash_password


def _add_missing_columns() -> None:
    inspector = inspect(engine)
    existing = {column["name"] for column in inspector.get_columns(Analysis.__tablename__)}
    for column in Analysis.__table__.columns:
        if column.name not in existing:
            with engine.begin() as connection:
                connection.exec_driver_sql(
                    f'ALTER TABLE {Analysis.__tablename__} ADD COLUMN {column.name} {column.type.compile(engine.dialect)}'
                )


def initialize_database() -> None:
    Base.metadata.create_all(engine)
    _add_missing_columns()
    with SessionLocal() as database:
        retailer = database.scalar(select(Retailer).where(Retailer.code == "demo-retail"))
        if not retailer:
            retailer = Retailer(name="Mercado Central", code="demo-retail")
            database.add(retailer)
            database.flush()
        if not database.scalar(select(Site).where(Site.retailer_id == retailer.id)):
            database.add(
                Site(
                    retailer_id=retailer.id,
                    name="Flagship 93",
                    city="Bogotá",
                    configuration=empty_site_configuration(12.0, 8.0, "Cámara acceso principal"),
                )
            )
        admin = database.scalar(select(User).where(User.email == "admin@scapder.ai"))
        if not admin:
            database.add(User(email="admin@scapder.ai", name="Admin Scapder", password_hash=hash_password("Scapder2026!"), role="admin"))
        else:
            admin.role = "admin"
            admin.retailer_id = None
        analyst = database.scalar(select(User).where(User.email == "analista@retail.co"))
        if not analyst:
            database.add(
                User(
                    email="analista@retail.co",
                    name="Analista Retail",
                    password_hash=hash_password("Retail2026!"),
                    role="analista",
                    retailer_id=retailer.id,
                )
            )
        database.commit()
