from datetime import timedelta
from io import BytesIO
from PIL import Image
import pytest

from app.core.config import settings
from app.core.time import utcnow_naive
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.base import Base
from app.models import CountSession, UploadedImage, User


@pytest.fixture()
def resource_db(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{(tmp_path / 'resources.db').as_posix()}", connect_args={"check_same_thread": False, "timeout": 15})
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setattr(settings, "upload_dir", str(upload_dir))
    with sessions() as db:
        for index in (1, 2):
            db.add(User(id=f"resource-user-{index}", username=f"resource_{index}", full_name="Resource Operator", email=f"resource{index}@example.com"))
        db.commit()
    yield sessions
    engine.dispose()

from app.services import inference_resource_service as resources
from app.api.routes import image_processing
from app.db.session import get_db


def test_zero_loss_policy_preserves_image_on_session_deletion(client, registered, monkeypatch):
    """When retain_all_uploads is enabled, deleting a session hides it from the ledger

    but NEVER deletes the underlying uploaded image from storage.
    """
    monkeypatch.setattr(settings, "retain_all_uploads", True)

    async def mock_count(*_args):
        return {"final_fish_count": 42, "final_count": 42, "stats": {}}

    monkeypatch.setattr(image_processing, "count_fish_image", mock_count)

    image = BytesIO()
    Image.new("RGB", (10, 10), "green").save(image, format="JPEG")
    token_headers = {"Authorization": f"Bearer {registered['token']}"}

    upload_res = client.post(
        "/api/image-processing",
        headers=token_headers,
        files={"image": ("pond_sample.jpg", image.getvalue(), "image/jpeg")}
    )
    assert upload_res.status_code == 200
    session_data = upload_res.json()
    image_url = session_data["image_url"]
    session_id = session_data["session_id"]

    # Image is accessible
    assert client.get(image_url, headers=token_headers).status_code == 200

    # User saves session to ledger
    save_res = client.post("/api/count-sessions", headers=token_headers, json={"session_id": session_id})
    assert save_res.status_code == 200

    # User deletes the session from their ledger
    del_res = client.delete(f"/api/count-sessions/{session_id}", headers=token_headers)
    assert del_res.status_code == 204

    # VERIFY ZERO-LOSS: The image is STILL safely accessible and not deleted!
    img_after = client.get(image_url, headers=token_headers)
    assert img_after.status_code == 200
    assert len(img_after.content) > 0


def test_zero_loss_policy_preserves_previews(resource_db, monkeypatch):
    """When retain_all_uploads is enabled, stale previews are never deleted."""
    monkeypatch.setattr(settings, "retain_all_uploads", True)
    old = utcnow_naive() - timedelta(hours=settings.inference_preview_ttl_hours + 10)

    with resource_db() as db:
        filename = "permanent_preview_image.png"
        (settings.uploads_path / filename).write_bytes(b"audit_image_content")
        db.add(UploadedImage(filename=filename, user_id="user-durability", media_type="image/png", size_bytes=19))
        db.add(CountSession(
            id="audit-preview-1",
            batch_code="BAT-AUDIT-1",
            user_id="user-durability",
            count=88,
            is_saved=False,
            inference_verified=True,
            image_path=f"/api/uploads/{filename}",
            created_at=old
        ))
        db.commit()

        # Run background cleanup
        resources.cleanup_expired_inference_jobs(db)

        # Confirm session and image were NOT deleted
        assert db.get(CountSession, "audit-preview-1") is not None
        assert db.get(UploadedImage, filename) is not None
        assert (settings.uploads_path / filename).exists()
