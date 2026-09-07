from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..security import hash_password, require_admin


router = APIRouter(prefix="/api/users", tags=["users"])


def user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "retailer_id": user.retailer_id,
    }


class UserCreateBody(BaseModel):
    email: str = Field(min_length=3, max_length=180)
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    role: str = Field(default="analista", pattern="^(admin|analista)$")
    retailer_id: int | None = Field(default=None)


class UserUpdateBody(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    role: str | None = Field(default=None, pattern="^(admin|analista)$")
    retailer_id: int | None = Field(default=None)


@router.get("")
def list_users(user: User = Depends(require_admin), database: Session = Depends(get_db)) -> list[dict]:
    return [user_payload(item) for item in database.scalars(select(User).order_by(User.id)).all()]


@router.post("", status_code=201)
def create_user(
    body: UserCreateBody,
    user: User = Depends(require_admin),
    database: Session = Depends(get_db),
) -> dict:
    email = body.email.lower().strip()
    if database.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    created = User(
        email=email,
        name=body.name.strip(),
        password_hash=hash_password(body.password),
        role=body.role,
        retailer_id=body.retailer_id,
    )
    database.add(created)
    database.commit()
    return user_payload(created)


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    body: UserUpdateBody,
    user: User = Depends(require_admin),
    database: Session = Depends(get_db),
) -> dict:
    target = database.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if body.name is not None:
        target.name = body.name.strip()
    if body.role is not None:
        target.role = body.role
    if "retailer_id" in body.model_fields_set:
        target.retailer_id = body.retailer_id
    if target.role == "admin":
        target.retailer_id = None
    database.commit()
    return user_payload(target)
