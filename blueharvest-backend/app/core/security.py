from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from app.core.config import settings

_password_hasher = PasswordHasher()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _password_hasher.verify(hashed, password)
    except (VerificationError, VerifyMismatchError, ValueError):
        return False


def create_access_token(user_id: str, session_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "sid": session_id, "iat": now, "exp": now + timedelta(minutes=settings.access_token_minutes), "type": "access"}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    if payload.get("type") != "access" or not payload.get("sub") or not payload.get("sid"):
        raise jwt.InvalidTokenError("Invalid access token")
    return payload


def generate_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def digest_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def digest_otp(destination: str, code: str) -> str:
    # HMAC prevents a database-only attacker from cheaply enumerating the six-digit OTP space.
    message = f"password-reset:{destination}:{code}".encode("utf-8")
    return hmac.new(settings.secret_key.encode("utf-8"), message, hashlib.sha256).hexdigest()
