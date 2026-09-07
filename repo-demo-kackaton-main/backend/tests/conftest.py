"""Shared fixtures for API endpoint tests.

Builds an isolated FastAPI app with an in-memory SQLite database and the real
``/api/analyses`` router. Dependencies for ``get_db`` and ``current_user`` are
overridden per test through a mutable ``_State`` holder, so we never touch the
runtime ``data/scapder.db``.
"""
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import Analysis, Retailer, Site, User
from app.routers.analyses import router
from app.security import current_user


class _State:
    session = None
    user: User | None = None


def _override_get_db():
    yield _State.session


def _override_current_user():
    return _State.user


@pytest.fixture(scope="session")
def engine():
    db_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(db_engine)
    maker = sessionmaker(bind=db_engine, expire_on_commit=False)
    with maker() as session:
        retailer_a = Retailer(id=101, name="Retailer A", code="RA")
        retailer_b = Retailer(id=102, name="Retailer B", code="RB")
        admin = User(id=1, email="admin@test.ai", name="Admin", password_hash="x", role="admin", retailer_id=None)
        client_a = User(id=2, email="a@test.ai", name="A", password_hash="x", role="retailer", retailer_id=101)
        client_b = User(id=3, email="b@test.ai", name="B", password_hash="x", role="retailer", retailer_id=102)
        site_a = Site(id=1, retailer_id=101, name="Tienda A", city="X", configuration={"floor": {"width": 12, "depth": 8}})
        site_b = Site(id=2, retailer_id=102, name="Tienda B", city="Y", configuration={"floor": {"width": 1.0, "depth": 1.0}})
        session.add_all([retailer_a, retailer_b, admin, client_a, client_b, site_a, site_b])
        session.commit()
    yield db_engine
    Base.metadata.drop_all(db_engine)


@pytest.fixture(autouse=True)
def state(engine):
    _State.user = None
    maker = sessionmaker(bind=engine, expire_on_commit=False)
    _State.session = maker()
    yield _State
    _State.session.close()
    _State.session = None


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[current_user] = _override_current_user
    return TestClient(app)


def make_analysis(state, analysis_id: str, site_id: int, status: str, result=None, **extra) -> Analysis:
    analysis = Analysis(
        id=analysis_id,
        site_id=site_id,
        user_id=1,
        filename="sample.mp4",
        video_path="/tmp/none.mp4",
        status=status,
        stage=extra.get("stage", "upload"),
        progress=extra.get("progress", 0),
        message=extra.get("message", "Video recibido"),
        result=result,
        created_at=extra.get("created_at", datetime.now(timezone.utc)),
    )
    state.session.add(analysis)
    state.session.commit()
    return analysis


NORMALIZED_SITE = {
    "floor": {"width": 1.0, "depth": 1.0, "units": "normalized"},
    "camera": {"calibration_status": "fast", "model_3d": None},
}
METER_SITE = {
    "floor": {"width": 12.0, "depth": 8.0},
    "camera": {
        "calibration_status": "calibrated",
        "model_3d": {"enabled": True},
        "homography": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    },
}


