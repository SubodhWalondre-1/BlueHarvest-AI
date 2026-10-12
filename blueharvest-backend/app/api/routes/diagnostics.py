from pathlib import Path
from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import CountSession, User

router = APIRouter(prefix="/api", tags=["diagnostics"])


@router.get("/diagnostics")
def diagnostics(db: Session = Depends(get_db)):
    database_ok = False
    try:
        db.execute(text("SELECT 1"))
        database_ok = True
    except Exception:
        database_ok = False
    uploads = settings.uploads_path
    try:
        uploads.mkdir(parents=True, exist_ok=True)
        upload_writable = uploads.is_dir()
    except OSError:
        upload_writable = False
    modal_configured = settings.modal_is_configured
    all_core_ok = database_ok and upload_writable
    return {
        "status": "ok" if all_core_ok else "degraded",
        "service": settings.app_name,
        "environment": settings.app_env,
        "database": {
            "status": "ok" if database_ok else "error",
            "engine": "postgresql" if "postgres" in settings.normalized_database_url else ("sqlite" if settings.normalized_database_url.startswith("sqlite") else "configured"),
        },
        "image_processing": {
            "status": "configured" if modal_configured else "unavailable",
            "reason": None if modal_configured else "model_not_configured",
        },
        "model": {
            "provider": "modal",
            "configured": modal_configured,
            "available": None if modal_configured else False,  # Reachability is checked by authenticated GET /api/model/health.
            "message": "Modal credentials are configured; use GET /api/model/health to check live reachability." if modal_configured else "Set MODAL_ENABLED, MODAL_KEY, and MODAL_SECRET to enable the real P2PNet inference service.",
        },
        "storage": {"status": "ok" if upload_writable else "error", "upload_directory_ready": upload_writable},
        "providers": {
            "google_oauth_configured": bool(settings.google_client_id),
            "email_delivery_configured": bool(settings.smtp_host and settings.smtp_from_email),
            "sms_delivery_configured": bool(settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number),
        },
        "demo_mode": {"enabled": settings.demo_mode_enabled, "label": "DEMO DATA — SAMPLE ONLY" if settings.demo_mode_enabled else None},
    }


@router.get("/demo/status")
def demo_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    has_demo_records = db.scalar(select(CountSession.id).where(
        CountSession.user_id == user.id,
        CountSession.is_demo.is_(True),
    ).limit(1)) is not None
    show_demo_mode = settings.demo_mode_enabled and has_demo_records
    return {
        "enabled": show_demo_mode,
        "has_demo_records": has_demo_records,
        "label": "DEMO DATA — SAMPLE ONLY" if show_demo_mode else None,
        "warning": "Demo records are illustrative only and must not be treated as real measurements or AI results." if show_demo_mode else None,
    }
