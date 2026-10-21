import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app import models as _models  # noqa: F401 - register SQLAlchemy models before test schema creation
from app.core.config import settings


@pytest.fixture()
def client(monkeypatch, tmp_path):
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False)
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # Keep tests independent of local credentials and uploaded files.
    monkeypatch.setattr(settings, "app_env", "test")
    monkeypatch.setattr(settings, "dev_expose_otp", True)
    monkeypatch.setattr(settings, "modal_enabled", False)
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


@pytest.fixture()
def registered(client):
    response = client.post("/api/auth/signup", json={
        "full_name": "Test Hatchery Operator",
        "username": "operator_test",
        "email": "operator@example.com",
        "phone": "+919876543210",
        "pond_location": "Test Pond A",
        "password": "SafeTestPass!123",
    })
    assert response.status_code == 201, response.text
    body = response.json()
    return {"user": body["user"], "token": body["access_token"]}
