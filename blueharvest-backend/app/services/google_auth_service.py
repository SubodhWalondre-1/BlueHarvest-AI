from typing import Any

from app.core.config import settings


class GoogleCredentialError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 401):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _normalize_google_claims(claims: dict[str, Any]) -> dict[str, Any]:
    """Ensure standard types for Google token claims across local and remote verification."""
    ev = claims.get("email_verified")
    if ev in (True, "true", "True", 1, "1"):
        claims["email_verified"] = True
    else:
        claims["email_verified"] = False
    return claims


def _verify_via_google_tokeninfo(credential: str) -> dict[str, Any]:
    """Fallback ID token verification using Google's official tokeninfo HTTPS endpoint."""
    try:
        import httpx

        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": credential},
            )
    except Exception as exc:
        raise GoogleCredentialError(
            "google_auth_connection_failed",
            "Unable to connect to Google authentication services. Please try again.",
            503,
        ) from exc

    if resp.status_code != 200:
        raise GoogleCredentialError(
            "invalid_google_credential",
            "Google credential is invalid or expired.",
            401,
        )

    try:
        data = resp.json()
    except Exception as exc:
        raise GoogleCredentialError(
            "invalid_google_credential",
            "Invalid response from Google authentication services.",
            401,
        ) from exc

    # Cryptographic / Audience checks
    aud = data.get("aud")
    if aud != settings.google_client_id:
        raise GoogleCredentialError(
            "invalid_google_audience",
            "Google credential was issued for a different client ID.",
            401,
        )

    iss = data.get("iss")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise GoogleCredentialError(
            "invalid_google_issuer",
            "Google credential issuer is invalid.",
            401,
        )

    return _normalize_google_claims(data)


def verify_google_credential(credential: str) -> dict[str, Any]:
    """Verify a Google Identity Services ID token against the configured client ID.

    The backend validates the ID token signature, expiry, issuer and audience
    using Google's official auth library with automatic resilient fallback to Google's
    secure tokeninfo endpoint.
    """
    if not settings.google_client_id:
        raise GoogleCredentialError(
            "google_oauth_not_configured",
            "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and the authorized origin first.",
            503,
        )

    # Primary: Fast in-process cryptographic verification via google-auth + requests
    try:
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2 import id_token as google_id_token

        claims = google_id_token.verify_oauth2_token(
            credential,
            GoogleRequest(),
            settings.google_client_id,
        )
        return _normalize_google_claims(claims)
    except (ImportError, ModuleNotFoundError):
        # Resilient fallback: Verified via Google's tokeninfo endpoint over HTTPS
        return _verify_via_google_tokeninfo(credential)
    except Exception as exc:
        raise GoogleCredentialError(
            "invalid_google_credential",
            "Google credential is invalid or expired.",
            401,
        ) from exc
