"""Contracts for /api/analyses/{id}/* result endpoints.

Each endpoint works strictly by ``analysis_id`` (no "latest analysis" of the
site), reuses the stored ``Analysis.result`` and the same ``can_access`` gate.
"""
from io import BytesIO

import pytest

from conftest import advanced_result, fast_result, make_analysis

SUB_RESOURCES = [
    "status",
    "summary",
    "heatmap",
    "trajectories",
    "dwell",
    "interactions",
    "zones",
    "recommendations",
    "visualization-3d",
]


def set_user(state, user_id):
    from app.models import User

    state.user = state.session.get(User, user_id)


@pytest.mark.parametrize("resource", SUB_RESOURCES)
def test_missing_analysis_404(client, state, resource):
    set_user(state, 1)
    response = client.get(f"/api/analyses/does-not-exist/{resource}")
    assert response.status_code == 404


def test_foreign_analysis_403(client, state):
    make_analysis(state, "aaa001", site_id=2, status="completed", result=fast_result("aaa001"))
    set_user(state, 2)  # client of retailer 101, analysis belongs to retailer 102
    for resource in SUB_RESOURCES:
        response = client.get(f"/api/analyses/aaa001/{resource}")
        assert response.status_code == 403, resource


def test_admin_can_read_any_analysis(client, state):
    make_analysis(state, "aaa002", site_id=2, status="completed", result=fast_result("aaa002"))
    set_user(state, 1)  # admin
    for resource in SUB_RESOURCES:
        assert client.get(f"/api/analyses/aaa002/{resource}").status_code in (200,), resource


def test_queued_state_returns_status_no_fake_data(client, state):
    make_analysis(state, "aaa003", site_id=1, status="queued", stage="upload", progress=1, message="esperando")
    set_user(state, 1)
    status = client.get("/api/analyses/aaa003/status")
    assert status.status_code == 200
    body = status.json()
    assert body == {"analysis_id": "aaa003", "status": "queued", "stage": "upload", "progress": 1, "message": "esperando"}
    for resource in ("summary", "heatmap", "trajectories", "dwell", "interactions", "zones", "recommendations", "visualization-3d"):
        response = client.get(f"/api/analyses/aaa003/{resource}")
        assert response.status_code == 409
        payload = response.json()
        assert payload["status"] == "queued" and payload["analysis_id"] == "aaa003"


def test_processing_state_returns_status(client, state):
    make_analysis(state, "aaa004", site_id=1, status="processing", stage="tracking", progress=42, message="YOLO")
    set_user(state, 1)
    status = client.get("/api/analyses/aaa004/status")
    assert status.status_code == 200
    assert status.json()["status"] == "processing"
    assert status.json()["progress"] == 42
    assert client.get("/api/analyses/aaa004/summary").status_code == 409


def test_failed_state_exposes_safe_error(client, state):
    make_analysis(state, "aaa005", site_id=1, status="failed", stage="failed", progress=100, message="OpenCV no pudo abrir el MP4")
    set_user(state, 1)
    status = client.get("/api/analyses/aaa005/status")
    assert status.status_code == 200
    assert status.json()["status"] == "failed"
    response = client.get("/api/analyses/aaa005/summary")
    assert response.status_code == 422
    assert response.json()["status"] == "failed"
    assert "OpenCV" in response.json()["message"]


def test_create_analysis_rejects_videos_longer_than_120_seconds(client, state, monkeypatch):
    import app.routers.analyses as analyses_router

    set_user(state, 1)
    started = False

    def fake_thread(*args, **kwargs):
        nonlocal started
        started = True
        raise AssertionError("No debe iniciar el analisis")

    monkeypatch.setattr(
        analyses_router,
        "get_video_duration_seconds",
        lambda path: 121.0,
    )
    monkeypatch.setattr(
        analyses_router.threading,
        "Thread",
        fake_thread,
    )

    response = client.post(
        "/api/analyses",
        data={"site_id": "1"},
        files={
            "video": (
                "largo.mp4",
                BytesIO(b"video"),
                "video/mp4",
            ),
        },
    )

    assert response.status_code == 400
    assert "120 segundos" in response.json()["detail"]
    assert started is False


def test_completed_fast_contracts(client, state):
    make_analysis(state, "aaa006", site_id=1, status="completed", result=fast_result("aaa006"))
    set_user(state, 1)

    status = client.get("/api/analyses/aaa006/status").json()
    assert status["status"] == "completed"

    summary = client.get("/api/analyses/aaa006/summary").json()
    assert summary["analysis_id"] == "aaa006"
    assert summary["analysis_mode"] == "fast"
    assert summary["coordinate_system"] == "normalized"
    assert summary["metrics"]["average_speed_m_s"] == 0.0
    assert summary["video"]["duration_seconds"] == 4.0
    assert len(summary["zones"]) == 9
    assert summary["gondolas"] == []

    heatmap = client.get("/api/analyses/aaa006/heatmap").json()
    assert heatmap["analysis_mode"] == "fast"
    assert heatmap["heatmaps"]["traffic"] == "traffic.png"
    assert heatmap["floor"]["units"] == "normalized"
    assert heatmap["roi"] == fast_result("aaa006")["roi"]

    trajectories = client.get("/api/analyses/aaa006/trajectories").json()
    assert trajectories["coordinate_system"] == "normalized"
    point = trajectories["trajectories"][0]["points"][0]
    assert 0.0 <= point[0] <= 1.0 and 0.0 <= point[1] <= 1.0
    assert trajectories["floor"]["width"] == 1.0

    dwell = client.get("/api/analyses/aaa006/dwell").json()
    assert dwell["duration_seconds"] == 4.0
    assert dwell["avg_dwell_seconds"] == pytest.approx(0.78, abs=0.01)
    assert len(dwell["zones"]) == 9

    interactions = client.get("/api/analyses/aaa006/interactions").json()
    assert interactions["gondolas"] == []
    assert interactions["interaction_events_log"] == []
    assert interactions["interaction_histogram"] is None
    assert interactions["pickup_histogram"] is None

    zones = client.get("/api/analyses/aaa006/zones").json()
    assert zones["coordinate_system"] == "normalized"
    assert len(zones["zones"]) == 9

    recommendations = client.get("/api/analyses/aaa006/recommendations").json()
    assert recommendations["analysis_mode"] == "fast"
    assert len(recommendations["recommendations"]) == 1
    assert recommendations["recommendations"][0]["type"] == "recommendation"


