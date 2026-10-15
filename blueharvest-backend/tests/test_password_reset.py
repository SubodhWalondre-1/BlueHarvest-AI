def test_email_otp_password_reset_flow(client, registered):
    request = client.post("/api/auth/password-reset/request", json={"destination": "operator@example.com"})
    assert request.status_code == 200, request.text
    code = request.json().get("development_code")
    assert code and len(code) == 6

    verification = client.post("/api/auth/password-reset/verify", json={"destination": "operator@example.com", "code": code})
    assert verification.status_code == 200, verification.text
    reset_token = verification.json()["reset_token"]

    # A verified OTP cannot be replayed to mint multiple password-reset tokens.
    replay_code = client.post("/api/auth/password-reset/verify", json={"destination": "operator@example.com", "code": code})
    assert replay_code.status_code == 400

    confirmed = client.post("/api/auth/password-reset/confirm", json={
        "destination": "operator@example.com", "reset_token": reset_token,
        "new_password": "NewSafePassword!123",
    })
    assert confirmed.status_code == 200, confirmed.text
    login = client.post("/api/auth/login", json={"username": "operator_test", "password": "NewSafePassword!123"})
    assert login.status_code == 200

    replay = client.post("/api/auth/password-reset/confirm", json={
        "destination": "operator@example.com", "reset_token": reset_token,
        "new_password": "AnotherSafePassword!123",
    })
    assert replay.status_code == 400


def test_invalid_otp_is_rejected(client, registered):
    response = client.post("/api/auth/password-reset/request", json={"destination": "operator@example.com"})
    assert response.status_code == 200
    invalid = client.post("/api/auth/password-reset/verify", json={"destination": "operator@example.com", "code": "000000"})
    assert invalid.status_code == 400


def test_sms_otp_password_reset_flow(client, registered):
    request = client.post("/api/auth/password-reset/request", json={"destination": "+919876543210"})
    assert request.status_code == 200, request.text
    assert request.json().get("channel") == "sms"
    code = request.json().get("development_code")
    assert code and len(code) == 6

    verification = client.post("/api/auth/password-reset/verify", json={"destination": "+919876543210", "code": code})
    assert verification.status_code == 200, verification.text
    reset_token = verification.json()["reset_token"]
    confirmed = client.post("/api/auth/password-reset/confirm", json={
        "destination": "+919876543210", "reset_token": reset_token,
        "new_password": "NewSmsPassword!123",
    })
    assert confirmed.status_code == 200, confirmed.text
    login = client.post("/api/auth/login", json={"username": "operator_test", "password": "NewSmsPassword!123"})
    assert login.status_code == 200


def test_recovery_provider_configuration_error_does_not_reveal_account_presence(client, registered, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "dev_expose_otp", False)
    monkeypatch.setattr(settings, "smtp_host", None)
    monkeypatch.setattr(settings, "smtp_from_email", None)

    known = client.post("/api/auth/password-reset/request", json={"destination": "operator@example.com"})
    unknown = client.post("/api/auth/password-reset/request", json={"destination": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 503
    assert known.json()["detail"]["code"] == unknown.json()["detail"]["code"] == "recovery_delivery_not_configured"
