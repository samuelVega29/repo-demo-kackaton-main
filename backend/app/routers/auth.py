from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..security import create_token, current_user, verify_password


router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str
    password: str


def user_payload(user: User) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "retailer_id": user.retailer_id}


@router.post("/login")
def login(body: LoginBody, response: Response, database: Session = Depends(get_db)) -> dict:
    user = database.scalar(select(User).where(User.email == body.email.lower().strip()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    token = create_token(user)
    response.set_cookie("scapder_session", token, httponly=True, samesite="lax", max_age=43200)
    return {"access_token": token, "token_type": "bearer", "user": user_payload(user)}


@router.post("/logout", status_code=204)
def logout(response: Response) -> None:
    response.delete_cookie("scapder_session")


@router.get("/me")
def me(user: User = Depends(current_user)) -> dict:
    return user_payload(user)
