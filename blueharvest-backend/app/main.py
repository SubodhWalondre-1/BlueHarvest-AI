from contextlib import asynccontextmanager
import logging
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from app.core.config import settings
from app.api.routes import auth, count_sessions, dashboard, diagnostics, image_processing, notifications, users
from app.api.deps import CSRF_HEADER
from app.db.session import SessionLocal
from app.services.demo_service import seed_demo_data
from app.services.inference_resource_service import cleanup_expired_inference_jobs
from app.services.storage_service import secure_legacy_images
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger("app.main")

import os
import sys

if (
    settings.sentry_dsn
    and settings.app_env.lower() != "test"
    and "pytest" not in sys.modules
    and not os.environ.get("PYTEST_CURRENT_TEST")
):
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        def _scrub_sentry_event(event, hint):
            request = event.get("request", {})
            url = str(request.get("url", ""))
            # Do not forward test client calls or test environment traffic to Sentry
            if "testserver" in url or "pytest" in sys.modules:
                return None

            # Filter out expected HTTP client and feature-disabled exceptions (e.g. 4xx, 503)
            if "exc_info" in hint and hint["exc_info"]:
                _, exc_value, _ = hint["exc_info"]
                if isinstance(exc_value, HTTPException):
                    if exc_value.status_code < 500 or exc_value.status_code == 503:
                        return None
                exc_name = type(exc_value).__name__
                if exc_name in ("GoogleCredentialError",):
                    return None

            headers = request.get("headers", {})
            for key in list(headers.keys()):
                if key.lower() in {"authorization", "cookie", "set-cookie", "x-csrf-token"}:
                    headers[key] = "[REDACTED]"
            data = request.get("data")
            if isinstance(data, dict):
                for k in ["password", "token", "file", "credential", "otp"]:
                    if k in data:
                        data[k] = "[REDACTED]"
            return event

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            integrations=[FastApiIntegration(), SqlalchemyIntegration()],
            traces_sample_rate=0.2,
            send_default_pii=False,
            before_send=_scrub_sentry_event,
            environment=settings.app_env,
        )
    except Exception:
        pass


class ServerErrorCatcherMiddleware:
    """Catches unhandled server exceptions inside the CORS boundary, logs them,
    captures to Sentry (if configured), and returns a clean 500 JSON response with CORS headers.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_wrapper(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            logger.exception("Unhandled server error: %s", exc)
            if (
                settings.sentry_dsn
                and "pytest" not in sys.modules
                and not os.environ.get("PYTEST_CURRENT_TEST")
            ):
                try:
                    import sentry_sdk
                    sentry_sdk.capture_exception(exc)
                except Exception:
                    pass
            if not response_started:
                response = JSONResponse(
                    status_code=500,
                    content={"code": "internal_error", "message": "An unexpected server error occurred."},
                )
                await response(scope, receive, send)
            raise exc


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Schema changes are managed exclusively through Alembic migrations.
    # Do not call create_all() here: it can create tables before the Alembic
    # version table exists and make a later `alembic upgrade head` fail.
    logger.info("CORS effective allowed origins: %s", settings.allowed_origins)
    _app.state.http_client = httpx.AsyncClient(
        timeout=settings.modal_timeout_seconds,
        limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
        follow_redirects=False,
    )
    try:
        if not settings.cloudinary_is_configured:
            settings.uploads_path.mkdir(parents=True, exist_ok=True)
        if settings.app_env.lower() != "test":
            with SessionLocal() as db:
                await secure_legacy_images(db)
                await run_in_threadpool(cleanup_expired_inference_jobs, db)
        if settings.demo_mode_enabled:
            db = SessionLocal()
            try:
                seed_demo_data(db)
            finally:
                db.close()
        yield
    finally:
        await _app.state.http_client.aclose()
        if hasattr(_app.state, "http_client"):
            delattr(_app.state, "http_client")


app = FastAPI(
    title=settings.app_name,
    description="BlueHarvest AI API. Authenticated fish-counting inference uses the configured Modal P2PNet service; no synthetic counts are generated.",
    version="0.1.0",
    lifespan=lifespan,
)

# Inner middleware: Catches unhandled exceptions inside the CORS boundary
app.add_middleware(ServerErrorCatcherMiddleware)

# Outermost middleware: Handles CORS and preflight OPTIONS requests before any inner layer
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", CSRF_HEADER],
    expose_headers=["Retry-After"],
    max_age=600,
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(image_processing.router)
app.include_router(count_sessions.router)
app.include_router(dashboard.router)
app.include_router(notifications.router)
app.include_router(diagnostics.router)


@app.get("/")
def root():
    return {"service": settings.app_name, "status": "running", "docs": "/docs"}

