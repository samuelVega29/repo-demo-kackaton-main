"""Formal e2e pipeline tests (fast + ROI, advanced).

Runs the real YOLO/ByteTrack pipeline against the runtime SQLite database on a
short 120-frame clip. Slow by nature, so these only run when explicitly enabled:

    SCAPDER_RUN_E2E=1 python -m pytest tests/test_run_pipeline_e2e.py -q

Everything created here (retailer, sites, analyses, uploaded copies, result
dirs) is removed afterwards — no scratch data is left behind.
"""
import os
import shutil
import uuid
from pathlib import Path

import pytest

from app.database import SessionLocal
from app.models import Analysis, Retailer, Site

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "data" / "uploads"
RESULT_DIR = Path(__file__).resolve().parents[1] / "data" / "results"


def e2e_enabled() -> bool:
    clip = UPLOAD_DIR / "_clip_e2e.mp4"
    return bool(os.getenv("SCAPDER_RUN_E2E")) and clip.exists()


pytestmark = pytest.mark.skipif(
    not e2e_enabled(),
    reason="e2e: set SCAPDER_RUN_E2E=1 with backend/data/uploads/_clip_e2e.mp4 present",
)

FAST_SITE_CONFIG = {
    "version": 1,
    "units": "normalized",
    "floor": {"width": 1.0, "depth": 1.0},
    "camera": {"name": "e2e cam", "calibration_status": "uncalibrated", "model_3d": None},
    "zones": [],
    "gondolas": [],
    "thresholds": {"minimum_track_seconds": 2.0},
}
ADVANCED_SITE_CONFIG = {
    "version": 1,
    "units": "meters",
    "floor": {"width": 12.0, "depth": 8.0},
    "camera": {
        "name": "e2e advanced cam",
        "source_normalized": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
        "target_meters": [[0.0, 0.0], [12.0, 0.0], [12.0, 8.0], [0.0, 8.0]],
        "calibration_status": "calibrated",
        "model_3d": None,
    },
    "zones": [],
    "gondolas": [],
    "thresholds": {"minimum_track_seconds": 2.0},
}
ROI = [[0.2, 0.15], [0.8, 0.15], [0.8, 0.85], [0.2, 0.85]]


class E2EFixture:
    """Owns a site in the runtime DB and runs real analyses, cleaning up after."""

    def __init__(self, config: dict) -> None:
        self.config = config
        self.retailer_id = None
        self.site_id = None
        self.analysis_ids: list[str] = []

    def setup(self) -> None:
        with SessionLocal() as db:
            retailer = Retailer(name=f"E2E {uuid.uuid4().hex[:8]}", code=uuid.uuid4().hex[:8])
            db.add(retailer)
            db.commit()
            db.refresh(retailer)
            self.retailer_id = retailer.id
            site = Site(retailer_id=retailer.id, name="E2E site", city="Test", configuration=self.config)
            db.add(site)
            db.commit()
            db.refresh(site)
            self.site_id = site.id

    def run(self, roi) -> dict:
        bytestring = None
        analysis_id = uuid.uuid4().hex
        video_path = UPLOAD_DIR / f"{analysis_id}.mp4"
        shutil.copyfile(UPLOAD_DIR / "_clip_e2e.mp4", video_path)
        with SessionLocal() as db:
            analysis = Analysis(
                id=analysis_id, site_id=self.site_id, user_id=1, filename="clip.mp4",
                video_path=str(video_path), status="queued", stage="upload",
                progress=1, message="esperando inferencia",
            )
            db.add(analysis)
            db.commit()
            self.analysis_ids.append(analysis_id)
        from app.cv.pipeline import run_analysis

        run_analysis(analysis_id, roi=roi)
        with SessionLocal() as db:
            done = db.get(Analysis, analysis_id)
            assert done.status == "completed", f"{done.status}: {done.message}"
            return done.result

    def teardown(self) -> None:
        with SessionLocal() as db:
            for analysis_id in self.analysis_ids:
                analysis = db.get(Analysis, analysis_id)
                if analysis is not None:
                    db.delete(analysis)
            site = db.get(Site, self.site_id)
            if site is not None:
                db.delete(site)
            retailer = db.get(Retailer, self.retailer_id)
            if retailer is not None:
                db.delete(retailer)
            db.commit()
        for analysis_id in self.analysis_ids:
            Path(UPLOAD_DIR / f"{analysis_id}.mp4").unlink(missing_ok=True)
            shutil.rmtree(RESULT_DIR / analysis_id, ignore_errors=True)


@pytest.fixture
def fast_fixture():
    fixture = E2EFixture(dict(FAST_SITE_CONFIG))
    fixture.setup()
    yield fixture
    fixture.teardown()


@pytest.fixture
def advanced_fixture():
    fixture = E2EFixture(dict(ADVANCED_SITE_CONFIG))
    fixture.setup()
    yield fixture
    fixture.teardown()


def _assert_fast_contracts(result, expected_roi):
    assert result["analysis_mode"] == "fast"
    assert result["coordinate_system"] == "normalized"
    assert result["roi"] == expected_roi
    metrics = result["metrics"]
    assert metrics["average_speed_m_s"] == 0.0
    assert metrics["average_speed_normalized"] is not None
    for trajectory in result["trajectories"]:
        for px, pz in trajectory["points"]:
            assert 0.0 <= px <= 1.0 and 0.0 <= pz <= 1.0
    for zone in result["zones"]:
        for px, pz in zone["polygon"]:
            assert 0.0 <= px <= 1.0 and 0.0 <= pz <= 1.0
    for event in result.get("pickup_events_log", []):
        # Fast pickup events share the raw internal (pixel) coordinate space with
        # interaction_events_log; the frontend normalizes them by the frame dims.
        # A regression that stored normalized 0..1 coords here would collapse the
        # pick-up markers to the frame corner (double normalization).
        assert event["x"] > 1.0 or event["z"] > 1.0


def _assert_advanced_contracts(result):
    assert result["analysis_mode"] == "advanced"
    assert result["coordinate_system"] == "meters"
    metrics = result["metrics"]
    assert metrics["average_speed_m_s"] >= 0.0
    assert metrics["average_speed_normalized"] is None
    for zone in result["zones"]:
        for px, pz in zone["polygon"]:
            assert 0.0 <= px <= 1.0 and 0.0 <= pz <= 1.0
    assert result["site"]["configuration"]["camera"]["calibration_status"] == "calibrated"


def test_fast_fullframe_and_roi(fast_fixture):
    full = fast_fixture.run(None)
    _assert_fast_contracts(full, None)
    roi = fast_fixture.run(ROI)
    _assert_fast_contracts(roi, ROI)
    assert roi["metrics"]["detections"] <= full["metrics"]["detections"]
    assert roi["metrics"]["flow_per_minute"] > 0


def test_advanced_pipeline(advanced_fixture):
    result = advanced_fixture.run(None)
    _assert_advanced_contracts(result)