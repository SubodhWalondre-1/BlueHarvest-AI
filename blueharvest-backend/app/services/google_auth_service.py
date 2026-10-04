from typing import Any

from app.core.config import settings


class GoogleCredentialError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 401):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def verify_google_credential(credential: str) -> dict[str, Any]:
    """Verify a Google Identity Services ID token against the configured client ID.

    The browser's client ID is not trusted as proof by itself; the backend validates
    the ID token signature, expiry, issuer and audience using Google's auth library.
    """
    if not settings.google_client_id:
        raise GoogleCredentialError(
            "google_oauth_not_configured",
            "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and the authorized origin first.",
            503,
        )
    try:
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2 import id_token as google_id_token
    except ImportError as exc:
        raise GoogleCredentialError(
            "google_auth_library_missing",
            "Install the google-auth dependency to enable Google sign-in.",
            503,
        ) from exc
    try:
        claims = google_id_token.verify_oauth2_token(
            credential,
            GoogleRequest(),
            settings.google_client_id,
        )
    except Exception as exc:
        raise GoogleCredentialError(
            "invalid_google_credential",
            "Google credential is invalid or expired.",
            401,
        ) from exc
    return claims
