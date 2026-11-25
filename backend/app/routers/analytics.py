from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Analysis, Site, User
from ..security import current_user


router = APIRouter(prefix="/api/sites", tags=["analytics"])


def can_access(user: User, site: Site) -> bool:
    # The single admin role reaches every site.
    return user.role == "admin" or user.retailer_id == site.retailer_id


def site_or_403(user: User, site_id: int, database: Session) -> Site:
    site = database.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    if not can_access(user, site):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta sede")
    return site


def latest_analysis(user: User, site_id: int, database: Session) -> Analysis:
    """Returns the newest completed analysis for a site, or 404 if none exists."""
    site = site_or_403(user, site_id, database)
    analysis = database.scalars(
        select(Analysis)
        .where(Analysis.site_id == site.id, Analysis.status == "completed")
        .order_by(Analysis.created_at.desc())
        .limit(1)
    ).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Todavía no hay resultados analizados para esta sede")
    return analysis


@router.get("/{site_id}/summary")
def site_summary(site_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> dict:
    site = site_or_403(user, site_id, database)
    analysis = latest_analysis(user, site_id, database)
    result = analysis.result or {}
    return {
        "site": result.get("site", {"id": site.id, "name": site.name, "city": site.city}),
        "video": result.get("video", {}),
        "metrics": result.get("metrics", {}),
        "gondolas": result.get("gondolas", []),
        "zones": result.get("zones", []),
        "analysis_id": analysis.id,
        "created_at": analysis.created_at.isoformat() if analysis.created_at else None,
    }


@router.get("/{site_id}/heatmap")
def site_heatmap(site_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> dict:
    site = site_or_403(user, site_id, database)
    analysis = latest_analysis(user, site_id, database)
    result = analysis.result or {}
    return {
        "site_id": site.id,
        "analysis_id": analysis.id,
        "heatmaps": result.get("heatmaps", {}),
        "floor": result.get("site", {}).get("configuration", {}).get("floor", {}),
    }


@router.get("/{site_id}/trajectories")
def site_trajectories(site_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> dict:
    site = site_or_403(user, site_id, database)
    analysis = latest_analysis(user, site_id, database)
    result = analysis.result or {}
    return {
        "site_id": site.id,
        "analysis_id": analysis.id,
        "trajectories": result.get("trajectories", []),
        "metrics": result.get("metrics", {}),
        "floor": result.get("site", {}).get("configuration", {}).get("floor", {}),
    }


@router.get("/{site_id}/dwell")
def site_dwell(site_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> dict:
    site = site_or_403(user, site_id, database)
    analysis = latest_analysis(user, site_id, database)
    result = analysis.result or {}
    return {
        "site_id": site.id,
        "analysis_id": analysis.id,
        "zones": result.get("zones", []),
        "gondolas": result.get("gondolas", []),
        "duration_seconds": (result.get("video") or {}).get("duration_seconds"),
    }


@router.get("/{site_id}/interactions")
def site_interactions(site_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> dict:
    site = site_or_403(user, site_id, database)
    analysis = latest_analysis(user, site_id, database)
    result = analysis.result or {}
    return {
        "site_id": site.id,
        "analysis_id": analysis.id,
        "gondolas": result.get("gondolas", []),
        "interaction_events_log": result.get("interaction_events_log", []),
        "interaction_histogram": result.get("interaction_histogram"),
        "pickup_events_log": result.get("pickup_events_log", []),
        "pickup_histogram": result.get("pickup_histogram"),
    }


@router.get("/{site_id}/recommendations")
def site_recommendations(site_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> dict:
    site = site_or_403(user, site_id, database)
    analysis = latest_analysis(user, site_id, database)
    result = analysis.result or {}
    findings = result.get("findings", [])
    recommendations = [f for f in findings if f.get("type") == "recommendation"]
    return {
        "site_id": site.id,
        "analysis_id": analysis.id,
        "recommendations": recommendations,
        "findings": findings,
    }


@router.get("/{site_id}/visualization-3d")
def site_visualization_3d(site_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> dict:
    site = site_or_403(user, site_id, database)
    analysis = latest_analysis(user, site_id, database)
    result = analysis.result or {}
    configuration = result.get("site", {}).get("configuration", {})
    camera = configuration.get("camera", {})
    return {
        "site_id": site.id,
        "analysis_id": analysis.id,
        "configuration": configuration,
        "camera": {
            "model_3d": camera.get("model_3d"),
            "homography": camera.get("homography"),
            "model_3d_projection": camera.get("model_3d_projection"),
            "model_3d_inverse": camera.get("model_3d_inverse"),
            "model_3d_camera_center": camera.get("model_3d_camera_center"),
        },
        "gondolas": result.get("gondolas", []),
        "zones": result.get("zones", []),
        "metrics": result.get("metrics", {}),
    }


@router.get("/{site_id}/report")
def site_report(site_id: int, user: User = Depends(current_user), database: Session = Depends(get_db)) -> dict:
    site = site_or_403(user, site_id, database)
    analysis = latest_analysis(user, site_id, database)
    result = analysis.result or {}
    return {
        "site": result.get("site", {"id": site.id, "name": site.name, "city": site.city}),
        "video": result.get("video", {}),
        "metrics": result.get("metrics", {}),
        "model": result.get("model", {}),
        "gondolas": result.get("gondolas", []),
        "zones": result.get("zones", []),
        "heatmaps": result.get("heatmaps", {}),
        "findings": result.get("findings", []),
        "quality": result.get("quality", {}),
        "analysis_id": analysis.id,
        "created_at": analysis.created_at.isoformat() if analysis.created_at else None,
    }
