from sqlalchemy.orm import Session
from app.models import User, UserSettings


def ensure_settings(db: Session, user: User) -> UserSettings:
    if user.settings is None:
        user.settings = UserSettings(user_id=user.id)
        db.add(user.settings)
        db.commit()
        db.refresh(user.settings)
    return user.settings


def public_settings(settings: UserSettings) -> dict:
    return {
        "notificationsEnabled": settings.notifications_enabled,
        "language": settings.language,
        "theme": settings.theme,
        "updatedAt": settings.updated_at.isoformat() + "Z" if settings.updated_at else None,
    }
