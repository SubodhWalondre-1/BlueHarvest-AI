from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Notification, User
from app.core.time import utcnow_naive

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(100))
    return {"items": [
        {"id": item.id, "title": item.title, "description": item.description,
         "read_at": item.read_at.isoformat() + "Z" if item.read_at else None,
         "created_at": item.created_at.isoformat() + "Z" if item.created_at else None}
        for item in items
    ]}


@router.patch("/{notification_id}/read")
def mark_notification_read(notification_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if not item:
        raise HTTPException(status_code=404, detail={"code": "notification_not_found", "message": "Notification was not found."})
    item.read_at = utcnow_naive()
    db.commit()
    return {"ok": True, "id": item.id, "read_at": item.read_at.isoformat() + "Z"}
