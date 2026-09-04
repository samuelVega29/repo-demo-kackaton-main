import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..cv.shelf_detector import suggest_gondolas
from ..cv.spatial import with_homographies
from ..database import get_db
from ..models import Retailer, Site, User
from ..security import current_user


router = APIRouter(prefix="/api", tags=["catalog"])


def empty_site_configuration(width: float, depth: float, camera_name: str) -> dict:
    return {
        "version": 1,
        "units": "meters",
        "floor": {"width": width, "depth": depth},
        "camera": {
            "name": camera_name,
            "source_normalized": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
            "target_meters": [[0.0, 0.0], [width, 0.0], [width, depth], [0.0, depth]],
            "calibration_status": "uncalibrated",
        },
        "zones": [],
        "gondolas": [],
        "thresholds": {
            "approach_m": 1.5,
            "engaged_m": 0.8,
            "engaged_seconds": 2.0,
            "interaction_seconds": 4.0,
            "minimum_track_seconds": 2.0,
            "pickup_reach_m": 0.5,
            "pickup_min_seconds": 0.6,
            "pickup_cooldown_s": None,
        },
    }


def site_payload(site: Site, include_configuration: bool = True) -> dict:
    payload = {"id": site.id, "retailer_id": site.retailer_id, "name": site.name, "city": site.city}
    if include_configuration:
        payload["configuration"] = with_homographies(site.configuration)
    return payload


@router.get("/retailers")
def retailers(user: User = Depends(current_user), database: Session = Depends(get_db)) -> list[dict]:
    query = select(Retailer)
    if user.role != "admin":
        query = query.where(Retailer.id == user.retailer_id)
    return [{"id": item.id, "name": item.name, "code": item.code, "site_count": len(item.sites)} for item in database.scalars(query).all()]


@router.get("/retailers/{retailer_id}/sites")
def sites(retailer_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> list[dict]:
    if user.role != "admin" and user.retailer_id != retailer_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este retailer")
    return [site_payload(item) for item in database.scalars(select(Site).where(Site.retailer_id == retailer_id)).all()]


class SiteCreateBody(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    city: str = Field(min_length=2, max_length=100)
    camera_name: str = Field(min_length=2, max_length=140)
    floor_width: float = Field(ge=2, le=100)
    floor_depth: float = Field(ge=2, le=100)


@router.post("/retailers/{retailer_id}/sites", status_code=201)
def create_site(
    retailer_id: int,
    body: SiteCreateBody,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    retailer = database.get(Retailer, retailer_id)
    if not retailer or (user.role != "admin" and user.retailer_id != retailer_id):
        raise HTTPException(status_code=404, detail="Retailer no encontrado")
    site = Site(
        retailer_id=retailer_id,
        name=body.name.strip(),
        city=body.city.strip(),
        configuration=empty_site_configuration(body.floor_width, body.floor_depth, body.camera_name.strip()),
    )
    database.add(site)
    database.commit()
    return site_payload(site)


@router.get("/sites/{site_id}")
def site_detail(site_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> dict:
    site = database.get(Site, site_id)
    if not site or (user.role != "admin" and user.retailer_id != site.retailer_id):
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    return site_payload(site)


class ConfigurationBody(BaseModel):
    configuration: dict


@router.put("/sites/{site_id}/configuration")
def update_configuration(
    site_id: int,
    body: ConfigurationBody,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    site = database.get(Site, site_id)
    if not site or (user.role != "admin" and user.retailer_id != site.retailer_id):
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    site.configuration = body.configuration
    database.commit()
    return site_payload(site)


class SuggestGondolasBody(BaseModel):
    configuration: dict
    image: str
    image_width: int = Field(ge=16, le=8192)
    image_height: int = Field(ge=16, le=8192)


@router.post("/sites/{site_id}/suggest-gondolas")
def suggest_gondolas_endpoint(
    site_id: int,
    body: SuggestGondolasBody,
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    site = database.get(Site, site_id)
    if not site or (user.role != "admin" and user.retailer_id != site.retailer_id):
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    try:
        encoded = body.image.split(",", 1)[1] if "," in body.image else body.image
        image_bytes = base64.b64decode(encoded)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=400, detail="Imagen inválida") from exc
    try:
        candidates = suggest_gondolas(body.configuration, image_bytes, body.image_width, body.image_height)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No fue posible detectar góndolas: {str(exc)[:200]}") from exc
    return {"candidates": candidates, "count": len(candidates)}
