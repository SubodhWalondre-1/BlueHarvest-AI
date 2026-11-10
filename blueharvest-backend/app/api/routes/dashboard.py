from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
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
    filters = [
        CountSession.user_id == user.id,
        CountSession.is_saved.is_(True),
        or_(CountSession.inference_verified.is_(True), CountSession.is_demo.is_(True)),
    ]
    if start:
        filters.append(CountSession.created_at >= start)
    if not include_demo:
        filters.append(CountSession.is_demo.is_(False))

    summary_stmt = select(
        func.coalesce(func.sum(CountSession.count), 0),
        func.count(CountSession.id),
    ).where(*filters)
    total_fish, total_sessions = db.execute(summary_stmt).one()

    location_stmt = (
        select(
            CountSession.pond_location,
            func.coalesce(func.sum(CountSession.count), 0),
        )
        .where(*filters)
        .group_by(CountSession.pond_location)
    )
    location_totals: dict[str, int] = {}
    for loc, count in db.execute(location_stmt):
        label = loc or "Unspecified location"
        location_totals[label] = location_totals.get(label, 0) + int(count or 0)
    locations = [{"name": name, "count": count} for name, count in sorted(location_totals.items(), key=lambda pair: pair[1], reverse=True)]

    return {
        "range": range,
        "total_fish": int(total_fish or 0),
        "sessions": int(total_sessions or 0),
        "locations": locations,
        "includes_demo_data": include_demo,
        "demo_label": "DEMO DATA — SAMPLE ONLY" if include_demo else None,
    }
