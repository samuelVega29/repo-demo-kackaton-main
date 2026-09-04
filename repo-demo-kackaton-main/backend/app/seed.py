from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .models import Retailer, Site, User
from .routers.catalog import empty_site_configuration
from .security import hash_password


def initialize_database() -> None:
    Base.metadata.create_all(engine)
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
        if not database.scalar(select(User).where(User.email == "admin@scapder.ai")):
            database.add(User(email="admin@scapder.ai", name="Admin Scapder", password_hash=hash_password("Scapder2026!"), role="admin"))
        if not database.scalar(select(User).where(User.email == "analista@retail.co")):
            database.add(User(email="analista@retail.co", name="Ana Retail", password_hash=hash_password("Retail2026!"), role="retailer", retailer_id=retailer.id))
        database.commit()