def test_completed_advanced_contracts(client, state):
    make_analysis(state, "aaa007", site_id=1, status="completed", result=advanced_result("aaa007"))
    set_user(state, 1)

    summary = client.get("/api/analyses/aaa007/summary").json()
    assert summary["analysis_mode"] == "advanced"
    assert summary["coordinate_system"] == "meters"
    assert summary["metrics"]["average_speed_m_s"] == 1.11

    trajectories = client.get("/api/analyses/aaa007/trajectories").json()
    assert trajectories["coordinate_system"] == "meters"
    assert trajectories["trajectories"][0]["points"][0] == [1.2, 3.4]

    interactions = client.get("/api/analyses/aaa007/interactions").json()
    assert len(interactions["interaction_events_log"]) == 1
    assert interactions["interaction_histogram"]["bucket_seconds"] == 10

    dwell = client.get("/api/analyses/aaa007/dwell").json()
    assert dwell["avg_dwell_seconds"] == 6.0


def test_visualization_3d_fast_not_available(client, state):
    make_analysis(state, "aaa008", site_id=1, status="completed", result=fast_result("aaa008"))
    set_user(state, 1)
    body = client.get("/api/analyses/aaa008/visualization-3d").json()
    assert body["available"] is False
    assert body["reason"] == "3D requires calibrated camera"
    assert "configuration" not in body and "camera" not in body


def test_video_endpoint_prefers_anonymized_video(client, state, tmp_path):
    from app.routers import analyses as analyses_router
    from app.security import create_token

    original = tmp_path / "original.mp4"
    original.write_bytes(b"original-video")
    anon_dir = analyses_router.RESULT_DIR / "aaa010"
    anon_dir.mkdir(parents=True, exist_ok=True)
    anonymized = anon_dir / "anonymized.mp4"
    anonymized.write_bytes(b"pixelated-video")

    analysis = make_analysis(state, "aaa010", site_id=1, status="completed", result=fast_result("aaa010"))
    analysis.video_path = str(original)
    state.session.commit()
    set_user(state, 1)
    token = create_token(state.user)

    try:
        response = client.get(f"/api/analyses/aaa010/video?token={token}")
        assert response.status_code == 200
        assert response.content == b"pixelated-video"
    finally:
        anonymized.unlink(missing_ok=True)
        try:
            anon_dir.rmdir()
        except OSError:
            pass


def test_visualization_3d_advanced_available(client, state):
    make_analysis(state, "aaa009", site_id=1, status="completed", result=advanced_result("aaa009"))
    set_user(state, 1)
    body = client.get("/api/analyses/aaa009/visualization-3d").json()
    assert body["available"] is True
    assert body["configuration"]["camera"]["calibration_status"] == "calibrated"
    assert body["gondolas"][0]["id"] == "g1"
    assert len(body["zones"]) == 1


def test_two_analyses_do_not_mix(client, state):
    result_a = fast_result("mix-a")
    result_b = advanced_result("mix-b")
    result_b["metrics"]["people_detected"] = 99
    result_b["trajectories"] = [{"track_id": 777, "points": [[7.7, 7.7], [8.8, 8.8]]}]
    make_analysis(state, "mix-a", site_id=1, status="completed", result=result_a)
    make_analysis(state, "mix-b", site_id=1, status="completed", result=result_b)
    set_user(state, 1)

    status_a = client.get("/api/analyses/mix-a/status").json()
    assert status_a["analysis_id"] == "mix-a"
    assert client.get("/api/analyses/mix-b/status").json()["analysis_id"] == "mix-b"

    summary_a = client.get("/api/analyses/mix-a/summary").json()
    assert summary_a["analysis_id"] == "mix-a"
    assert summary_a["analysis_mode"] == "fast"
    assert summary_a["metrics"]["people_detected"] == 3
    assert summary_a["coordinate_system"] == "normalized"

    summary_b = client.get("/api/analyses/mix-b/summary").json()
    assert summary_b["analysis_id"] == "mix-b"
    assert summary_b["metrics"]["people_detected"] == 99
    assert summary_b["coordinate_system"] == "meters"

    traj_a = client.get("/api/analyses/mix-a/trajectories").json()
    assert traj_a["trajectories"][0]["points"][0] == [0.44, 0.74]
    assert all(0.0 <= p[0] <= 1.0 for t in traj_a["trajectories"] for p in t["points"])
