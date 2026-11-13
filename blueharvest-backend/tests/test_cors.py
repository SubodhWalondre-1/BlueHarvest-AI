import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import Settings, settings
from app.main import app
from app.services.rate_limit_service import enforce_rate_limit


def test_cors_preflight_to_auth_refresh_from_allowed_origin(client):
    origin = settings.allowed_origins[0]
    response = client.options(
        "/api/auth/refresh",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-csrf-protection,content-type,authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin
    assert response.headers.get("access-control-allow-credentials") == "true"
    allowed_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers
    assert "x-csrf-protection" in allowed_headers
    assert response.headers.get("access-control-max-age") == "600"


def test_cors_preflight_from_disallowed_origin_has_no_allow_origin_header(client):
    response = client.options(
        "/api/auth/refresh",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-csrf-protection",
        },
    )
    assert "access-control-allow-origin" not in response.headers


def test_normal_requests_carry_cors_headers_and_vary_origin(client):
    origin = settings.allowed_origins[0]
    response = client.get("/", headers={"Origin": origin})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin
    assert "Origin" in response.headers.get("vary", "")


def test_error_responses_carry_cors_headers(client):
    origin = settings.allowed_origins[0]

    # 401 Unauthorized
    res_401 = client.get("/api/auth/me", headers={"Origin": origin})
    assert res_401.status_code == 401
    assert res_401.headers.get("access-control-allow-origin") == origin
    assert res_401.headers.get("access-control-allow-credentials") == "true"

    # 422 Validation Error
    res_422 = client.post("/api/auth/login", headers={"Origin": origin}, json={"invalid_field": 123})
    assert res_422.status_code == 422
    assert res_422.headers.get("access-control-allow-origin") == origin

    # 429 Rate Limited (Simulated via test endpoint)
    @app.get("/api/test-429")
    def endpoint_429():
        raise HTTPException(
            status_code=429,
            detail={"code": "rate_limited", "message": "Too many requests."},
            headers={"Retry-After": "30"},
        )

    res_429 = client.get("/api/test-429", headers={"Origin": origin})
    assert res_429.status_code == 429
    assert res_429.headers.get("access-control-allow-origin") == origin
    assert res_429.headers.get("retry-after") == "30"


def test_unhandled_exception_returns_json_500_with_cors_headers(client):
    origin = settings.allowed_origins[0]

    @app.get("/api/test-unhandled-crash")
    def unhandled_crash():
        raise RuntimeError("Simulated unhandled database failure")

    client._transport.raise_server_exceptions = False
    try:
        response = client.get("/api/test-unhandled-crash", headers={"Origin": origin})
        assert response.status_code == 500
        assert response.headers.get("access-control-allow-origin") == origin
        assert response.headers.get("access-control-allow-credentials") == "true"
        body = response.json()
        assert body.get("code") == "internal_error"
        # Ensure internal details are not leaked
        assert "Simulated unhandled database failure" not in str(body)
    finally:
        client._transport.raise_server_exceptions = True


def test_preflight_options_does_not_consume_rate_limit(client):
    origin = settings.allowed_origins[0]

    # Preflight requests to rate-limited route
    for _ in range(5):
        res = client.options(
            "/api/auth/login",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert res.status_code == 200

    # Ensure rate-limit table was not populated by preflight
    from app.models.rate_limit import RateLimitBucket
    from app.db.session import get_db
    from sqlalchemy import select
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        buckets = db.scalars(select(RateLimitBucket)).all()
        # No login bucket created for preflight
        assert not any("login" in b.key for b in buckets)
    finally:
        provider.close()


def test_settings_cors_origins_validation():
    # Wildcard is rejected
    with pytest.raises(ValueError, match=r"wildcard"):
        Settings(cors_origins="*", _env_file=None)

    # Whitespace trimmed and trailing slashes normalized
    s = Settings(cors_origins=" https://blueharvest-ai.netlify.app/ , http://localhost:5173/ ", _env_file=None)
    assert s.allowed_origins == ["https://blueharvest-ai.netlify.app", "http://localhost:5173"]

    # In production, empty CORS_ORIGINS list fails fast
    with pytest.raises(RuntimeError, match=r"CORS_ORIGINS"):
        Settings(
            app_env="production",
            cors_origins="",
            secret_key="a" * 32,
            cookie_secure=True,
            cookie_samesite="none",
            _env_file=None,
        )

    # In production, missing CORS_ORIGINS fails fast
    with pytest.raises(RuntimeError, match=r"CORS_ORIGINS"):
        Settings(
            app_env="production",
            cors_origins=None,
            secret_key="a" * 32,
            cookie_secure=True,
            cookie_samesite="none",
            _env_file=None,
        )
