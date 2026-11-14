import pytest
from unittest.mock import AsyncMock, patch
from app.core.config import settings
from app.db.session import get_db
from app.main import app


def test_signup_with_phone_dispatches_sms_otp(client, monkeypatch):
    monkeypatch.setattr(settings, "fast2sms_api_key", "test_fast2sms_api_key")
    monkeypatch.setattr(settings, "dev_expose_otp", True)

    with patch("app.services.sms_service.send_sms_otp", new_callable=AsyncMock) as mock_sms:
        # Step 1: User signs up with phone number
        resp = client.post("/api/auth/signup", json={
            "full_name": "SMS Hatchery User",
            "username": "sms_user",
            "email": "sms_user@example.com",
            "phone": "+919876543210",
            "pond_location": "Pond Delta",
            "password": "SecurePassword!123",
        })
        assert resp.status_code == 201, resp.text
        data = resp.json()

        assert data["verification_required"] is True
        assert data["channel"] == "sms"
        assert data["destination"] == "+919876543210"
        assert data["otp"] is not None
        otp_code = data["otp"]

        # Step 2: Verification with invalid code fails
        bad_verify = client.post("/api/auth/signup/verify", json={
            "destination": "+919876543210",
            "code": "000000" if otp_code != "000000" else "111111",
        })
        assert bad_verify.status_code == 400
        assert bad_verify.json()["detail"]["code"] == "verification_code_invalid"

        # Step 3: Verification with valid code grants access token and cookie
        good_verify = client.post("/api/auth/signup/verify", json={
            "destination": "+919876543210",
            "code": otp_code,
        })
        assert good_verify.status_code == 200, good_verify.text
        verify_data = good_verify.json()
        assert verify_data["access_token"]
        assert verify_data["user"]["username"] == "sms_user"
        assert settings.refresh_cookie_name in good_verify.cookies

        # Step 4: After verification, user can log in normally
        login_resp = client.post("/api/auth/login", json={
            "username": "sms_user",
            "password": "SecurePassword!123",
        })
        assert login_resp.status_code == 200
        assert login_resp.json()["access_token"]

