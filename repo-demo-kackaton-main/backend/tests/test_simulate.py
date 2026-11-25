"""Contracts for the "what-if" layout simulation.

``simulate_layout`` re-derives traffic/dwell/interaction for a hypothetical
gondola layout from the REAL trajectories already stored on a completed
analysis, without touching the video. Covered here at two levels: the pure
function (geometry/validation) and the ``POST /{id}/simulate`` endpoint
(auth, wiring, error mapping).
"""
import pytest

from conftest import advanced_result, fast_result, make_analysis

from app.cv.simulate import simulate_layout


def set_user(state, user_id):
    from app.models import User

    state.user = state.session.get(User, user_id)


# advanced_result's single track (id 9) walks [1.2,3.4] -> [1.3,3.5] -> [1.5,3.8],
# fully inside the gondola below, 0.2s apart (SAMPLE_DT).
NEAR_GONDOLA = {"id": "g1", "name": "Cerca", "x": 0.5, "z": 3.0, "width": 1.5, "depth": 1.5, "rotation": 0}
FAR_GONDOLA = {"id": "g2", "name": "Lejos", "x": 10.0, "z": 0.0, "width": 0.5, "depth": 0.5, "rotation": 0}


def test_simulate_counts_traffic_and_dwell_for_a_nearby_gondola():
    result = advanced_result("sim001")
    simulation = simulate_layout(result, [NEAR_GONDOLA])
    gondola = simulation["gondolas"][0]
    assert gondola["id"] == "g1"
    assert gondola["traffic"] == 1
    assert gondola["dwell_seconds"] == pytest.approx(0.6, abs=1e-6)
    # 3 samples spanning 0.6s never reach engaged_seconds (1.2s default): no interaction yet.
    assert gondola["interactions"] == 0
    assert gondola["pickups"] == 0
    assert simulation["sampled_tracks"] == 1


def test_simulate_reports_zero_for_a_gondola_the_trajectory_never_reaches():
    result = advanced_result("sim002")
    simulation = simulate_layout(result, [FAR_GONDOLA])
    gondola = simulation["gondolas"][0]
    assert gondola["traffic"] == 0
    assert gondola["dwell_seconds"] == 0.0


def test_simulate_rejects_empty_layout():
    with pytest.raises(ValueError, match="no tiene góndolas"):
        simulate_layout(advanced_result("sim003"), [])


def test_simulate_rejects_normalized_coordinate_system():
    with pytest.raises(ValueError, match="modo avanzado"):
        simulate_layout(fast_result("sim004"), [NEAR_GONDOLA])


def test_simulate_rejects_missing_geometry():
    with pytest.raises(ValueError, match="geometría válida"):
        simulate_layout(advanced_result("sim005"), [{"id": "g1", "name": "Sin geometría"}])


def test_simulate_endpoint_returns_recalculated_gondolas(client, state):
    make_analysis(state, "sim006", site_id=1, status="completed", result=advanced_result("sim006"))
    set_user(state, 1)
    response = client.post("/api/analyses/sim006/simulate", json={"gondolas": [NEAR_GONDOLA]})
    assert response.status_code == 200
    body = response.json()
    assert body["analysis_id"] == "sim006"
    assert body["gondolas"][0]["traffic"] == 1


def test_simulate_endpoint_422_on_fast_mode_analysis(client, state):
    make_analysis(state, "sim007", site_id=1, status="completed", result=fast_result("sim007"))
    set_user(state, 1)
    response = client.post("/api/analyses/sim007/simulate", json={"gondolas": [NEAR_GONDOLA]})
    assert response.status_code == 422


def test_simulate_endpoint_404_for_missing_analysis(client, state):
    set_user(state, 1)
    response = client.post("/api/analyses/does-not-exist/simulate", json={"gondolas": [NEAR_GONDOLA]})
    assert response.status_code == 404


def test_simulate_endpoint_403_for_foreign_analysis(client, state):
    make_analysis(state, "sim008", site_id=2, status="completed", result=advanced_result("sim008"))
    set_user(state, 2)  # user 2 belongs to retailer_a (site 1), site_id=2 belongs to retailer_b
    response = client.post("/api/analyses/sim008/simulate", json={"gondolas": [NEAR_GONDOLA]})
    assert response.status_code == 403
