from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Site


router = APIRouter(
    prefix="/sites",
    tags=["sites"],
)


@router.delete("/{site_id}")
def delete_site(site_id: int):
    db: Session = SessionLocal()

    try:
        site = (
            db.query(Site)
            .filter(Site.id == site_id)
            .first()
        )

        if not site:
            raise HTTPException(
                status_code=404,
                detail="La sede no existe",
            )

        db.delete(site)
        db.commit()

        return {
            "message": "Sede eliminada correctamente",
            "site_id": site_id,
        }

    except HTTPException:
        raise

    except Exception as error:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"No fue posible eliminar la sede: {str(error)}",
        )

    finally:
        db.close()