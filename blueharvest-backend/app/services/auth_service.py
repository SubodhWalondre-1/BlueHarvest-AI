from datetime import datetime, timedelta
from uuid import uuid4
from fastapi import HTTPException, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import create_access_token, digest_token, generate_opaque_token, hash_password, verify_password
from app.models import AuthSession, User, UserSettings
from app.core.time import utcnow_naive


def public_user(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "fullName": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "role": user.display_role,
        "pondLocation": user.pond_location,
        "createdAt": user.created_at.isoformat() + "Z" if user.created_at else None,
    }


def issue_session(db: Session, user: User, response: Response) -> dict:
    raw_refresh = generate_opaque_token()
    session_id = str(uuid4())
    session = AuthSession(
        id=session_id,
        user_id=user.id,
        token_hash=digest_token(raw_refresh),
        expires_at=utcnow_naive() + timedelta(days=settings.refresh_token_days),
    )
    db.add(session)
    db.commit()
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=raw_refresh,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite.lower(),
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        path="/api/auth",
    )
    return {"access_token": create_access_token(user.id, session_id), "token_type": "bearer", "user": public_user(user)}


def create_user(db: Session, *, full_name: str, username: str, email: str, phone: str | None,
                pond_location: str | None, password: str | None, google_sub: str | None = None,
                email_verified: bool = False) -> User:
    username = username.strip()
    email = email.strip().lower()
    clauses = [User.username == username, User.email == email]
    if phone:
        clauses.append(User.phone == phone)
    if google_sub:
        clauses.append(User.google_sub == google_sub)
    if db.scalar(select(User.id).where(or_(*clauses))):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "account_conflict", "message": "An account with one of these details already exists."})
    user = User(
        id=str(uuid4()), username=username, full_name=full_name.strip(), email=email,
        phone=phone, password_hash=hash_password(password) if password else None,
        google_sub=google_sub, pond_location=pond_location, email_verified=email_verified,
    )
    user.settings = UserSettings(user_id=user.id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, username: str, password: str) -> User:
    identity = username.strip()
    user = db.scalar(select(User).where(or_(User.username == identity, User.email == identity.lower())))
    if not user or not user.password_hash or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "invalid_credentials", "message": "Username/email or password is incorrect."}, headers={"WWW-Authenticate": "Bearer"})
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "account_disabled", "message": "This account is disabled."})
    return user
