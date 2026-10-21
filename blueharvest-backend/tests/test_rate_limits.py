from concurrent.futures import ThreadPoolExecutor
import asyncio
from datetime import timedelta
from io import BytesIO
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, Request, Response
from pydantic import ValidationError
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import sessionmaker

from app.api.routes import auth, image_processing
from app.core.config import Settings, settings
from app.core.security import hash_password
from app.core.time import utcnow_naive
from app.db.base import Base
from app.models import RateLimitBucket, User
from app.schemas.auth import LoginRequest, PasswordResetRequest, PasswordResetVerify, SignupRequest
from app.services import rate_limit_service as limits


PASSWORD = "ValidPassword!123"


def request(ip="198.51.100.1", headers=()):
    return Request({"type": "http", "client": (ip, 12345), "headers": list(headers)})


def complete(operation):
    return asyncio.run(operation)


@pytest.fixture()
def rate_db(tmp_path, monkeypatch):
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'limits.db').as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 10},
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(settings, "login_account_limit", 2)
    monkeypatch.setattr(settings, "login_ip_limit", 20)
    monkeypatch.setattr(settings, "signup_ip_limit", 2)
    monkeypatch.setattr(settings, "otp_account_limit", 2)
    monkeypatch.setattr(settings, "otp_ip_limit", 20)
    monkeypatch.setattr(settings, "otp_request_ip_limit", 2)
    monkeypatch.setattr(settings, "inference_account_limit", 1)
    monkeypatch.setattr(settings, "inference_ip_limit", 20)
    monkeypatch.setattr(settings, "app_env", "test")
    monkeypatch.setattr(settings, "dev_expose_otp", True)
    now = [utcnow_naive()]
    monkeypatch.setattr(limits, "utcnow_naive", lambda: now[0])
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setattr(settings, "upload_dir", str(uploads))
    hashed = hash_password(PASSWORD)
    with sessions() as db:
        for index in (1, 2):
            db.add(User(
                id=f"operator-{index}", username=f"operator_{index}", full_name="Test Operator",
                email=f"operator{index}@example.com", phone=f"+91987654321{index}", password_hash=hashed,
            ))
        db.commit()
        yield db, sessions, now
    engine.dispose()


def login(db, identity="operator_1", password="WrongPassword", ip="198.51.100.1", headers=()):
    return auth.login(LoginRequest(username=identity, password=password), request(ip, headers), Response(), db)


def assert_rejected(status, operation):
    with pytest.raises(HTTPException) as rejected:
        operation()
    assert rejected.value.status_code == status
    if status == 429:
        retry = int(rejected.value.headers["Retry-After"])
        assert retry > 0
        assert rejected.value.detail["retry_after"] == retry
        assert rejected.value.detail["code"] == "rate_limited"
    return rejected.value


def test_login_account_budget_covers_username_email_and_rotating_ips(rate_db):
    db, _, _ = rate_db
    assert_rejected(401, lambda: login(db))
    assert_rejected(401, lambda: login(db, "OPERATOR1@EXAMPLE.COM", ip="198.51.100.2"))
    assert_rejected(429, lambda: login(db, password=PASSWORD, ip="198.51.100.3"))


def test_login_ip_budget_covers_different_accounts_and_ignores_spoofed_headers(rate_db, monkeypatch):
    db, _, _ = rate_db
    monkeypatch.setattr(settings, "login_ip_limit", 2)
    for index in range(2):
        headers = [(b"x-forwarded-for", f"203.0.113.{index}".encode())]
        assert_rejected(401, lambda: login(db, f"unknown_{index}", headers=headers))
    assert_rejected(429, lambda: login(db, "operator_2", password=PASSWORD))


def test_unknown_login_identity_is_normalized(rate_db):
    db, _, _ = rate_db
    assert_rejected(401, lambda: login(db, "missing_user"))
    assert_rejected(401, lambda: login(db, " MISSING_USER "))
    assert_rejected(429, lambda: login(db, "missing_user", ip="198.51.100.2"))


def test_successful_login_resets_only_the_account_budget(rate_db, monkeypatch):
    db, _, _ = rate_db
    monkeypatch.setattr(settings, "login_ip_limit", 4)
    assert_rejected(401, lambda: login(db))
    result = login(db, password=PASSWORD)
    assert result["access_token"] and result["user"]["username"] == "operator_1"
    assert_rejected(401, lambda: login(db))
    assert_rejected(401, lambda: login(db))
    assert_rejected(429, lambda: login(db, "operator_2", password=PASSWORD))


