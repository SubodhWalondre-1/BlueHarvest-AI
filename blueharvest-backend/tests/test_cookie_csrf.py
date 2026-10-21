import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.core.config import Settings, settings
from app.db.session import get_db
from app.main import app
from app.models import AuthSession


def trusted_headers():
    return {"Origin": settings.allowed_origins[0], "X-CSRF-Protection": "1"}


def session_state():
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        return [(item.id, item.token_hash, item.revoked_at) for item in db.scalars(select(AuthSession).order_by(AuthSession.id))]
    finally:
        provider.close()


@pytest.mark.parametrize("endpoint", ["refresh", "logout"])
@pytest.mark.parametrize("case", [
    "missing_both", "missing_origin", "missing_header", "empty_header", "wrong_header",
    "null_origin", "untrusted_origin", "wrong_port", "origin_suffix", "origin_credentials",
    "origin_path", "multiple_origins", "duplicate_origin", "duplicate_header", "referer_only", "bearer_only",
])
def test_csrf_rejection_does_not_rotate_revoke_or_clear_session(client, registered, endpoint, case):
    headers = trusted_headers()
    origin = headers["Origin"]
    if case == "missing_both":
        headers = {}
    elif case == "missing_origin":
        del headers["Origin"]
    elif case == "missing_header":
        del headers["X-CSRF-Protection"]
    elif case == "empty_header":
        headers["X-CSRF-Protection"] = ""
    elif case == "wrong_header":
        headers["X-CSRF-Protection"] = "true"
    elif case == "null_origin":
        headers["Origin"] = "null"
    elif case == "untrusted_origin":
        headers["Origin"] = "https://attacker.example"
    elif case == "wrong_port":
        headers["Origin"] = origin + "0"
    elif case == "origin_suffix":
        headers["Origin"] = origin + ".attacker.example"
    elif case == "origin_credentials":
        headers["Origin"] = origin.replace("://", "://attacker@")
    elif case == "origin_path":
        headers["Origin"] = origin + "/"
    elif case == "multiple_origins":
        headers["Origin"] = origin + " https://attacker.example"
    elif case == "duplicate_origin":
        headers = [("Origin", origin), ("Origin", origin), ("X-CSRF-Protection", "1")]
    elif case == "duplicate_header":
        headers = [("Origin", origin), ("X-CSRF-Protection", "1"), ("X-CSRF-Protection", "1")]
    elif case == "referer_only":
        headers = {"Referer": origin + "/", "X-CSRF-Protection": "1"}
    elif case == "bearer_only":
        headers = {"Authorization": f"Bearer {registered['token']}"}
    before = session_state()
    response = client.post(f"/api/auth/{endpoint}", headers=headers)
    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "csrf_failed"
    assert "set-cookie" not in response.headers
    assert session_state() == before
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {registered['token']}"}).status_code == 200


@pytest.mark.parametrize("endpoint", ["refresh", "logout"])
def test_form_or_query_values_cannot_replace_custom_header(client, registered, endpoint):
    response = client.post(
        f"/api/auth/{endpoint}?X-CSRF-Protection=1", headers={"Origin": settings.allowed_origins[0]},
        data={"X-CSRF-Protection": "1", "Origin": settings.allowed_origins[0]},
    )
    assert response.status_code == 403


def test_valid_refresh_rotates_cookie_and_access_token(client, registered):
    before = session_state()
    old_cookie = client.cookies.get(settings.refresh_cookie_name)
    response = client.post("/api/auth/refresh", headers=trusted_headers())
    assert response.status_code == 200, response.text
    assert response.json()["user"]["id"] == registered["user"]["id"]
    assert client.cookies.get(settings.refresh_cookie_name) != old_cookie
    after = session_state()
    assert len(after) == len(before) + 1
    assert next(row for row in after if row[0] == before[0][0])[2] is not None
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {registered['token']}"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"}).status_code == 200


def test_valid_logout_revokes_session_and_clears_cookie(client, registered):
    response = client.post("/api/auth/logout", headers=trusted_headers())
    assert response.status_code == 200 and response.json() == {"ok": True}
    assert client.cookies.get(settings.refresh_cookie_name) is None
    assert all(row[2] is not None for row in session_state())
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {registered['token']}"}).status_code == 401
    assert client.post("/api/auth/refresh", headers=trusted_headers()).status_code == 401


def test_valid_csrf_headers_do_not_replace_refresh_cookie(client):
    response = client.post("/api/auth/refresh", headers=trusted_headers())
    assert response.status_code == 401 and response.json()["detail"]["code"] == "refresh_missing"
    assert client.post("/api/auth/logout", headers=trusted_headers()).status_code == 200


def test_header_names_are_case_insensitive(client, registered):
    response = client.post("/api/auth/refresh", headers={"origin": settings.allowed_origins[0], "x-csrf-protection": "1"})
    assert response.status_code == 200


def test_each_configured_frontend_origin_is_allowed(client):
    for origin in settings.allowed_origins:
        response = client.post("/api/auth/logout", headers={"Origin": origin, "X-CSRF-Protection": "1"})
        assert response.status_code == 200


@pytest.mark.parametrize("endpoint", ["refresh", "logout"])
def test_cors_preflight_allows_custom_header_for_exact_frontend_origin(client, endpoint):
    origin = settings.allowed_origins[0]
    response = client.options(f"/api/auth/{endpoint}", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-csrf-protection,content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "x-csrf-protection" in response.headers["access-control-allow-headers"].lower()


@pytest.mark.parametrize("origin", ["https://attacker.example", "null", "http://localhost:51730"])
def test_cors_preflight_rejects_untrusted_origins(client, origin):
    response = client.options("/api/auth/refresh", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-csrf-protection",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("value", [
    "", " , ", "*", "null", "https://*.example.com", "https://.*example.com",
    "example.com", "//example.com", "ftp://example.com", "https://example.com/",
    "https://example.com/path", "https://example.com?query=1", "https://example.com#fragment",
    "https://user@example.com", "https://user:password@example.com", "https://example.com:invalid",
    "https://example.com:99999", "https://example.com\\attacker", "https://exam ple.com",
    "https://valid.example,*",
])
def test_cors_configuration_rejects_non_origins_and_wildcards(value):
    with pytest.raises(ValidationError):
        Settings(cors_origins=value, _env_file=None)


def test_cors_configuration_accepts_exact_origins_and_trims_csv_whitespace():
    config = Settings(cors_origins=" https://app.example.com, http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173 ", _env_file=None)
    assert config.allowed_origins == ["https://app.example.com", "http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"]
