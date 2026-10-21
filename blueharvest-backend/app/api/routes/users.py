from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User, UserSettings
from app.schemas.user import ContactChangeConfirm, ContactChangeRequest, SettingsUpdate, UserUpdate
from app.services.contact_change_service import confirm_contact_change, request_contact_change
from app.services.auth_service import public_user
from app.services.profile_service import ensure_settings, public_settings

router = APIRouter(prefix="/api/users", tags=["profile and settings"])


@router.get("/me")
def get_profile(user: User = Depends(get_current_user)):
    return {"user": public_user(user)}


@router.patch("/me")
def update_profile(body: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True)
    for field in ("email", "phone"):
        if field in changes:
            value = str(changes[field]).lower() if field == "email" else changes[field]
            if value != getattr(user, field):
                raise HTTPException(status_code=409, detail={"code": "contact_verification_required", "message": "Verify contact changes using your current password and a verification code."})
            del changes[field]
    for field, value in changes.items():
        if field == "username" and value:
            existing = db.scalar(select(User.id).where(User.username == value, User.id != user.id))
            if existing:
                raise HTTPException(status_code=409, detail={"code": "username_in_use", "message": "That username is already taken."})
        setattr(user, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": "profile_conflict", "message": "That username is already taken."}) from exc
    db.refresh(user)
    return {"user": public_user(user)}


@router.post("/me/contact-change/request")
async def contact_change_request(body: ContactChangeRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return await request_contact_change(db, request, user, body)


@router.post("/me/contact-change/confirm")
def contact_change_confirm(body: ContactChangeConfirm, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"user": public_user(confirm_contact_change(db, request, user, body))}


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