def test_cooldown_expires_and_rejections_do_not_extend_it(rate_db):
    db, _, now = rate_db
    for _ in range(2):
        limits.enforce_rate_limit(db, request(), "test", ip_limit=2, window_seconds=60)
    first = assert_rejected(429, lambda: limits.enforce_rate_limit(db, request(), "test", ip_limit=2, window_seconds=60))
    assert first.detail["retry_after"] == 60
    now[0] += timedelta(seconds=20)
    second = assert_rejected(429, lambda: limits.enforce_rate_limit(db, request(), "test", ip_limit=2, window_seconds=60))
    assert second.detail["retry_after"] == 40
    now[0] += timedelta(seconds=40)
    limits.enforce_rate_limit(db, request(), "test", ip_limit=2, window_seconds=60)
    assert db.scalar(select(RateLimitBucket.request_count)) == 1


def test_counters_survive_rollback_and_a_separate_database_engine(rate_db):
    db, sessions, _ = rate_db
    limits.enforce_rate_limit(db, request(), "shared", ip_limit=1, window_seconds=60)
    db.rollback()
    other_engine = create_engine(sessions.kw["bind"].url)
    try:
        with sessionmaker(bind=other_engine)() as other:
            assert_rejected(429, lambda: limits.enforce_rate_limit(other, request(), "shared", ip_limit=1, window_seconds=60))
    finally:
        other_engine.dispose()


def test_signup_is_limited_before_account_creation(rate_db):
    db, _, _ = rate_db

    def signup(index):
        return auth.signup(SignupRequest(
            full_name="New Operator", username=f"new_operator_{index}", email=f"new{index}@example.com",
            pond_location="Test Pond", password=PASSWORD,
        ), request(), Response(), db)

    assert signup(1)["access_token"]
    assert signup(2)["access_token"]
    assert_rejected(429, lambda: signup(3))
    assert db.scalar(select(User.id).where(User.username == "new_operator_3")) is None


def test_otp_account_budget_covers_both_recovery_channels(rate_db):
    db, _, _ = rate_db

    def verify(destination, ip):
        return auth.password_reset_verify(PasswordResetVerify(destination=destination, code="000000"), request(ip), db)

    assert_rejected(400, lambda: verify("operator1@example.com", "198.51.100.1"))
    assert_rejected(400, lambda: verify("+91 9876543211", "198.51.100.2"))
    assert_rejected(429, lambda: verify("operator1@example.com", "198.51.100.3"))


def test_otp_ip_budget_covers_different_destinations(rate_db, monkeypatch):
    db, _, _ = rate_db
    monkeypatch.setattr(settings, "otp_ip_limit", 2)
    for index in range(2):
        assert_rejected(400, lambda: auth.password_reset_verify(
            PasswordResetVerify(destination=f"missing{index}@example.com", code="000000"), request(), db,
        ))
    assert_rejected(429, lambda: auth.password_reset_verify(
        PasswordResetVerify(destination="operator1@example.com", code="000000"), request(), db,
    ))


def test_recovery_request_ip_limit_preserves_generic_unknown_account_response(rate_db):
    db, _, _ = rate_db
    body = PasswordResetRequest(destination="missing@example.com")
    first = complete(auth.password_reset_request(body, request(), db))
    second = complete(auth.password_reset_request(body, request(), db))
    assert first == second and first["ok"] is True
    assert_rejected(429, lambda: complete(auth.password_reset_request(body, request(), db)))


def test_inference_is_limited_before_validation_storage_and_modal_calls(rate_db, monkeypatch):
    db, _, _ = rate_db
    calls = []

    async def validate(_image):
        calls.append("validate")
        return b"mock-image", {"format": "png", "filename": "sample.png"}

    async def count(*_args):
        calls.append("modal")
        return {"final_count": 19, "final_fish_count": 19, "method": "P2PNet", "stats": {}}

    monkeypatch.setattr(image_processing, "read_and_validate_image", validate)
    monkeypatch.setattr(image_processing, "count_fish_image", count)
    user = db.get(User, "operator-1")

    def process(ip):
        return complete(image_processing.image_processing(
            request(ip), SimpleNamespace(content_type="image/png"), user, db,
        ))

    result = process("198.51.100.1")
    assert result["final_count"] == 19 and result["image_url"].startswith("/api/uploads/")
    assert_rejected(429, lambda: process("198.51.100.2"))
    assert calls == ["validate", "modal"]
    assert len(list(settings.uploads_path.iterdir())) == 1


@pytest.mark.parametrize("endpoint", ["preprocess_image", "model_health"])
def test_other_costly_endpoints_have_separate_budgets(rate_db, monkeypatch, endpoint):
    db, _, _ = rate_db
    calls = []

    async def validate(_file):
        calls.append("validate")
        return b"mock-image", {"format": "png", "filename": "sample.png"}

    async def health():
        calls.append("health")
        return {"status": "ok"}

    monkeypatch.setattr(image_processing, "read_and_validate_image", validate)
    monkeypatch.setattr(image_processing, "check_modal_health", health)
    user = db.get(User, "operator-1")

    def call():
        if endpoint == "model_health":
            return complete(image_processing.model_health(request(), user, db))
        return complete(image_processing.preprocess_image(request(), None, user, db))

    assert call()["status"] in {"ok", "validated"}
    assert_rejected(429, call)
    assert len(calls) == 1


