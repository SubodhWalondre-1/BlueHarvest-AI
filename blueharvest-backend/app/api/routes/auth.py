import hashlib
import hmac
import logging
from datetime import datetime, timedelta
from math import ceil
from uuid import uuid4
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_cookie_csrf
from app.core.config import settings
from app.core.security import digest_otp, digest_token, generate_opaque_token, generate_otp, hash_password, verify_password
from app.db.session import get_db
from app.models import AuthSession, EmailVerificationChallenge, PasswordResetChallenge, User, UserSettings
from app.schemas.auth import (
    GoogleLoginRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    PasswordResetVerify,
    SignupRequest,
    SignupResendRequest,
    SignupResponse,
    SignupVerifyRequest,
)
from app.services.auth_service import authenticate_user, create_user, issue_session, public_user
from app.services.demo_service import DEMO_USER, create_demo_workspace
from app.services.email_service import DeliveryNotConfigured, send_email_otp, send_email_otp_sync
from app.services.sms_service import send_sms_otp
from app.services.google_auth_service import GoogleCredentialError, verify_google_credential
from app.services.rate_limit_service import clear_account_limit, enforce_rate_limit
from app.core.time import utcnow_naive

logger = logging.getLogger("blueharvest.auth")
router = APIRouter(prefix="/api/auth", tags=["authentication"])


def secrets_compare(left: str, right: str) -> bool:
    return hmac.compare_digest(left, right)


def digest_signup_otp(email: str, code: str) -> str:
    message = f"signup-verification:{email.lower().strip()}:{code.strip()}".encode("utf-8")
    return hmac.new(settings.secret_key.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _find_user_by_destination(db: Session, destination: str) -> tuple[User | None, str, str]:
    destination = destination.strip()
    if "@" in destination:
        normalized = destination.lower()
        return db.scalar(select(User).where(User.email == normalized)), normalized, "email"
    import re
    normalized = re.sub(r"[\s().-]", "", destination)
    return db.scalar(select(User).where(User.phone == normalized)), normalized, "sms"


def _lock_recovery_user(db: Session, user_id: str) -> None:
    # Serialize recovery changes per account on PostgreSQL and SQLite.
    db.execute(update(User).where(User.id == user_id).values(updated_at=User.updated_at))


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, request: Request, response: Response = None, db: Session = Depends(get_db)):
    enforce_rate_limit(db, request, "signup", ip_limit=settings.signup_ip_limit, window_seconds=settings.signup_window_seconds)
    normalized_email = str(body.email).strip().lower()

    existing = db.scalar(select(User).where(or_(User.username == body.username, User.email == normalized_email)))
    if existing:
        if existing.email_verified:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "user_already_exists", "message": "An account with this username or email already exists."},
            )
        # Unverified existing registration: update credentials and issue a fresh challenge
        user = existing
        user.full_name = body.full_name
        user.pond_location = body.pond_location
        user.phone = body.phone
        user.password_hash = hash_password(body.password)
    else:
        user = create_user(
            db,
            full_name=body.full_name,
            username=body.username,
            email=normalized_email,
            phone=body.phone,
            pond_location=body.pond_location,
            password=body.password,
        )
        user.email_verified = False

    now = utcnow_naive()
    # Invalidate previous unconsumed verification challenges
    db.execute(
        update(EmailVerificationChallenge)
        .where(EmailVerificationChallenge.user_id == user.id, EmailVerificationChallenge.consumed_at.is_(None))
        .values(consumed_at=now)
    )

    code = generate_otp()
    challenge = EmailVerificationChallenge(
        id=str(uuid4()),
        user_id=user.id,
        email=normalized_email,
        code_hash=digest_signup_otp(normalized_email, code),
        expires_at=now + timedelta(minutes=settings.otp_ttl_minutes),
        attempt_count=0,
    )
    db.add(challenge)
    db.commit()

    development_code = None
    if settings.app_env.lower() in {"development", "dev", "test"} and settings.dev_expose_otp:
        development_code = code
    else:
        try:
            send_email_otp_sync(normalized_email, code, purpose="email verification")
        except DeliveryNotConfigured as exc:
            if settings.app_env.lower() in {"development", "dev", "test"}:
                development_code = code
            else:
                db.rollback()
                raise HTTPException(status_code=503, detail={"code": "email_delivery_not_configured", "message": str(exc)})
        except Exception:
            db.rollback()
            raise HTTPException(status_code=502, detail={"code": "email_delivery_failed", "message": "Verification email delivery failed. Please check your email configuration."})

    result = {
        "verification_required": True,
        "email": normalized_email,
        "challenge_id": challenge.id,
        "message": f"Verification code sent to {normalized_email}. Please enter the 6-digit code to complete registration.",
    }
    if development_code is not None:
        result["otp"] = development_code
    return result


