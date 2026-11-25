"""Regresión de la autenticación de artefactos por query token.

Reproduce el caso real de las imágenes de heatmap/overlay: el browser carga el URL
con ``?token=<JWT válido>`` y a la vez manda la cookie httpOnly ``scapder_session``.
Si la cookie quedó obsoleta (otra clave previa / sesión vieja), no debe "sombrear"
al token explícito: el query token debe prevalecer y el recurso servirse con 200.
"""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.database import get_db
from app.models import User
from app.security import create_token, user_from_query_token


@pytest.mark.usefixtures("state")
def test_query_token_prevalece_sobre_cookie_obsoleta(state) -> None:
    app = FastAPI()

    @app.get("/check")
    def check(user=Depends(user_from_query_token)) -> dict:
        return {"email": user.email}

    def override_get_db():
        yield state.session

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    valid = create_token(state.session.get(User, 1))
    client.cookies.set("scapder_session", "token-obsoleto-invalido")

    res = client.get("/check", params={"token": valid})
    assert res.status_code == 200, f"El query token válido fue ignorado: {res.status_code} {res.text}"


@pytest.mark.usefixtures("state")
def test_cookie_valida_es_fallback_cuando_no_hay_query_token(state) -> None:
    app = FastAPI()

    @app.get("/check")
    def check(user=Depends(user_from_query_token)) -> dict:
        return {"email": user.email}

    def override_get_db():
        yield state.session

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    valid = create_token(state.session.get(User, 1))
    client.cookies.set("scapder_session", valid)

    res = client.get("/check")
    assert res.status_code == 200
    assert res.json()["email"] == "admin@test.ai"