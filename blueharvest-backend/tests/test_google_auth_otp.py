import pytest
from unittest.mock import patch
from app.core.config import settings
from app.main import app
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

    with patch("app.api.routes.auth.verify_google_credential", return_value=fake_claims), \
         patch("app.api.routes.auth.send_email_otp"):
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


def test_google_resend_and_superseded_challenge_verification(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test_google_client_id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "dev_expose_otp", True)

    fake_claims = {
        "email": "farmer_resend@gmail.com",
        "sub": "google_sub_987654321",
        "email_verified": True,
        "name": "Resend Farmer",
    }

    with patch("app.api.routes.auth.verify_google_credential", return_value=fake_claims), \
         patch("app.api.routes.auth.send_email_otp"):
        resp = client.post("/api/auth/google", json={"credential": "valid_google_jwt_token"})
        assert resp.status_code == 200
        old_challenge_id = resp.json()["challenge_id"]

        # Fast forward time to bypass cooldown
        from datetime import datetime, timedelta, timezone
        from app.models.auth import EmailVerificationChallenge
        from app.db.session import get_db

        db_gen = app.dependency_overrides[get_db]()
        db = next(db_gen)
        try:
            c = db.get(EmailVerificationChallenge, old_challenge_id)
            c.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=35)
            db.commit()
        finally:
            db.close()

        # Resend OTP
        resend_resp = client.post("/api/auth/google/resend-otp", json={"challenge_id": old_challenge_id})
        assert resend_resp.status_code == 200, resend_resp.text
        resend_data = resend_resp.json()
        new_challenge_id = resend_data["challenge_id"]
        new_otp = resend_data["otp"]
        assert new_challenge_id != old_challenge_id

        # Submitting the NEW code with the OLD challenge_id must automatically resolve and succeed
        verify_resp = client.post("/api/auth/google/verify-otp", json={
            "challenge_id": old_challenge_id,
            "code": new_otp,
        })
        assert verify_resp.status_code == 200, verify_resp.text
        assert verify_resp.json()["access_token"]
        assert verify_resp.json()["user"]["email"] == "farmer_resend@gmail.com"


