from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from fastapi import HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_current_user
from app.api.routes import auth
from app.core.config import settings
from app.core.security import digest_otp, digest_token, hash_password, verify_password
from app.core.time import utcnow_naive
from app.db.base import Base
from app.models import AuthSession, PasswordResetChallenge, User
from app.schemas.auth import PasswordResetConfirm, PasswordResetRequest, PasswordResetVerify
from app.services.auth_service import authenticate_user, issue_session


EMAIL = "recovery@example.com"
PHONE = "+919876543210"
PASSWORD = "OriginalPassword!123"
NEW_PASSWORD = "UpdatedPassword!123"


@pytest.fixture()
def recovery_db(monkeypatch, tmp_path):
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'recovery.db').as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 10},
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(settings, "app_env", "test")
    monkeypatch.setattr(settings, "dev_expose_otp", True)
    codes = iter(f"{number:06d}" for number in range(123456, 123500))
    monkeypatch.setattr(auth, "generate_otp", lambda: next(codes))
    with sessions() as db:
        db.add(User(
            id="recovery-user", username="recovery_operator", full_name="Recovery Operator",
            email=EMAIL, phone=PHONE, password_hash=hash_password(PASSWORD),
        ))
        db.commit()
        yield db, sessions
    engine.dispose()


def request_code(db, destination=EMAIL):
    # Mocked delivery completes without asynchronous I/O or a running event loop.
    operation = auth.password_reset_request(PasswordResetRequest(destination=destination), recovery_request(), db)
    try:
        operation.send(None)
    except StopIteration as completed:
        return completed.value
    finally:
        operation.close()
    raise AssertionError("Recovery delivery unexpectedly required asynchronous I/O")


def verify_code(db, code, destination=EMAIL):
    return auth.password_reset_verify(PasswordResetVerify(destination=destination, code=code), recovery_request(), db)["reset_token"]


def confirm_reset(db, token, destination=EMAIL):
    return auth.password_reset_confirm(PasswordResetConfirm(
        destination=destination, reset_token=token, new_password=NEW_PASSWORD,
    ), recovery_request(), db)


def recovery_request():
    return Request({"type": "http", "client": ("198.51.100.1", 12345), "headers": []})


@pytest.mark.parametrize("destination", [EMAIL, PHONE])
def test_reset_preserves_normal_login_and_revokes_existing_sessions(recovery_db, destination):
    db, _ = recovery_db
    user = db.get(User, "recovery-user")
    issued = issue_session(db, user, Response())
    code = request_code(db, destination)["development_code"]
    token = verify_code(db, code, destination)

    assert confirm_reset(db, token, destination)["ok"] is True
    assert authenticate_user(db, "recovery_operator", NEW_PASSWORD).id == user.id
    assert all(session.revoked_at is not None for session in db.scalars(select(AuthSession)))
    with pytest.raises(HTTPException) as rejected:
        get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=issued["access_token"]), db)
    assert rejected.value.status_code == 401
    with pytest.raises(HTTPException):
        authenticate_user(db, "recovery_operator", PASSWORD)


def test_new_request_invalidates_previous_code(recovery_db):
    db, _ = recovery_db
    old_code = request_code(db)["development_code"]
    new_code = request_code(db)["development_code"]

    with pytest.raises(HTTPException) as rejected:
        verify_code(db, old_code)
    assert rejected.value.status_code == 400
    assert verify_code(db, new_code)


def test_new_request_invalidates_verified_token_across_channels(recovery_db):
    db, _ = recovery_db
    old_token = verify_code(db, request_code(db)["development_code"])
    sms_code = request_code(db, PHONE)["development_code"]

    with pytest.raises(HTTPException) as rejected:
        confirm_reset(db, old_token)
    assert rejected.value.status_code == 400
    new_token = verify_code(db, sms_code, PHONE)
    assert confirm_reset(db, new_token, PHONE)["ok"] is True


def test_completed_reset_invalidates_older_outstanding_tokens(recovery_db):
    db, _ = recovery_db
    now = utcnow_naive()
    for name, age in [("older-reset-token-value", 2), ("newer-reset-token-value", 1)]:
        db.add(PasswordResetChallenge(
            id=name, user_id="recovery-user", destination=EMAIL, channel="email",
            code_hash=digest_otp(EMAIL, "123456"), reset_token_hash=digest_token(name),
            verified_at=now - timedelta(minutes=age), created_at=now - timedelta(minutes=age),
            expires_at=now + timedelta(minutes=5),
        ))
    db.commit()

    assert confirm_reset(db, "newer-reset-token-value")["ok"] is True
    with pytest.raises(HTTPException) as rejected:
        confirm_reset(db, "older-reset-token-value")
    assert rejected.value.status_code == 400
    assert all(item.consumed_at is not None for item in db.scalars(select(PasswordResetChallenge)))