def fast_result(analysis_id: str) -> dict:
    return {
        "analysis_mode": "fast",
        "coordinate_system": "normalized",
        "roi": [[0.2, 0.15], [0.8, 0.15], [0.8, 0.85], [0.2, 0.85]],
        "site": {"id": 1, "name": "Tienda A", "city": "X", "configuration": NORMALIZED_SITE},
        "video": {"fps": 30.0, "duration_seconds": 4.0, "width": 1920, "height": 1080, "total_frames": 120},
        "model": {"detector": "YOLO11n", "pose": "yolov8n-pose", "tracker": "ByteTrack", "privacy": "temporary_ids_only", "custom_behavior_model": False, "has_pose": True},
        "metrics": {
            "people_detected": 3, "tracked_presences": 3, "track_fragments": 10,
            "detections": 495, "trajectories": 3, "interaction_events": 0,
            "pickup_events": 0, "average_speed_m_s": 0.0, "average_speed_normalized": 0.0349,
            "flow_per_minute": 45.0, "peak_presence": 5, "time_slices": 4,
        },
        "trajectories": [
            {"track_id": 1, "points": [[0.44, 0.74], [0.45, 0.75], [0.46, 0.77]]},
        ],
        "frame_detections": [],
        "interaction_events_log": [],
        "interaction_histogram": None,
        "pickup_events_log": [],
        "pickup_histogram": None,
        "gondolas": [],
        "zones": [
            {"zone_id": f"auto-{i}", "id": f"auto-{i}", "name": f"Zona {i}", "poligono_hint": False,
             "visits": 2 if i < 2 else 0, "dwell_seconds": 3.5 if i < 2 else 0.0, "interactions": 0,
             "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]], "source": "auto_grid"}
            for i in range(9)
        ],
        "heatmaps": {"traffic": "traffic.png", "dwell": "dwell.png", "interaction": None, "pickup": None, "overlays": {}, "slices": []},
        "annotated_frames": [],
        "findings": [
            {"type": "evidence", "title": "Zona dominante", "detail": "..."},
            {"type": "recommendation", "title": "Validar pasillo", "detail": "..."},
        ],
        "quality": {"calibration": "fast", "analysis_mode": "fast", "coordinate_system": "normalized"},
    }


def advanced_result(analysis_id: str) -> dict:
    return {
        "analysis_mode": "advanced",
        "coordinate_system": "meters",
        "roi": None,
        "site": {"id": 1, "name": "Tienda A", "city": "X", "configuration": METER_SITE},
        "video": {"fps": 30.0, "duration_seconds": 4.0, "width": 1920, "height": 1080, "total_frames": 120},
        "model": {"detector": "YOLO11n", "pose": "yolov8n-pose", "tracker": "ByteTrack", "privacy": "temporary_ids_only", "custom_behavior_model": False, "has_pose": True},
        "metrics": {
            "people_detected": 4, "tracked_presences": 4, "track_fragments": 12,
            "detections": 600, "trajectories": 4, "interaction_events": 3,
            "pickup_events": 2, "average_speed_m_s": 1.11, "average_speed_normalized": None,
            "flow_per_minute": 60.0, "peak_presence": 6, "time_slices": 4,
        },
        "trajectories": [
            {"track_id": 9, "points": [[1.2, 3.4], [1.3, 3.5], [1.5, 3.8]]},
        ],
        "frame_detections": [],
        "interaction_events_log": [{"t": 1.0, "track_id": 9, "x": 1.2, "z": 3.4, "gondola_id": "g1", "gondola_name": "Despensa"}],
        "interaction_histogram": {"bucket_seconds": 10, "buckets": [{"index": 0, "start": 0, "end": 4, "count": 3}]},
        "pickup_events_log": [{"t": 1.5, "track_id": 9, "x": 1.2, "z": 3.4, "gondola_id": "g1", "gondola_name": "Despensa", "pose_verified": True}],
        "pickup_histogram": {"bucket_seconds": 10, "buckets": [{"index": 0, "start": 0, "end": 4, "count": 2}]},
        "gondolas": [{"id": "g1", "name": "Despensa", "dwell_seconds": 12.0, "interactions": 3, "pickups": 2, "traffic": 5}],
        "zones": [
            {"zone_id": "entrance", "id": "entrance", "name": "Acceso", "visits": 4, "dwell_seconds": 6.0, "interactions": 1,
             "polygon": [[0, 6.8], [12, 6.8], [12, 8], [0, 8]]},
        ],
        "heatmaps": {"traffic": "traffic.png", "dwell": "dwell.png", "interaction": "interaction.png", "pickup": "pickup.png", "overlays": {}, "slices": []},
        "annotated_frames": [],
        "findings": [
            {"type": "evidence", "title": "Mayor permanencia", "detail": "..."},
            {"type": "recommendation", "title": "Reposición", "detail": "..."},
        ],
        "quality": {"calibration": "calibrated", "analysis_mode": "advanced", "coordinate_system": "meters"},
    }