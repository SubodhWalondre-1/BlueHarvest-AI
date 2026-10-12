import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import AuthSession, User
from app.core.time import utcnow_naive

_bearer = HTTPBearer(auto_error=False)


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "not_authenticated", "message": "Sign in to continue."}, headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_access_token(credentials.credentials)
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "invalid_token", "message": "Access token is invalid or expired."}, headers={"WWW-Authenticate": "Bearer"})
    session = db.get(AuthSession, payload["sid"])
    now = utcnow_naive()
    if not session or session.user_id != payload["sub"] or session.revoked_at is not None or session.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "invalid_session", "message": "The user session is no longer valid."})
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "invalid_session", "message": "The user session is no longer valid."})
    return user
