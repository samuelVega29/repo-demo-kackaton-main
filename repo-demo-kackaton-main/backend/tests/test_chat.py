"""Contracts for POST /api/chat (asistente conversacional)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import _override_current_user, _override_get_db, advanced_result, fast_result, make_analysis

from app.config import settings
from app.database import get_db
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
    assert "datos reales del último análisis" not in captured["system"]
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