@router.post("/signup/verify")
def verify_signup(body: SignupVerifyRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    normalized_email = body.email.strip().lower()
    enforce_rate_limit(
        db,
        request,
        "signup_verify",
        ip_limit=settings.otp_ip_limit,
        window_seconds=settings.otp_window_seconds,
        account=f"signup_verify:{normalized_email}",
        account_limit=settings.otp_account_limit,
    )
    user = db.scalar(select(User).where(User.email == normalized_email))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "user_not_found", "message": "No account found with this email."},
        )

    now = utcnow_naive()
    challenge = db.scalar(
        select(EmailVerificationChallenge)
        .where(
            EmailVerificationChallenge.user_id == user.id,
            EmailVerificationChallenge.consumed_at.is_(None),
            EmailVerificationChallenge.expires_at > now,
        )
        .order_by(EmailVerificationChallenge.created_at.desc())
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if not challenge or challenge.verified_at is not None or challenge.attempt_count >= settings.otp_max_attempts:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "verification_code_invalid", "message": "The verification code is invalid or has expired. Please request a new code."},
        )

    challenge.attempt_count += 1
    expected_hash = digest_signup_otp(normalized_email, body.code.strip())
    if not secrets_compare(challenge.code_hash, expected_hash):
        db.commit()
        remaining = max(0, settings.otp_max_attempts - challenge.attempt_count)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "verification_code_invalid", "message": f"The verification code is invalid. {remaining} attempt(s) remaining."},
        )

    challenge.verified_at = now
    challenge.consumed_at = now
    user.email_verified = True
    db.commit()
    db.refresh(user)

    return issue_session(db, user, response)


