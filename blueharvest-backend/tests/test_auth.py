def test_signup_login_and_me(client):
    result = client.post("/api/auth/signup", json={
        "full_name": "Test Operator", "username": "operator_one",
        "email": "operator1@example.com", "phone": None,
        "pond_location": "Pond One", "password": "LongPassword!123",
    })
    assert result.status_code == 201, result.text
    response = result.json()
    assert response["user"]["email"] == "operator1@example.com"
    assert response["access_token"]

    duplicate = client.post("/api/auth/signup", json={
        "full_name": "Duplicate", "username": "operator_one",
        "email": "operator2@example.com", "pond_location": "Pond Two",
        "password": "LongPassword!123",
    })
    assert duplicate.status_code == 409

    login = client.post("/api/auth/login", json={"username": "operator_one", "password": "LongPassword!123"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["user"]["username"] == "operator_one"


def test_login_rejects_wrong_password(client, registered):
    response = client.post("/api/auth/login", json={"username": registered["user"]["username"], "password": "WrongPassword"})
    assert response.status_code == 401


def test_google_login_is_explicitly_disabled_without_client_id(client, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "google_client_id", None)
    response = client.post("/api/auth/google", json={"credential": "placeholder-google-credential-value"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "google_oauth_not_configured"
