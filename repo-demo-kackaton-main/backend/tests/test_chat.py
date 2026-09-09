"""Contracts for POST /api/chat (asistente conversacional)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import _override_current_user, _override_get_db, advanced_result, fast_result, make_analysis

from app.config import settings
from app.database import get_db
from app.models import Analysis
from app.routers import chat as chat_module
from app.security import current_user


@pytest.fixture
def chat_client():
    app = FastAPI()
    app.include_router(chat_module.router)
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[current_user] = _override_current_user
    return TestClient(app)


def set_user(state, user_id):
    from app.models import User

    state.user = state.session.get(User, user_id)


def _enable_key(monkeypatch, value="test-key"):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", value)


def _capture_ask(monkeypatch):
    captured = {}

    def fake_ask(system_prompt, messages):
        captured["system"] = system_prompt
        captured["messages"] = messages
        return "Respuesta de prueba del asistente"

    monkeypatch.setattr(chat_module, "_ask_gemini", fake_ask)
    return captured


def test_no_key_returns_setup_reply(chat_client, state, monkeypatch):
    _enable_key(monkeypatch, value="")
    set_user(state, 1)
    response = chat_client.post("/api/chat", json={"message": "hola"})
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == chat_module.NO_KEY_REPLY
    assert body["report_context"] is False


def test_chat_without_site_has_no_report_context(chat_client, state, monkeypatch):
    _enable_key(monkeypatch)
    captured = _capture_ask(monkeypatch)
    set_user(state, 1)
    response = chat_client.post(
        "/api/chat",
        json={"message": "¿cómo subo un video?", "history": [{"role": "user", "content": "hola"}]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Respuesta de prueba del asistente"
    assert body["report_context"] is False
    assert captured["system"] == chat_module.SYSTEM_PROMPT
    assert [m["role"] for m in captured["messages"]] == ["user", "user"]


def test_chat_with_site_injects_report_context(chat_client, state, monkeypatch):
    _enable_key(monkeypatch)
    captured = _capture_ask(monkeypatch)
    make_analysis(state, "chat001", site_id=1, status="completed", result=advanced_result("chat001"))
    set_user(state, 1)  # admin
    response = chat_client.post("/api/chat", json={"message": "explícame las recomendaciones", "site_id": 1})
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["report_context"] is True
    assert "INFORMACION_DEL_INFORME" in captured["system"]
    assert "Despensa" in captured["system"]
    assert captured["messages"][-1] == {"role": "user", "content": "explícame las recomendaciones"}


def test_chat_limits_history_to_last_turns(chat_client, state, monkeypatch):
    _enable_key(monkeypatch)
    captured = _capture_ask(monkeypatch)
    set_user(state, 1)
    history = [{"role": "user" if i % 2 == 0 else "model", "content": f"turno {i}"} for i in range(30)]
    response = chat_client.post("/api/chat", json={"message": "fin", "history": history})
    assert response.status_code == 200
    assert len(captured["messages"]) == chat_module.MAX_HISTORY_TURNS + 1  # historial + pregunta actual
    assert captured["messages"][-1]["content"] == "fin"


def test_chat_foreign_site_403(chat_client, state, monkeypatch):
    _enable_key(monkeypatch)
    _capture_ask(monkeypatch)
    make_analysis(state, "chat002", site_id=2, status="completed", result=fast_result("chat002"))
    set_user(state, 2)  # cliente del retailer 101; la sede 2 es del retailer 102
    response = chat_client.post("/api/chat", json={"message": "hola", "site_id": 2})
    assert response.status_code == 403


def test_chat_unknown_site_404(chat_client, state, monkeypatch):
    _enable_key(monkeypatch)
    _capture_ask(monkeypatch)
    set_user(state, 1)
    response = chat_client.post("/api/chat", json={"message": "hola", "site_id": 999})
    assert response.status_code == 404


def test_chat_during_processing_uses_progress_context(chat_client, state, monkeypatch):
    """Mientras se analiza un video (sin informe completado) no debe dar 404:
    el bot recibe el estado real del job en curso."""
    _enable_key(monkeypatch)
    captured = _capture_ask(monkeypatch)
    make_analysis(
        state,
        "proc001",
        site_id=1,
        status="processing",
        stage="tracking",
        progress=47,
        message="YOLO + ByteTrack · frame 57/120",
    )
    set_user(state, 1)
    response = chat_client.post("/api/chat", json={"message": "¿cómo va el análisis?", "site_id": 1})
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["report_context"] is True
    assert body["status"] == "processing"
    assert body["progress"] == 47
    assert body["stage"] == "tracking"
    assert "ESTADO_DEL_ANALISIS" in captured["system"]
    assert "47%" in captured["system"]
    assert "Analizando trayectorias" in captured["system"]
    assert captured["messages"][-1] == {"role": "user", "content": "¿cómo va el análisis?"}


def test_chat_with_analysis_id_points_to_running_job(chat_client, state, monkeypatch):
    """El frontend puede apuntar al job exacto en ejecución aunque exista un
    análisis anterior completado."""
    _enable_key(monkeypatch)
    captured = _capture_ask(monkeypatch)
    make_analysis(state, "prev001", site_id=1, status="completed", result=advanced_result("prev001"))
    make_analysis(
        state,
        "running1",
        site_id=1,
        status="processing",
        stage="tracking",
        progress=63,
        message="Procesando frame 75",
    )
    set_user(state, 1)
    response = chat_client.post(
        "/api/chat",
        json={"message": "¿cuánto falta?", "site_id": 1, "analysis_id": "running1"},
    )
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["analysis_id"] == "running1"
    assert body["progress"] == 63
    assert "ESTADO_DEL_ANALISIS" in captured["system"]
    assert "prev001" not in captured["system"]


def test_chat_without_any_analysis_is_friendly_not_404(chat_client, state, monkeypatch):
    """Sede sin análisis: respuesta amable (no 404 opaco) para que el bot
    explique cómo cargar un video."""
    _enable_key(monkeypatch)
    captured = _capture_ask(monkeypatch)
    set_user(state, 1)
    # Aislamiento: la base es compartida entre tests de esta sesión.
    state.session.query(Analysis).delete()
    state.session.commit()
    response = chat_client.post("/api/chat", json={"message": "dame cifras", "site_id": 1})
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["report_context"] is True
    assert body["analysis_id"] is None
    assert "no hay ningún análisis" in captured["system"].lower() or "ningún análisis" in captured["system"]


def test_chat_stream_yields_deltas_and_done(chat_client, state, monkeypatch):
    _enable_key(monkeypatch)
    set_user(state, 1)

    def fake_stream(system_prompt, messages):
        yield "Hola, "
        yield "soy el asistente."

    monkeypatch.setattr(chat_module, "_stream_gemini", fake_stream)

    response = chat_client.post(
        "/api/chat/stream",
        json={"message": "¿cómo va el análisis?", "site_id": 1},
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert '{"type": "delta", "delta": "Hola, "}' in response.text
    assert '{"type": "delta", "delta": "soy el asistente."}' in response.text
    assert '"type": "done"' in response.text


def test_chat_stream_no_key_returns_setup_reply(chat_client, state, monkeypatch):
    _enable_key(monkeypatch, value="")
    set_user(state, 1)
    response = chat_client.post("/api/chat/stream", json={"message": "hola"})
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert chat_module.NO_KEY_REPLY in response.text


def test_ask_gemini_tries_fallback_models(chat_client, state, monkeypatch):
    import google.genai

    _enable_key(monkeypatch)
    monkeypatch.setattr(settings, "GEMINI_MODEL", "modelo-primario")
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODELS", ["modelo-fallback"])
    used: list[str] = []

    class FakeResponse:
        text = "Fallo el primario, usa el fallback."

    def fake_generate_content(self, model, contents, config):
        used.append(model)
        if model == "modelo-fallback":
            return FakeResponse()
        raise RuntimeError(f"{model} saturado")

    class FakeModels:
        generate_content = fake_generate_content

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.models = FakeModels()

    monkeypatch.setattr(google.genai, "Client", FakeClient)

    set_user(state, 1)
    response = chat_client.post("/api/chat", json={"message": "hola"})
    assert response.status_code == 200
    assert response.json()["reply"] == "Fallo el primario, usa el fallback."
    assert used == ["modelo-primario", "modelo-fallback"]


def test_ask_gemini_returns_unavailable_when_all_models_fail(chat_client, state, monkeypatch):
    import google.genai

    _enable_key(monkeypatch)
    monkeypatch.setattr(settings, "GEMINI_MODEL", "modelo-primario")
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODELS", ["modelo-fallback"])

    def fake_generate_content(self, model, contents, config):
        raise RuntimeError(f"{model} saturado")

    class FakeModels:
        generate_content = fake_generate_content

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.models = FakeModels()

    monkeypatch.setattr(google.genai, "Client", FakeClient)

    set_user(state, 1)
    response = chat_client.post("/api/chat", json={"message": "hola"})
    assert response.status_code == 200
    assert response.json()["reply"] == chat_module.UNAVAILABLE_REPLY


def test_chat_empty_message_422(chat_client, state, monkeypatch):
    _enable_key(monkeypatch)
    set_user(state, 1)
    response = chat_client.post("/api/chat", json={"message": ""})
    assert response.status_code == 422