@router.post("/signup/resend")
def resend_signup_otp(body: SignupResendRequest, request: Request, db: Session = Depends(get_db)):
    normalized_email = body.email.strip().lower()
    enforce_rate_limit(
        db,
        request,
        "signup_resend",
        ip_limit=settings.otp_ip_limit,
        window_seconds=settings.otp_window_seconds,
        account=f"signup_resend:{normalized_email}",
        account_limit=settings.otp_account_limit,
    )
    user = db.scalar(select(User).where(User.email == normalized_email))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "user_not_found", "message": "No account found with this email."},
        )
    if user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "already_verified", "message": "This email is already verified. Please sign in."},
        )

    now = utcnow_naive()
    # Enforce minimum 30s cooldown between resend attempts
    last_challenge = db.scalar(
        select(EmailVerificationChallenge)
        .where(EmailVerificationChallenge.user_id == user.id)
        .order_by(EmailVerificationChallenge.created_at.desc())
        .limit(1)
    )
    if last_challenge and (now - last_challenge.created_at).total_seconds() < 30:
        remaining = 30 - int((now - last_challenge.created_at).total_seconds())
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "resend_cooldown", "message": f"Please wait {remaining} seconds before requesting a new code."},
        )

    db.execute(
        update(EmailVerificationChallenge)
        .where(EmailVerificationChallenge.user_id == user.id, EmailVerificationChallenge.consumed_at.is_(None))
        .values(consumed_at=now)
    )

    code = generate_otp()
    challenge = EmailVerificationChallenge(
        id=str(uuid4()),
        user_id=user.id,
        email=normalized_email,
        code_hash=digest_signup_otp(normalized_email, code),
        expires_at=now + timedelta(minutes=settings.otp_ttl_minutes),
        attempt_count=0,
    )
    db.add(challenge)
    db.commit()

    development_code = None
    if settings.app_env.lower() in {"development", "dev", "test"} and settings.dev_expose_otp:
        development_code = code
    else:
        try:
            send_email_otp_sync(normalized_email, code, purpose="email verification")
        except DeliveryNotConfigured as exc:
            if settings.app_env.lower() in {"development", "dev", "test"}:
                development_code = code
            else:
                db.rollback()
                raise HTTPException(status_code=503, detail={"code": "email_delivery_not_configured", "message": str(exc)})
        except Exception:
            db.rollback()
            raise HTTPException(status_code=502, detail={"code": "email_delivery_failed", "message": "Verification code delivery failed. Check email provider configuration and try again."})

    result = {
        "verification_required": True,
        "email": normalized_email,
        "challenge_id": challenge.id,
        "message": f"New verification code sent to {normalized_email}.",
    }
    if development_code is not None:
        result["otp"] = development_code
    return result


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    identity = body.username.strip()
    user_id = db.scalar(select(User.id).where(or_(User.username == identity, User.email == identity.lower())))
    account = f"user:{user_id}" if user_id else f"identity:{identity.casefold()}"
    enforce_rate_limit(
        db, request, "login", ip_limit=settings.login_ip_limit, window_seconds=settings.login_window_seconds,
        account=account, account_limit=settings.login_account_limit,
    )
    user = authenticate_user(db, body.username, body.password)
    clear_account_limit(db, "login", account)
    if user.username == DEMO_USER["username"] and user.email == DEMO_USER["email"]:
        user = create_demo_workspace(db)
    elif not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "email_not_verified",
                "message": "Please verify your email address before logging in.",
                "email": user.email,
            },
        )
    return issue_session(db, user, response)


@router.post("/google")
def google_login(body: GoogleLoginRequest, response: Response, db: Session = Depends(get_db)):
    try:
        claims = verify_google_credential(body.credential)
    except GoogleCredentialError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
    email = str(claims.get("email", "")).strip().lower()
    subject = claims.get("sub")
    email_verified = claims.get("email_verified") in (True, "true", "True", 1, "1")
    if not email or not subject or not email_verified:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "unverified_google_email", "message": "Use a Google account with a verified email address."})

    user = db.scalar(select(User).where(User.google_sub == subject))
    if user is None:
        user = db.scalar(select(User).where(User.email == email))
        if user:
            # Link only when Google proves control of this verified email address.
            user.google_sub = str(subject)
            user.email_verified = True
            db.commit()
            db.refresh(user)
        else:
            local_part = email.split("@", 1)[0]
            base_username = "".join(ch for ch in local_part if ch.isalnum() or ch in "_.-")[:40] or "aquafarm"
            candidate = base_username
            suffix = 1
            while db.scalar(select(User.id).where(User.username == candidate)):
                candidate = f"{base_username[:35]}_{suffix}"
                suffix += 1
            user = User(
                id=str(uuid4()),
                username=candidate,
                full_name=claims.get("name") or candidate,
                email=email,
                google_sub=str(subject),
                pond_location="Unassigned Pond",
                display_role="Aquafarm Operator",
                email_verified=True,
            )
            user.settings = UserSettings(user_id=user.id)
            db.add(user)
            db.commit()
            db.refresh(user)

    return issue_session(db, user, response)


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"user": public_user(current_user)}


