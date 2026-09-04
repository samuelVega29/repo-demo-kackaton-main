from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .models import Retailer, Site, User
from .security import hash_password


SITE_CONFIGURATION = {
    "version": 1,
    "units": "meters",
    "floor": {"width": 12.0, "depth": 8.0},
    "camera": {
        "name": "Cámara acceso principal",
        "source_normalized": [[0.08, 0.18], [0.92, 0.18], [0.98, 0.96], [0.02, 0.96]],
        "target_meters": [[0.0, 0.0], [12.0, 0.0], [12.0, 8.0], [0.0, 8.0]],
        "calibration_status": "demo",
    },
    "zones": [
        {"id": "entrance", "name": "Acceso", "polygon": [[0, 6.8], [12, 6.8], [12, 8], [0, 8]]},
        {"id": "left_aisle", "name": "Pasillo izquierdo", "polygon": [[0, 0], [6, 0], [6, 6.8], [0, 6.8]]},
        {"id": "right_aisle", "name": "Pasillo derecho", "polygon": [[6, 0], [12, 0], [12, 6.8], [6, 6.8]]},
    ],
    "gondolas": [
        {
            "id": "g1", "name": "Cuidado personal", "x": 1.2, "z": 1.35, "width": 3.4, "depth": 0.65,
            "segments": {"rows": ["Superior", "Media", "Inferior"], "columns": ["Izquierda", "Centro", "Derecha"]},
            "products": [["Shampoo", "Acondicionador", "Tratamientos"], ["Jabón", "Desodorante", "Cuidado oral"], ["Papel", "Pañitos", "Repuestos"]],
        },
        {
            "id": "g2", "name": "Snacks", "x": 7.25, "z": 1.35, "width": 3.4, "depth": 0.65,
            "segments": {"rows": ["Superior", "Media", "Inferior"], "columns": ["Izquierda", "Centro", "Derecha"]},
            "products": [["Frutos secos", "Galletas", "Barras"], ["Papas", "Nachos", "Mezclas"], ["Multipacks", "Promoción", "Familiar"]],
        },
        {
            "id": "g3", "name": "Bebidas", "x": 1.2, "z": 4.4, "width": 3.4, "depth": 0.65,
            "segments": {"rows": ["Superior", "Media", "Inferior"], "columns": ["Izquierda", "Centro", "Derecha"]},
            "products": [["Energéticas", "Té", "Agua premium"], ["Agua", "Jugos", "Gaseosas"], ["Six packs", "Botellas XL", "Retornables"]],
        },
        {
            "id": "g4", "name": "Despensa", "x": 7.25, "z": 4.4, "width": 3.4, "depth": 0.65,
            "segments": {"rows": ["Superior", "Media", "Inferior"], "columns": ["Izquierda", "Centro", "Derecha"]},
            "products": [["Salsas", "Especias", "Conservas"], ["Arroz", "Pasta", "Granos"], ["Harinas", "Azúcar", "Aceites"]],
        },
    ],
    "thresholds": {"approach_m": 1.5, "engaged_m": 0.8, "engaged_seconds": 2.0, "interaction_seconds": 4.0, "minimum_track_seconds": 2.0, "pickup_reach_m": 0.5, "pickup_min_seconds": 0.6, "pickup_cooldown_s": None},
}


def initialize_database() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as database:
        retailer = database.scalar(select(Retailer).where(Retailer.code == "demo-retail"))
        if not retailer:
            retailer = Retailer(name="Mercado Central", code="demo-retail")
            database.add(retailer)
            database.flush()
        if not database.scalar(select(Site).where(Site.retailer_id == retailer.id)):
            database.add(Site(retailer_id=retailer.id, name="Flagship 93", city="Bogotá", configuration=SITE_CONFIGURATION))
        if not database.scalar(select(User).where(User.email == "admin@scapder.ai")):
            database.add(User(email="admin@scapder.ai", name="Admin Scapder", password_hash=hash_password("Scapder2026!"), role="admin"))
        if not database.scalar(select(User).where(User.email == "analista@retail.co")):
            database.add(User(email="analista@retail.co", name="Ana Retail", password_hash=hash_password("Retail2026!"), role="retailer", retailer_id=retailer.id))
        database.commit()
