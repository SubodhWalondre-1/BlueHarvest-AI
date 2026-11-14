import pytest
from unittest.mock import patch
from app.core.config import settings
from app.services.google_auth_service import GoogleCredentialError


def test_google_login_requires_email_otp(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test_google_client_id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "dev_expose_otp", True)

    fake_claims = {
        "email": "farmer_subodh@gmail.com",
        "sub": "google_sub_123456789",
        "email_verified": True,
        "name": "Subodh Farmer",
    }

    with patch("app.api.routes.auth.verify_google_credential", return_value=fake_claims):
        # Step 1: Initiating Google login dispatches Email OTP and does NOT grant access token yet
        google_resp = client.post("/api/auth/google", json={"credential": "valid_google_jwt_token"})
        assert google_resp.status_code == 200, google_resp.text
        data = google_resp.json()

        assert data["verification_required"] is True
        assert data["channel"] == "email"
        assert data["email"] == "farmer_subodh@gmail.com"
        assert "challenge_id" in data
        assert "access_token" not in data
        assert data["otp"] is not None
        challenge_id = data["challenge_id"]
        otp_code = data["otp"]

        # Step 2: Submitting an invalid OTP is rejected
        bad_verify = client.post("/api/auth/google/verify-otp", json={
            "challenge_id": challenge_id,
            "code": "000000" if otp_code != "000000" else "111111",
        })
        assert bad_verify.status_code == 400
        assert bad_verify.json()["detail"]["code"] == "verification_code_invalid"

        # Step 3: Resending code too quickly is throttled by cooldown
        fast_resend = client.post("/api/auth/google/resend-otp", json={
            "challenge_id": challenge_id,
        })
        assert fast_resend.status_code == 429
        assert fast_resend.json()["detail"]["code"] == "resend_cooldown"

        # Step 4: Submitting the valid Email OTP completes login and issues access token + session cookie
        good_verify = client.post("/api/auth/google/verify-otp", json={
            "challenge_id": challenge_id,
            "code": otp_code,
        })
        assert good_verify.status_code == 200, good_verify.text
        verify_data = good_verify.json()
        assert verify_data["access_token"]
        assert verify_data["user"]["email"] == "farmer_subodh@gmail.com"
        assert settings.refresh_cookie_name in good_verify.cookies

