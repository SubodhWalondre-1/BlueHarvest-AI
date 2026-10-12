from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import auth, count_sessions, dashboard, diagnostics, image_processing, notifications, users
from app.db.session import SessionLocal
from app.services.demo_service import seed_demo_data


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Schema changes are managed exclusively through Alembic migrations.
    # Do not call create_all() here: it can create tables before the Alembic
    # version table exists and make a later `alembic upgrade head` fail.
    settings.uploads_path.mkdir(parents=True, exist_ok=True)
    if settings.demo_mode_enabled and settings.app_env.lower() in {"development", "dev"}:
        db = SessionLocal()
        try:
            seed_demo_data(db)
        finally:
            db.close()
    yield


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
    allow_headers=["Authorization", "Content-Type"],
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
