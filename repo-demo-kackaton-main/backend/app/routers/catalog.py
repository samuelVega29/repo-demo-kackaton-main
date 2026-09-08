import base64
import binascii
import shutil
import tempfile
from pathlib import Path
import cv2

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.layout_builder import suggest_full_layout
from ..cv.shelf_detector import suggest_gondolas
from ..cv.spatial import with_homographies
from ..database import get_db
from ..models import Retailer, Site, User
from ..security import current_user, require_admin

router = APIRouter(prefix="/api", tags=["catalog"])
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
RESULT_DIR = DATA_DIR / "results"


def ensure_retailer_access(user: User, retailer_id: int) -> None:
    """The single admin role reaches every retailer."""
    if user.role != "admin" and user.retailer_id != retailer_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este retailer")


def get_assigned_retailer_or_404(user: User, retailer_id: int, database: Session) -> Retailer:
    ensure_retailer_access(user, retailer_id)
    retailer = database.get(Retailer, retailer_id)
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer no encontrado")
    return retailer


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


@router.get("/me/retailers")
def my_retailers(user: User = Depends(current_user), database: Session = Depends(get_db)) -> list[dict]:
    query = select(Retailer)
    if user.role != "admin":
        query = query.where(Retailer.id == user.retailer_id)
    return [
        {"id": item.id, "name": item.name, "code": item.code, "site_count": len(item.sites)}
        for item in database.scalars(query).all()
    ]


@router.get("/me/retailers/{retailer_id}/sites")
def my_retailer_sites(retailer_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> list[dict]:
    get_assigned_retailer_or_404(user, retailer_id, database)
    return [site_payload(item) for item in database.scalars(select(Site).where(Site.retailer_id == retailer_id)).all()]


@router.get("/retailers")
def retailers(user: User = Depends(current_user), database: Session = Depends(get_db)) -> list[dict]:
    return my_retailers(user, database)


@router.get("/retailers/{retailer_id}/sites")
def sites(retailer_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> list[dict]:
    return my_retailer_sites(retailer_id, user, database)


class RetailerCreateBody(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    code: str = Field(min_length=2, max_length=50)


@router.post("/retailers", status_code=201)
def create_retailer(
    body: RetailerCreateBody,
    user: User = Depends(require_admin),
    database: Session = Depends(get_db),
) -> dict:
    name = body.name.strip()
    code = body.code.strip()
    existing = database.scalars(select(Retailer).where((Retailer.name == name) | (Retailer.code == code))).first()
    if existing:
        field = "name" if existing.name == name else "code"
        raise HTTPException(status_code=400, detail=f"El campo {field} ya está en uso")
    retailer = Retailer(name=name, code=code)
    database.add(retailer)
    database.commit()
    return {"id": retailer.id, "name": retailer.name, "code": retailer.code, "site_count": 0}


@router.delete("/retailers/{retailer_id}", status_code=204)
def delete_retailer(
    retailer_id: int,
    user: User = Depends(require_admin),
    database: Session = Depends(get_db),
) -> None:
    retailer = database.get(Retailer, retailer_id)
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer no encontrado")
    sites = database.scalars(select(Site).where(Site.retailer_id == retailer.id)).all()
    for site in sites:
        delete_site_data(site.id, database)
        database.delete(site)
    database.delete(retailer)
    database.commit()


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
    user: User = Depends(require_admin),
    database: Session = Depends(get_db),
) -> dict:
    retailer = get_assigned_retailer_or_404(user, retailer_id, database)
    site = Site(
        retailer_id=retailer.id,
        name=body.name.strip(),
        city=body.city.strip(),
        configuration=empty_site_configuration(body.floor_width, body.floor_depth, body.camera_name.strip()),
    )
    database.add(site)
    database.commit()
    return site_payload(site)


def delete_site_data(site_id: int, database: Session) -> None:
    from ..models import Analysis

    analyses = database.scalars(select(Analysis).where(Analysis.site_id == site_id)).all()
    for analysis in analyses:
        video_path = Path(analysis.video_path)
        if video_path.exists() and video_path.is_file():
            video_path.unlink(missing_ok=True)
        result_path = RESULT_DIR / analysis.id
        if result_path.exists():
            shutil.rmtree(result_path, ignore_errors=True)
        database.delete(analysis)


def get_site_or_403(user: User, site_id: int, database: Session) -> Site:
    site = database.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    ensure_retailer_access(user, site.retailer_id)
    return site


@router.get("/sites/{site_id}")
def site_detail(site_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> dict:
    return site_payload(get_site_or_403(user, site_id, database))


@router.delete("/sites/{site_id}", status_code=204)
def delete_site(
    site_id: int,
    user: User = Depends(require_admin),
    database: Session = Depends(get_db),
) -> None:
    site = get_site_or_403(user, site_id, database)
    delete_site_data(site.id, database)
    database.delete(site)
    database.commit()


class ConfigurationBody(BaseModel):
    configuration: dict


@router.put("/sites/{site_id}/configuration")
def update_configuration(
    site_id: int,
    body: ConfigurationBody,
    user: User = Depends(require_admin),
    database: Session = Depends(get_db),
) -> dict:
    site = get_site_or_403(user, site_id, database)
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
    user: User = Depends(require_admin),
    database: Session = Depends(get_db),
) -> dict:
    get_site_or_403(user, site_id, database)
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

def extract_sample_frames(video_path: Path, output_dir: Path, count: int = 3) -> list[Path]:
    """Extrae frames espaciados para Claude Vision."""
    capture = cv2.VideoCapture(str(video_path))
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames <= 0:
        capture.release()
        raise RuntimeError("No se pudo leer el video")

    denom = max(1, count - 1)
    targets = sorted({round(i * max(0, total_frames - 1) / denom) for i in range(count)})
    target_set = set(targets)

    saved: list[Path] = []
    frame_index = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if frame_index in target_set:
            path = output_dir / f"layout_frame_{len(saved) + 1}.jpg"
            cv2.imwrite(str(path), frame)
            saved.append(path)
        frame_index += 1
        if len(saved) >= count:
            break
    capture.release()
    if not saved:
        raise RuntimeError("No se pudieron extraer frames")
    return saved


@router.post("/sites/{site_id}/layout-suggestions")
def create_layout_suggestions(
    site_id: int,
    video: UploadFile = File(...),
    user: User = Depends(current_user),
    database: Session = Depends(get_db),
) -> dict:
    site = database.get(Site, site_id)
    if not site or (user.role != "admin" and user.retailer_id != site.retailer_id):
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        video_path = tmp_dir / "video.mp4"
        with video_path.open("wb") as target:
            shutil.copyfileobj(video.file, target)

        try:
            frame_paths = extract_sample_frames(video_path, tmp_dir, count=3)
            result = suggest_full_layout(frame_paths, site.configuration)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return result