def test_inference_ip_budget_covers_multiple_users(rate_db, monkeypatch):
    db, _, _ = rate_db
    monkeypatch.setattr(settings, "inference_ip_limit", 1)

    async def health():
        return {"status": "ok"}

    monkeypatch.setattr(image_processing, "check_modal_health", health)
    complete(image_processing.model_health(request(), db.get(User, "operator-1"), db))
    assert_rejected(429, lambda: complete(image_processing.model_health(request(), db.get(User, "operator-2"), db)))


def test_atomic_limits_hold_under_concurrent_requests(rate_db):
    _, sessions, _ = rate_db
    barrier = Barrier(8)

    def attempt(_index):
        with sessions() as db:
            barrier.wait(timeout=5)
            try:
                limits.enforce_rate_limit(db, request(), "concurrent", ip_limit=3, window_seconds=60)
                return 200
            except HTTPException as rejected:
                return rejected.status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(attempt, range(8)))
    assert results.count(200) == 3 and results.count(429) == 5


def test_counter_storage_is_private_bounded_and_cleans_expired_entries(rate_db):
    db, _, now = rate_db
    limits.enforce_rate_limit(db, request(), "short", ip_limit=1, window_seconds=10, account="private@example.com", account_limit=1)
    limits.enforce_rate_limit(db, request(), "long", ip_limit=1, window_seconds=60)
    for _ in range(3):
        assert_rejected(429, lambda: limits.enforce_rate_limit(db, request(), "short", ip_limit=1, window_seconds=10))
    buckets = list(db.scalars(select(RateLimitBucket)))
    assert len(buckets) == 3
    assert all(len(bucket.key) == 64 and bucket.request_count == 1 for bucket in buckets)
    now[0] += timedelta(seconds=10)
    limits.enforce_rate_limit(db, request(), "new", ip_limit=1, window_seconds=60)
    assert len(list(db.scalars(select(RateLimitBucket)))) == 2


@pytest.mark.parametrize("host", ["2001:db8:0:0:0:0:0:1", "2001:db8::1"])
def test_ipv6_addresses_are_canonicalized(host):
    assert limits.client_ip(request(host)) == "2001:db8::1"


def test_ipv4_mapped_ipv6_and_missing_clients_cannot_bypass_ip_limits():
    assert limits.client_ip(request("::ffff:198.51.100.1")) == "198.51.100.1"
    assert limits.client_ip(Request({"type": "http", "headers": []})) == "unknown"


@pytest.mark.parametrize("field", ["login_account_limit", "signup_ip_limit", "otp_ip_limit", "inference_window_seconds"])
def test_invalid_limits_are_rejected_by_configuration(field):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{field: 0})


def test_postgresql_uses_conditional_upsert_with_returning():
    db = MagicMock()
    db.get_bind.return_value.dialect.name = "postgresql"
    db.scalar.return_value = utcnow_naive() + timedelta(seconds=60)
    limits.enforce_rate_limit(db, request(), "postgresql", ip_limit=2, window_seconds=60)
    sql = str(db.scalar.call_args.args[0].compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT" in sql and "WHERE" in sql and "RETURNING" in sql


def test_login_rate_limit_response_over_http(client, registered, monkeypatch):
    monkeypatch.setattr(settings, "login_account_limit", 2)
    payload = {"username": registered["user"]["username"], "password": "WrongPassword"}
    for _ in range(2):
        assert client.post("/api/auth/login", json=payload).status_code == 401
    payload["password"] = "SafeTestPass!123"
    response = client.post("/api/auth/login", json=payload, headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0
    assert response.json()["detail"]["retry_after"] == int(response.headers["Retry-After"])
    assert "Retry-After" in response.headers["access-control-expose-headers"]


def test_inference_rate_limit_response_over_http(client, registered, monkeypatch):
    monkeypatch.setattr(settings, "inference_account_limit", 1)
    calls = []

    async def count(*_args):
        calls.append("modal")
        return {"final_count": 7, "final_fish_count": 7, "method": "P2PNet", "stats": {}}

    monkeypatch.setattr(image_processing, "count_fish_image", count)
    data = BytesIO()
    Image.new("RGB", (8, 8), "white").save(data, format="PNG")
    headers = {"Authorization": f"Bearer {registered['token']}"}

    def upload():
        return client.post("/api/image-processing", files={"image": ("sample.png", data.getvalue(), "image/png")}, headers=headers)

    assert upload().json()["final_count"] == 7
    response = upload()
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0
    assert calls == ["modal"]
    assert len(list(settings.uploads_path.iterdir())) == 1
