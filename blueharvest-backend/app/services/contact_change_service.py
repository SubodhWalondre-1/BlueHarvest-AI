from datetime import timedelta
import hmac
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import digest_otp, digest_token, generate_otp, verify_password
from app.core.time import utcnow_naive
from app.models import ContactChangeChallenge, PasswordResetChallenge, User
from app.schemas.user import ContactChangeConfirm, ContactChangeRequest
from app.services.email_service import DeliveryNotConfigured, send_email_otp
from app.services.rate_limit_service import enforce_rate_limit
from app.services.sms_service import send_sms_otp


def _reauthenticate(user: User, password: str) -> None:
    if not user.password_hash:
        raise HTTPException(status_code=403, detail={"code": "password_reauthentication_required", "message": "Set an account password before changing contact details."})
    if not user.is_active or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=403, detail={"code": "reauthentication_failed", "message": "The current password is incorrect."})


def _lock_user(db: Session, user: User) -> None:
    db.execute(update(User).where(User.id == user.id).values(updated_at=User.updated_at))
    db.refresh(user)


def _check_available(db: Session, user: User, channel: str, value: str | None) -> None:
    if value is not None and db.scalar(select(User.id).where(getattr(User, channel) == value, User.id != user.id)):
        raise HTTPException(status_code=409, detail={"code": "contact_in_use", "message": "That contact detail is already linked to another account."})


def _code_hash(challenge: ContactChangeChallenge, code: str) -> str:
    return digest_otp(f"contact-change:{challenge.id}:{challenge.user_id}:{challenge.destination}", code)


async def request_contact_change(db: Session, request: Request, user: User, body: ContactChangeRequest) -> dict:
    enforce_rate_limit(db, request, "contact-request", ip_limit=10, account=user.id, account_limit=5, window_seconds=900)
    _reauthenticate(user, body.password)
    previous = getattr(user, body.channel)
    credential = user.password_hash
    if previous == body.value:
        raise HTTPException(status_code=422, detail={"code": "contact_unchanged", "message": "Enter a different contact detail."})
    _check_available(db, user, body.channel, body.value)
    challenge = ContactChangeChallenge(
        id=str(uuid4()), user_id=user.id, channel=body.channel, new_value=body.value,
        previous_value=previous, destination=body.value if body.value is not None else previous,
        credential_hash=digest_token(credential), expires_at=utcnow_naive() + timedelta(minutes=settings.otp_ttl_minutes),
    )
    code = generate_otp()
    challenge.code_hash = _code_hash(challenge, code)
    expose_code = settings.app_env.lower() in {"development", "dev", "test"} and settings.dev_expose_otp
    try:
        if not expose_code:
            sender = send_email_otp if body.channel == "email" else send_sms_otp
            await sender(challenge.destination, code, purpose="contact verification")
    except DeliveryNotConfigured as exc:
        raise HTTPException(status_code=503, detail={"code": "contact_delivery_not_configured", "message": str(exc)}) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"code": "contact_delivery_failed", "message": "Verification code delivery failed. Your contact details were not changed."}) from exc
    _lock_user(db, user)
    if not user.is_active or user.password_hash != credential or getattr(user, body.channel) != previous:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": "contact_request_stale", "message": "Account details changed. Request a new verification code."})
    now = utcnow_naive()
    db.execute(update(ContactChangeChallenge).where(
        ContactChangeChallenge.user_id == user.id, ContactChangeChallenge.channel == body.channel,
        ContactChangeChallenge.consumed_at.is_(None),
    ).values(consumed_at=now))
    challenge.created_at = now
    challenge.expires_at = now + timedelta(minutes=settings.otp_ttl_minutes)
    db.add(challenge)
    db.commit()
    result = {"challenge_id": challenge.id, "message": "Verification code sent. Contact details change only after verification."}
    if expose_code:
        result["development_code"] = code
        result["warning"] = "Development-only code. Never enable DEV_EXPOSE_OTP in production."
    return result


def confirm_contact_change(db: Session, request: Request, user: User, body: ContactChangeConfirm) -> User:
    enforce_rate_limit(db, request, "contact-confirm", ip_limit=settings.otp_ip_limit, account=user.id,
                       account_limit=settings.otp_account_limit, window_seconds=settings.otp_window_seconds)
    _lock_user(db, user)
    _reauthenticate(user, body.password)
    challenge = db.scalar(select(ContactChangeChallenge).where(
        ContactChangeChallenge.id == str(body.challenge_id), ContactChangeChallenge.user_id == user.id,
    ))
    now = utcnow_naive()
    if not challenge or challenge.consumed_at or challenge.expires_at <= now or challenge.attempt_count >= settings.otp_max_attempts:
        raise HTTPException(status_code=400, detail={"code": "contact_challenge_invalid", "message": "Verification code is expired, used, or unavailable. Request a new code."})
    if challenge.credential_hash != digest_token(user.password_hash) or getattr(user, challenge.channel) != challenge.previous_value:
        challenge.consumed_at = now
        db.commit()
        raise HTTPException(status_code=409, detail={"code": "contact_request_stale", "message": "Account details changed. Request a new verification code."})
    if not hmac.compare_digest(challenge.code_hash, _code_hash(challenge, body.code)):
        challenge.attempt_count += 1
        if challenge.attempt_count >= settings.otp_max_attempts:
            challenge.consumed_at = now
        db.commit()
        raise HTTPException(status_code=400, detail={"code": "contact_code_invalid", "message": "The verification code is incorrect."})
    _check_available(db, user, challenge.channel, challenge.new_value)
    setattr(user, challenge.channel, challenge.new_value)
    setattr(user, f"{challenge.channel}_verified", challenge.new_value is not None)
    challenge.consumed_at = now
    db.execute(update(PasswordResetChallenge).where(
        PasswordResetChallenge.user_id == user.id, PasswordResetChallenge.consumed_at.is_(None),
    ).values(consumed_at=now))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": "contact_in_use", "message": "That contact detail is already linked to another account."}) from exc
    db.refresh(user)
    return user
