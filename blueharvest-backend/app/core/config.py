from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "BlueHarvest AI API"
    app_env: str = "development"
    debug: bool = False
    secret_key: str = "dev-only-change-this-secret-before-deployment"
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    refresh_cookie_name: str = "bh_refresh"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    database_url: str = "sqlite:///./data/blueharvest.db"
    upload_dir: str = "./data/uploads"
    max_upload_mb: int = 12
    google_client_id: str | None = None
    demo_mode_enabled: bool = False
    dev_expose_otp: bool = False
    otp_ttl_minutes: int = 10
    otp_max_attempts: int = 5
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_starttls: bool = True
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None

    # Modal-hosted BlueHarvest P2PNet inference. Secrets are read from backend/.env
    # only; never hard-code Modal-Key or Modal-Secret in source code.
    modal_enabled: bool = False
    modal_base_url: str = "https://subodhwalondre87--blueharvest-p2pnet-p2pnetservice-web.modal.run"
    modal_key: str | None = None
    modal_secret: str | None = None
    modal_health_path: str = "/health"
    modal_predict_path: str = "/predict"
    modal_timeout_seconds: float = 90.0
    modal_request_format: str = "multipart"  # multipart | base64_json | raw
    modal_image_field: str = "image"
    modal_count_field: str | None = None  # Optional dotted path, e.g. data.count
    modal_points_field: str | None = None  # Optional dotted path to an explicit list of point predictions

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def modal_is_configured(self) -> bool:
        return bool(
            self.modal_enabled
            and self.modal_base_url.strip()
            and self.modal_key
            and self.modal_secret
        )

    @property
    def normalized_database_url(self) -> str:
        url = self.database_url.strip()
        if url.startswith("postgres://"):
            return "postgresql://" + url[len("postgres://") :]
        return url

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def uploads_path(self) -> Path:
        return Path(self.upload_dir).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

if settings.app_env.lower() in {"production", "prod"}:
    placeholder_markers = ("dev-only-", "replace-this", "change-me", "changeme")
    if len(settings.secret_key) < 32 or any(marker in settings.secret_key.lower() for marker in placeholder_markers):
        raise RuntimeError("Set SECRET_KEY to a unique random value of at least 32 characters before production deployment")
    if settings.cookie_samesite.lower() not in {"lax", "strict", "none"}:
        raise RuntimeError("COOKIE_SAMESITE must be lax, strict, or none")
    if settings.cookie_samesite.lower() == "none" and not settings.cookie_secure:
        raise RuntimeError("COOKIE_SECURE=true is required when COOKIE_SAMESITE=none")