@pytest.mark.parametrize("expired", [False, True])
def test_used_or_expired_reset_token_is_rejected(recovery_db, expired):
    db, _ = recovery_db
    token = verify_code(db, request_code(db)["development_code"])
    if expired:
        challenge = db.scalar(select(PasswordResetChallenge))
        challenge.expires_at = utcnow_naive() - timedelta(seconds=1)
        db.commit()
    else:
        confirm_reset(db, token)

    with pytest.raises(HTTPException) as rejected:
        confirm_reset(db, token)
    assert rejected.value.status_code == 400


def test_verified_code_cannot_fall_back_to_an_older_challenge(recovery_db):
    db, _ = recovery_db
    old_code = request_code(db)["development_code"]
    older = db.scalar(select(PasswordResetChallenge))
    new_code = request_code(db)["development_code"]
    older.consumed_at = None
    db.commit()
    verify_code(db, new_code)

    with pytest.raises(HTTPException) as rejected:
        verify_code(db, old_code)
    assert rejected.value.status_code == 400


def test_failed_delivery_preserves_previous_verified_token(recovery_db, monkeypatch):
    db, _ = recovery_db
    token = verify_code(db, request_code(db)["development_code"])
    monkeypatch.setattr(settings, "dev_expose_otp", False)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.invalid")
    monkeypatch.setattr(settings, "smtp_from_email", "sender@example.com")

    async def failed_delivery(_destination, _code):
        raise RuntimeError("Simulated delivery failure")

    monkeypatch.setattr(auth, "send_email_otp", failed_delivery)
    with pytest.raises(HTTPException) as rejected:
        request_code(db)
    assert rejected.value.status_code == 502
    assert confirm_reset(db, token)["ok"] is True


def test_existing_otp_attempt_and_request_limits_are_preserved(recovery_db):
    db, _ = recovery_db
    code = request_code(db)["development_code"]
    for _ in range(settings.otp_max_attempts):
        with pytest.raises(HTTPException):
            verify_code(db, "000000")
    with pytest.raises(HTTPException):
        verify_code(db, code)
    for _ in range(4):
        request_code(db)
    with pytest.raises(HTTPException) as rejected:
        request_code(db)
    assert rejected.value.status_code == 429
    assert rejected.value.detail["code"] == "recovery_rate_limited"
    assert 0 < int(rejected.value.headers["Retry-After"]) <= 900


@pytest.mark.parametrize("operation", ["verify", "confirm"])
def test_concurrent_requests_cannot_reuse_recovery_credentials(recovery_db, operation):
    db, sessions = recovery_db
    code = request_code(db)["development_code"]
    token = verify_code(db, code) if operation == "confirm" else None
    barrier = Barrier(2)

    def attempt():
        with sessions() as worker_db:
            barrier.wait(timeout=5)
            try:
                if operation == "verify":
                    verify_code(worker_db, code)
                else:
                    confirm_reset(worker_db, token)
                return 200
            except HTTPException as rejected:
                worker_db.rollback()
                return rejected.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: attempt(), range(2)))
    assert sorted(results) == [200, 400]


def test_failed_commit_rolls_back_password_challenges_and_sessions(recovery_db, monkeypatch):
    db, _ = recovery_db
    user = db.get(User, "recovery-user")
    issue_session(db, user, Response())
    token = verify_code(db, request_code(db)["development_code"])

    with monkeypatch.context() as patch:
        original_commit = db.commit
        commits = 0

        def failed_commit():
            nonlocal commits
            commits += 1
            if commits == 1:
                return original_commit()
            raise RuntimeError("Simulated transaction failure")

        patch.setattr(db, "commit", failed_commit)
        with pytest.raises(RuntimeError):
            confirm_reset(db, token)
        db.rollback()

    assert verify_password(PASSWORD, db.get(User, "recovery-user").password_hash)
    assert db.scalar(select(PasswordResetChallenge)).consumed_at is None
    assert db.scalar(select(AuthSession)).revoked_at is None
    assert confirm_reset(db, token)["ok"] is True
