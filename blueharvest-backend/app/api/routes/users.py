from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User, UserSettings
from app.schemas.user import SettingsUpdate, UserUpdate
from app.services.auth_service import public_user
from app.services.profile_service import ensure_settings, public_settings

router = APIRouter(prefix="/api/users", tags=["profile and settings"])


@router.get("/me")
def get_profile(user: User = Depends(get_current_user)):
    return {"user": public_user(user)}


@router.patch("/me")
def update_profile(body: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field == "username" and value:
            existing = db.scalar(select(User.id).where(User.username == value.strip(), User.id != user.id))
            if existing:
                raise HTTPException(status_code=409, detail={"code": "username_in_use", "message": "That username is already taken."})
        if field == "email" and value:
            value = str(value).lower()
            existing = db.scalar(select(User.id).where(User.email == value, User.id != user.id))
            if existing:
                raise HTTPException(status_code=409, detail={"code": "email_in_use", "message": "That email is already linked to another account."})
        if field == "phone" and value:
            existing = db.scalar(select(User.id).where(User.phone == value, User.id != user.id))
            if existing:
                raise HTTPException(status_code=409, detail={"code": "phone_in_use", "message": "That phone number is already linked to another account."})
        if field == "username": user.username = value.strip() if value else value
        elif field == "display_role": user.display_role = value.strip() if value else value
        elif field == "full_name": user.full_name = value.strip() if value else value
        elif field == "email":
            if user.email != value:
                user.email_verified = False
            user.email = value
        elif field == "phone": user.phone = value.strip() if value else None
        elif field == "pond_location": user.pond_location = value.strip() if value else value
    db.commit()
    db.refresh(user)
    return {"user": public_user(user)}


@router.get("/me/settings")
def get_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"settings": public_settings(ensure_settings(db, user))}


@router.patch("/me/settings")
def update_settings(body: SettingsUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    settings_row = ensure_settings(db, user)
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if value is not None:
            setattr(settings_row, field, value)
    db.commit()
    db.refresh(settings_row)
    return {"settings": public_settings(settings_row)}
