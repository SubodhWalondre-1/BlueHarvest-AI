from datetime import datetime, timedelta
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import hash_password
from app.models import CountSession, User, UserSettings
from app.core.time import utcnow_naive

# These counts are demo fixtures copied from the frontend's existing sample dataset.
# They are explicitly tagged as demo records and contain no confidence/accuracy/length metrics.
DEMO_USER = {
    "username": "samarth_aquafarm",
    "email": "demo@blueharvest.local",
    "password": "SpawnCounter2026!",
}
DEMO_RECORDS = [
    {"batch": "BAT-DEMO-4028", "count": 487, "location": "Pond Delta #4", "source": "Camera", "container": "Image", "days_ago": 0},
    {"batch": "BAT-DEMO-4027", "count": 712, "location": "Nursery Tray #2", "source": "Uploaded", "container": "Tray", "days_ago": 0},
    {"batch": "BAT-DEMO-4026", "count": 320, "location": "Spawn Tank A", "source": "Camera", "container": "Tank", "days_ago": 1},
    {"batch": "BAT-DEMO-4025", "count": 1024, "location": "Main Pond #1", "source": "Uploaded", "container": "Pond", "days_ago": 14},
]


def seed_demo_data(db: Session) -> None:
    if not settings.demo_mode_enabled or settings.app_env.lower() not in {"development", "dev"}:
        return
    user = db.scalar(select(User).where(User.username == DEMO_USER["username"]))
    if user is None:
        user = User(
            id=str(uuid4()), username=DEMO_USER["username"], full_name="Demo Hatchery Operator",
            email=DEMO_USER["email"], password_hash=hash_password(DEMO_USER["password"]),
            pond_location="Pond Delta #4", display_role="Demo Hatchery Operator", email_verified=True,
        )
        user.settings = UserSettings(user_id=user.id)
        db.add(user)
        db.commit()
        db.refresh(user)
    existing_demo_count = db.scalar(select(CountSession.id).where(CountSession.user_id == user.id, CountSession.is_demo.is_(True)))
    if existing_demo_count:
        return
    now = utcnow_naive()
    for row in DEMO_RECORDS:
        created = now - timedelta(days=row["days_ago"])
        db.add(CountSession(
            id=str(uuid4()), batch_code=row["batch"], user_id=user.id,
            count=row["count"], status="demo_sample", is_saved=True, is_demo=True,
            source=row["source"], container=row["container"], pond_location=row["location"],
            density=None, confidence=None, avg_length_mm=None, processing_time_ms=None,
            method="DEMO DATA — SAMPLE ONLY (not produced by AI inference)",
            created_at=created, updated_at=created,
        ))
    db.commit()
