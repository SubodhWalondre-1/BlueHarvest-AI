from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import auth, count_sessions, dashboard, diagnostics, image_processing, notifications, users
from app.api.deps import CSRF_HEADER
from app.db.session import SessionLocal
from app.services.demo_service import seed_demo_data
from app.services.inference_resource_service import cleanup_expired_inference_jobs
from app.services.storage_service import secure_legacy_images
from starlette.concurrency import run_in_threadpool


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Schema changes are managed exclusively through Alembic migrations.
    # Do not call create_all() here: it can create tables before the Alembic
    # version table exists and make a later `alembic upgrade head` fail.
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", CSRF_HEADER],
    expose_headers=["Retry-After"],
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
