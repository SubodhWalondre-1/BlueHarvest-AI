from fastapi import APIRouter, Depends, HTTPException, Query, status
import logging
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import CountSession, User
from app.schemas.count import CountSessionSave, CountSessionUpdate
from app.services.inference_resource_service import cleanup_pending_images, lock_capacity, mark_unused_session_image

router = APIRouter(prefix="/api/count-sessions", tags=["count sessions and ledger"])
logger = logging.getLogger(__name__)


def _present(item: CountSession) -> dict:
    confidence = None if item.confidence is None else round(item.confidence * 100, 2)
    return {
        "id": item.batch_code,
        "session_id": item.id,
        "count": item.count,
        "time": item.created_at.isoformat() + "Z" if item.created_at else None,
        "pond": item.pond_location,
        "density": item.density,
        "source": item.source,
        "container": item.container,
        "dimensions": item.dimensions,
        "image": item.image_path,
        "confidence": f"{confidence}%" if confidence is not None else None,
        "avgLength": f"{item.avg_length_mm:g} mm" if item.avg_length_mm is not None else None,
        "status": "Demo sample" if item.is_demo else item.status if item.inference_verified else "Unverified legacy record",
        "method": item.method,
        "is_demo": item.is_demo,
        "is_saved": item.is_saved,
        "inference_verified": item.inference_verified,
        "processing_time_ms": item.processing_time_ms,
        "created_at": item.created_at.isoformat() + "Z" if item.created_at else None,
    }


@router.post("")
def save_inference_session(body: CountSessionSave, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return save_count_session(str(body.session_id), CountSessionUpdate(), user, db)


@router.get("")
def list_count_sessions(
    include_unsaved: bool = Query(default=True),
    include_demo: bool = Query(default=False),
    include_unverified: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    if include_demo and not settings.demo_mode_enabled:
        raise HTTPException(status_code=403, detail={"code": "demo_mode_disabled", "message": "Demo data mode is disabled."})
    stmt = select(CountSession).where(CountSession.user_id == user.id)
    if not include_unverified:
        stmt = stmt.where(or_(CountSession.inference_verified.is_(True), CountSession.is_demo.is_(True)))
    if not include_unsaved:
        stmt = stmt.where(CountSession.is_saved.is_(True))
    if not include_demo:
        stmt = stmt.where(CountSession.is_demo.is_(False))
    stmt = stmt.order_by(CountSession.created_at.desc()).limit(limit).offset(offset)
    items = list(db.scalars(stmt))
    return {"items": [_present(item) for item in items], "limit": limit, "offset": offset}


@router.get("/{session_id}")
def get_count_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.scalar(select(CountSession).where(CountSession.id == session_id, CountSession.user_id == user.id))
    if not item:
        # Accept the external batch code too, because the frontend displays it as id.
        item = db.scalar(select(CountSession).where(CountSession.batch_code == session_id, CountSession.user_id == user.id))
    if not item:
        raise HTTPException(status_code=404, detail={"code": "count_session_not_found", "message": "Count session was not found."})
    return {"session": _present(item)}


@router.patch("/{session_id}/save")
def save_count_session(session_id: str, body: CountSessionUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lock_capacity(db)
    item = db.scalar(select(CountSession).where(CountSession.id == session_id, CountSession.user_id == user.id))
    if not item:
        item = db.scalar(select(CountSession).where(CountSession.batch_code == session_id, CountSession.user_id == user.id))
    if not item:
        raise HTTPException(status_code=404, detail={"code": "count_session_not_found", "message": "Count session was not found."})
    if item.is_demo:
        raise HTTPException(status_code=403, detail={"code": "demo_fixture_read_only", "message": "Demo records cannot be saved as inference results."})
    if body.is_saved and not item.inference_verified:
        raise HTTPException(status_code=409, detail={"code": "inference_not_verified", "message": "Run inference again before saving this legacy record."})
    item.is_saved = body.is_saved
    db.commit()
    db.refresh(item)
    return {"session": _present(item)}


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_count_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lock_capacity(db)
    item = db.scalar(select(CountSession).where(CountSession.id == session_id, CountSession.user_id == user.id))
    if not item:
        item = db.scalar(select(CountSession).where(CountSession.batch_code == session_id, CountSession.user_id == user.id))
    if not item:
        raise HTTPException(status_code=404, detail={"code": "count_session_not_found", "message": "Count session was not found."})
    image_path = item.image_path
    db.delete(item)
    db.flush()
    mark_unused_session_image(db, user.id, image_path)
    db.commit()
    try:
        cleanup_pending_images(db, user.id)
    except Exception:
        db.rollback()
        logger.exception("Deleted session image cleanup will be retried on startup or the next upload.")
    return None
