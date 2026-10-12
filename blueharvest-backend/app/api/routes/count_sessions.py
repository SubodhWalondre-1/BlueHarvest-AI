from datetime import datetime
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import CountSession, User
from app.schemas.count import CountSessionCreate, CountSessionUpdate
from app.core.time import utcnow_naive

router = APIRouter(prefix="/api/count-sessions", tags=["count sessions and ledger"])


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
        "status": "Demo sample" if item.is_demo else item.status,
        "method": item.method,
        "is_demo": item.is_demo,
        "is_saved": item.is_saved,
        "processing_time_ms": item.processing_time_ms,
        "created_at": item.created_at.isoformat() + "Z" if item.created_at else None,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_count_session(body: CountSessionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.is_demo:
        raise HTTPException(status_code=403, detail={"code": "demo_fixture_read_only", "message": "Demo records are managed by the explicitly labelled demo fixture. Clients cannot submit demo metrics."})
    if body.count is None:
        raise HTTPException(status_code=422, detail={"code": "count_required", "message": "A real count result is required to create a completed count session."})
    now = utcnow_naive()
    item = CountSession(
        id=str(uuid4()), batch_code=f"BAT-{now:%y%m%d}-{uuid4().hex[:6].upper()}", user_id=user.id,
        count=body.count, status=body.status, is_saved=False, is_demo=False,
        source=body.source, container=body.container, dimensions=body.dimensions,
        pond_location=body.pond_location or user.pond_location, density=body.density,
        confidence=body.confidence, avg_length_mm=body.avg_length_mm,
        processing_time_ms=body.processing_time_ms, method=body.method,
        image_path=body.image_path or body.image_url, heatmap_path=None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"session": _present(item)}


@router.get("")
def list_count_sessions(
    include_unsaved: bool = Query(default=True),
    include_demo: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    if include_demo and not settings.demo_mode_enabled:
        raise HTTPException(status_code=403, detail={"code": "demo_mode_disabled", "message": "Demo data mode is disabled."})
    stmt = select(CountSession).where(CountSession.user_id == user.id)
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
    item = db.scalar(select(CountSession).where(CountSession.id == session_id, CountSession.user_id == user.id))
    if not item:
        item = db.scalar(select(CountSession).where(CountSession.batch_code == session_id, CountSession.user_id == user.id))
    if not item:
        raise HTTPException(status_code=404, detail={"code": "count_session_not_found", "message": "Count session was not found."})
    if body.is_saved is not None:
        item.is_saved = body.is_saved
    if body.status is not None:
        item.status = body.status
    db.commit()
    db.refresh(item)
    return {"session": _present(item)}


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_count_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.scalar(select(CountSession).where(CountSession.id == session_id, CountSession.user_id == user.id))
    if not item:
        item = db.scalar(select(CountSession).where(CountSession.batch_code == session_id, CountSession.user_id == user.id))
    if not item:
        raise HTTPException(status_code=404, detail={"code": "count_session_not_found", "message": "Count session was not found."})
    db.delete(item)
    db.commit()
    return None
