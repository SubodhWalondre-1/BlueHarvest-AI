import pytest
from app.services.demo_service import DEMO_USER, seed_demo_data
from app.core.config import settings
from app.db.session import get_db
from app.main import app


def test_signup_requires_email_otp_verification(client):
    # Step 1: User signs up
    signup_resp = client.post("/api/auth/signup", json={
        "full_name": "OTP Hatchery User",
        "username": "otp_user",
        "email": "otp_user@example.com",
        "pond_location": "Pond Beta",
        "password": "SecurePassword!123",
    })
    assert signup_resp.status_code == 201, signup_resp.text
    signup_data = signup_resp.json()
    assert signup_data["verification_required"] is True
    assert signup_data["email"] == "otp_user@example.com"
    assert "access_token" not in signup_data
    assert signup_data["otp"] is not None  # Exposed in test environment

    # Step 2: Unverified user cannot log in
    login_attempt = client.post("/api/auth/login", json={
        "username": "otp_user",
        "password": "SecurePassword!123",
    })
    assert login_attempt.status_code == 403
    assert login_attempt.json()["detail"]["code"] == "email_not_verified"

    # Step 3: Incorrect OTP rejected
    invalid_verify = client.post("/api/auth/signup/verify", json={
        "email": "otp_user@example.com",
        "code": "000000" if signup_data["otp"] != "000000" else "111111",
    })
    assert invalid_verify.status_code == 400
    assert invalid_verify.json()["detail"]["code"] == "verification_code_invalid"

    # Step 4: Correct OTP verification grants session and access token
    verify_resp = client.post("/api/auth/signup/verify", json={
        "email": "otp_user@example.com",
        "code": signup_data["otp"],
    })
    assert verify_resp.status_code == 200, verify_resp.text
    session_data = verify_resp.json()
    assert session_data["access_token"]
    assert session_data["user"]["email"] == "otp_user@example.com"
    assert settings.refresh_cookie_name in verify_resp.cookies

    # Step 5: After verification, normal login succeeds
    login_success = client.post("/api/auth/login", json={
        "username": "otp_user",
        "password": "SecurePassword!123",
    })
    assert login_success.status_code == 200
    assert login_success.json()["access_token"]


def test_signup_otp_resend_flow(client):
    signup_resp = client.post("/api/auth/signup", json={
        "full_name": "Resend Test Operator",
        "username": "resend_user",
        "email": "resend_user@example.com",
        "pond_location": "Pond Gamma",
        "password": "SecurePassword!123",
    })
    assert signup_resp.status_code == 201

    # Immediate resend rejected by cooldown (30s)
    cooldown_resp = client.post("/api/auth/signup/resend", json={
        "email": "resend_user@example.com",
    })
    assert cooldown_resp.status_code == 429
    assert cooldown_resp.json()["detail"]["code"] == "resend_cooldown"


def test_demo_user_bypasses_email_verification_block(client, monkeypatch):
    monkeypatch.setattr(settings, "demo_mode_enabled", True)
    provider = app.dependency_overrides[get_db]()
    try:
        seed_demo_data(next(provider))
    finally:
        provider.close()

    demo_login = client.post("/api/auth/login", json={
        "username": DEMO_USER["username"],
        "password": DEMO_USER["password"],
    })
    assert demo_login.status_code == 200
    assert demo_login.json()["user"]["isDemo"] is True