@router.post("/refresh", dependencies=[Depends(require_cookie_csrf)])
def refresh_session(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(settings.refresh_cookie_name)
    if not raw:
        raise HTTPException(status_code=401, detail={"code": "refresh_missing", "message": "Sign in again to continue."})
    current = db.scalar(select(AuthSession).where(AuthSession.token_hash == digest_token(raw)))
    now = utcnow_naive()
    if not current or current.revoked_at or current.expires_at <= now or not current.user or not current.user.is_active:
        response.delete_cookie(
            settings.refresh_cookie_name,
            path="/api/auth",
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite.lower(),
        )
        raise HTTPException(status_code=401, detail={"code": "refresh_invalid", "message": "Refresh session expired. Sign in again."})
    current.revoked_at = now
    db.commit()
    return issue_session(db, current.user, response)


@router.post("/logout", dependencies=[Depends(require_cookie_csrf)])
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(settings.refresh_cookie_name)
    if raw:
        current = db.scalar(select(AuthSession).where(AuthSession.token_hash == digest_token(raw)))
        if current and current.revoked_at is None:
            current.revoked_at = utcnow_naive()
            db.commit()
    response.delete_cookie(
        settings.refresh_cookie_name,
        path="/api/auth",
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite.lower(),
    )
    return {"ok": True}


@router.post("/password-reset/request")
async def password_reset_request(body: PasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    enforce_rate_limit(db, request, "otp-request", ip_limit=settings.otp_request_ip_limit, window_seconds=settings.otp_window_seconds)
    user, destination, channel = _find_user_by_destination(db, body.destination)
    generic_response = {"ok": True, "message": "If an account matches that contact detail, a recovery code has been sent."}
    local_otp_exposure = settings.app_env.lower() in {"development", "dev", "test"} and settings.dev_expose_otp

    # Check channel configuration independently of whether an account exists, so a
    # misconfigured deployment does not reveal registered contacts via status codes.
    email_ready = bool(settings.smtp_host and settings.smtp_from_email)
    sms_ready = bool(settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number)
    if not local_otp_exposure and not (email_ready if channel == "email" else sms_ready):
        raise HTTPException(
            status_code=503,
            detail={"code": "recovery_delivery_not_configured", "message": f"{channel.upper()} recovery delivery is not configured. Contact the administrator."},
        )
    if user is None:
        return generic_response

    now = utcnow_naive()
    recent_count, oldest_request = db.execute(
        select(func.count(PasswordResetChallenge.id), func.min(PasswordResetChallenge.created_at))
        .where(PasswordResetChallenge.user_id == user.id, PasswordResetChallenge.created_at >= now - timedelta(minutes=15))
    ).one()
    if recent_count >= 5:
        retry_after = max(1, ceil((oldest_request + timedelta(minutes=15) - now).total_seconds()))
        raise HTTPException(status_code=429, detail={"code": "recovery_rate_limited", "message": "Too many recovery requests. Try again later.", "retry_after": retry_after}, headers={"Retry-After": str(retry_after)})

    code = generate_otp()
    challenge = PasswordResetChallenge(
        id=str(uuid4()), user_id=user.id, destination=destination, channel=channel,
        code_hash=digest_otp(destination, code),
        expires_at=utcnow_naive() + timedelta(minutes=settings.otp_ttl_minutes),
    )
    development_code = None
    try:
        if settings.app_env.lower() in {"development", "dev", "test"} and settings.dev_expose_otp:
            development_code = code
        elif channel == "email":
            await send_email_otp(destination, code)
        else:
            await send_sms_otp(destination, code)
    except DeliveryNotConfigured as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail={"code": "recovery_delivery_not_configured", "message": str(exc)})
    except Exception:
        db.rollback()
        raise HTTPException(status_code=502, detail={"code": "recovery_delivery_failed", "message": "Recovery code delivery failed. Check the provider configuration and try again."})
    _lock_recovery_user(db, user.id)
    now = utcnow_naive()
    db.execute(
        update(PasswordResetChallenge)
        .where(PasswordResetChallenge.user_id == user.id, PasswordResetChallenge.consumed_at.is_(None))
        .values(consumed_at=now)
    )
    challenge.created_at = now
    challenge.expires_at = now + timedelta(minutes=settings.otp_ttl_minutes)
    db.add(challenge)
    db.commit()
    result = dict(generic_response)
    if development_code is not None:
        result["channel"] = channel
        result["development_code"] = development_code
        result["warning"] = "Development-only code. Never enable DEV_EXPOSE_OTP in production."
    return result


@router.post("/password-reset/verify")
def password_reset_verify(body: PasswordResetVerify, request: Request, db: Session = Depends(get_db)):
    user, destination, _ = _find_user_by_destination(db, body.destination)
    enforce_rate_limit(
        db, request, "otp-verify", ip_limit=settings.otp_ip_limit, window_seconds=settings.otp_window_seconds,
        account=f"user:{user.id}" if user else f"identity:{destination}", account_limit=settings.otp_account_limit,
    )
    challenge = None
    if user:
        _lock_recovery_user(db, user.id)
        challenge = db.scalar(
            select(PasswordResetChallenge)
            .where(PasswordResetChallenge.user_id == user.id, PasswordResetChallenge.consumed_at.is_(None))
            .order_by(PasswordResetChallenge.created_at.desc())
            .limit(1)
            .execution_options(populate_existing=True)
        )
    now = utcnow_naive()
    if (
        not challenge or challenge.destination != destination or challenge.verified_at is not None
        or challenge.expires_at <= now or challenge.attempt_count >= settings.otp_max_attempts
    ):
        db.rollback()
        raise HTTPException(status_code=400, detail={"code": "recovery_code_invalid", "message": "The recovery code is invalid or expired."})
    challenge.attempt_count += 1
    if not secrets_compare(digest_otp(destination, body.code), challenge.code_hash):
        db.commit()
        raise HTTPException(status_code=400, detail={"code": "recovery_code_invalid", "message": "The recovery code is invalid or expired."})
    reset_token = generate_opaque_token()
    challenge.verified_at = now
    challenge.reset_token_hash = digest_token(reset_token)
    db.commit()
    return {"ok": True, "reset_token": reset_token, "message": "Code verified. Choose a new password."}


@router.post("/password-reset/confirm")
def password_reset_confirm(body: PasswordResetConfirm, request: Request, db: Session = Depends(get_db)):
    user, destination, _ = _find_user_by_destination(db, body.destination)
    enforce_rate_limit(
        db, request, "otp-confirm", ip_limit=settings.otp_ip_limit, window_seconds=settings.otp_window_seconds,
        account=f"user:{user.id}" if user else f"identity:{destination}", account_limit=settings.otp_account_limit,
    )
    challenge = None
    if user:
        _lock_recovery_user(db, user.id)
        challenge = db.scalar(
            select(PasswordResetChallenge)
            .where(PasswordResetChallenge.user_id == user.id, PasswordResetChallenge.consumed_at.is_(None))
            .order_by(PasswordResetChallenge.created_at.desc())
            .limit(1)
            .execution_options(populate_existing=True)
        )
    now = utcnow_naive()
    if (
        not challenge or challenge.destination != destination or not challenge.verified_at
        or challenge.expires_at <= now or not challenge.reset_token_hash
        or not secrets_compare(challenge.reset_token_hash, digest_token(body.reset_token))
    ):
        db.rollback()
        raise HTTPException(status_code=400, detail={"code": "reset_token_invalid", "message": "The password reset verification has expired. Request a new code."})
    user.password_hash = hash_password(body.new_password)
    db.execute(
        update(PasswordResetChallenge)
        .where(PasswordResetChallenge.user_id == user.id, PasswordResetChallenge.consumed_at.is_(None))
        .values(consumed_at=now)
    )
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    db.commit()
    return {"ok": True, "message": "Password updated. Sign in with your new password."}

