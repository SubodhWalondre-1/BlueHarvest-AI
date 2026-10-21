from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import CountSession, User
from app.core.time import utcnow_naive

router = APIRouter(prefix="/api/dashboard", tags=["dashboard analytics"])


def _range_start(value: str) -> datetime | None:
    now = utcnow_naive()
    key = value.strip().lower().replace(" ", "_")
    if key in {"today", "day", "1_day"}:
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if key in {"this_week", "week"}:
        return (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    if key in {"7_days", "7days", "last_7_days"}:
        return now - timedelta(days=7)
    if key in {"30_days", "30days", "last_30_days"}:
        return now - timedelta(days=30)
    if key in {"this_month", "month"}:
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if key in {"all_time", "all", "total"}:
        return None
    raise HTTPException(status_code=422, detail={"code": "invalid_range", "message": "range must be today, this_week, this_month, all_time, 7_days, or 30_days."})


@router.get("/summary")
def dashboard_summary(
    range: str = Query(default="today"),
    include_demo: bool = Query(default=False),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    if include_demo and not settings.demo_mode_enabled:
        raise HTTPException(status_code=403, detail={"code": "demo_mode_disabled", "message": "Demo data mode is disabled."})
    start = _range_start(range)
    stmt = select(CountSession).where(CountSession.user_id == user.id, CountSession.is_saved.is_(True))
    stmt = stmt.where(or_(CountSession.inference_verified.is_(True), CountSession.is_demo.is_(True)))
    if start:
        stmt = stmt.where(CountSession.created_at >= start)
    if not include_demo:
        stmt = stmt.where(CountSession.is_demo.is_(False))
    sessions = list(db.scalars(stmt))
    total_fish = sum(item.count or 0 for item in sessions)
    location_totals: dict[str, int] = {}
    for item in sessions:
        label = item.pond_location or "Unspecified location"
        location_totals[label] = location_totals.get(label, 0) + (item.count or 0)
    locations = [{"name": name, "count": count} for name, count in sorted(location_totals.items(), key=lambda pair: pair[1], reverse=True)]
    return {
        "range": range,
        "total_fish": total_fish,
        "sessions": len(sessions),
        "locations": locations,
        "includes_demo_data": include_demo,
        "demo_label": "DEMO DATA — SAMPLE ONLY" if include_demo else None,
    }
