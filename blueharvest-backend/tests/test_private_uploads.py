from io import BytesIO
from urllib.parse import quote

import pytest
from fastapi import HTTPException
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes import image_processing
from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models import CountSession, UploadedImage, User


@pytest.fixture()
def sample_image():
    data = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(data, format="PNG")
    return data.getvalue()


@pytest.fixture()
def inference(monkeypatch):
    async def count(*_args):
        return {"final_count": 17, "final_fish_count": 17, "method": "P2PNet", "stats": {}}

    monkeypatch.setattr(image_processing, "count_fish_image", count)


@pytest.fixture()
def uploaded(client, registered, inference, sample_image):
    headers = {"Authorization": f"Bearer {registered['token']}"}
    response = client.post("/api/image-processing", headers=headers, files={"image": ("sample.png", sample_image, "image/png")})
    assert response.status_code == 200, response.text
    return {"url": response.json()["image_url"], "headers": headers, "user_id": registered["user"]["id"], "bytes": sample_image}


def other_user(client):
    response = client.post("/api/auth/signup", json={
        "full_name": "Other Operator", "username": "other_image_operator", "email": "other-image@example.com",
        "pond_location": "Other Pond", "password": "OtherPassword!123",
    })
    assert response.status_code == 201, response.text
    return response.json()


def test_uploaded_image_requires_bearer_authentication(client, uploaded):
    assert client.get(uploaded["url"]).status_code == 401
    assert client.get(uploaded["url"], params={"access_token": uploaded["headers"]["Authorization"]}).status_code == 401


def test_other_user_cannot_download_uploaded_image(client, uploaded):
    other = other_user(client)
    headers = {"Authorization": f"Bearer {other['access_token']}"}
    response = client.get(uploaded["url"], headers=headers)
    unknown = client.get(f"/api/uploads/{'f' * 32}.png", headers=headers)
    assert response.status_code == unknown.status_code == 404
    assert response.json() == unknown.json()


def test_owner_can_download_original_image_without_public_caching(client, uploaded):
    response = client.get(uploaded["url"], headers=uploaded["headers"])
    assert response.status_code == 200
    assert response.content == uploaded["bytes"]
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "private, no-store"
    assert "authorization" in {value.strip().lower() for value in response.headers["vary"].split(",")}
    assert response.headers["x-content-type-options"] == "nosniff"


def test_upload_owner_and_validated_media_type_are_persisted(client, uploaded):
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        stored = db.get(UploadedImage, uploaded["url"].rsplit("/", 1)[1])
        assert stored.user_id == uploaded["user_id"]
        assert stored.media_type == "image/png"
    finally:
        provider.close()


def test_client_supplied_user_id_cannot_change_upload_owner(client, registered, inference, sample_image):
    other = other_user(client)
    owner_headers = {"Authorization": f"Bearer {registered['token']}"}
    response = client.post(
        "/api/image-processing", headers=owner_headers, data={"user_id": other["user"]["id"]},
        files={"image": ("sample.png", sample_image, "image/png")},
    )
    assert response.status_code == 200
    url = response.json()["image_url"]
    assert client.get(url, headers=owner_headers).status_code == 200
    assert client.get(url, headers={"Authorization": f"Bearer {other['access_token']}"}).status_code == 404


def test_forged_ledger_image_path_does_not_grant_ownership(client, uploaded):
    other = other_user(client)
    headers = {"Authorization": f"Bearer {other['access_token']}"}
    created = client.post("/api/count-sessions", headers=headers, json={"count": 17, "image_path": uploaded["url"]})
    assert created.status_code == 422
    assert client.get(uploaded["url"], headers=headers).status_code == 404
    assert client.get(uploaded["url"], headers=uploaded["headers"]).status_code == 200


def test_untracked_legacy_image_is_not_assigned_from_ledger_paths(client, registered, sample_image):
    filename = f"{'a' * 32}.png"
    (settings.uploads_path / filename).write_bytes(sample_image)
    url = f"/api/uploads/{filename}"
    headers = {"Authorization": f"Bearer {registered['token']}"}
    from uuid import uuid4

    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        db.add(CountSession(id=str(uuid4()), batch_code="BAT-LEGACY-IMAGE", user_id=registered["user"]["id"], count=17, image_path=url))
        db.commit()
    finally:
        provider.close()
    assert client.get(url, headers=headers).status_code == 404


def test_failed_inference_removes_file_and_does_not_create_ownership(client, registered, sample_image, monkeypatch):
    async def failed_count(*_args):
        raise HTTPException(status_code=502, detail={"code": "inference_failed", "message": "Simulated inference failure"})

    monkeypatch.setattr(image_processing, "count_fish_image", failed_count)
    response = client.post(
        "/api/image-processing", headers={"Authorization": f"Bearer {registered['token']}"},
        files={"image": ("sample.png", sample_image, "image/png")},
    )
    assert response.status_code == 502
    assert not list(settings.uploads_path.iterdir())
    provider = app.dependency_overrides[get_db]()
    try:
        assert next(provider).scalar(select(UploadedImage)) is None
    finally:
        provider.close()


def test_failed_ownership_commit_removes_file(client, registered, inference, sample_image, monkeypatch):
    original_commit = Session.commit

    def failed_commit(db):
        if any(isinstance(item, UploadedImage) for item in db.new):
            db.flush()
            raise RuntimeError("Simulated ownership commit failure")
        original_commit(db)

    monkeypatch.setattr(Session, "commit", failed_commit)
    with pytest.raises(RuntimeError, match="ownership commit failure"):
        client.post(
            "/api/image-processing", headers={"Authorization": f"Bearer {registered['token']}"},
            files={"image": ("sample.png", sample_image, "image/png")},
        )
    assert not list(settings.uploads_path.iterdir())
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        assert db.scalar(select(UploadedImage)) is None
        assert db.scalar(select(CountSession)) is None
    finally:
        provider.close()


def test_revoked_session_cannot_download_previously_uploaded_image(client, uploaded):
    assert client.post("/api/auth/logout", headers={"Origin": settings.allowed_origins[0], "X-CSRF-Protection": "1"}).status_code == 200
    assert client.get(uploaded["url"], headers=uploaded["headers"]).status_code == 401


def test_disabled_user_cannot_download_uploaded_image(client, uploaded):
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        db.get(User, uploaded["user_id"]).is_active = False
        db.commit()
    finally:
        provider.close()
    assert client.get(uploaded["url"], headers=uploaded["headers"]).status_code == 401


def test_missing_file_returns_not_found(client, uploaded):
    (settings.uploads_path / uploaded["url"].rsplit("/", 1)[1]).unlink()
    assert client.get(uploaded["url"], headers=uploaded["headers"]).status_code == 404


def test_range_requests_also_require_owner_authentication(client, uploaded):
    response = client.get(uploaded["url"], headers={**uploaded["headers"], "Range": "bytes=0-7"})
    assert response.status_code == 206 and response.content == uploaded["bytes"][:8]
    assert client.get(uploaded["url"], headers={"Range": "bytes=0-7"}).status_code == 401


@pytest.mark.parametrize("filename", ["..\\outside.png", "..%2foutside.png", "image.png:stream", f"{'a' * 32}.png.extra"])
def test_invalid_filenames_cannot_escape_upload_storage(client, registered, filename):
    response = client.get(f"/api/uploads/{quote(filename, safe='')}", headers={"Authorization": f"Bearer {registered['token']}"})
    assert response.status_code == 404


def test_symlinks_cannot_serve_files_outside_upload_storage(client, uploaded, tmp_path):
    path = settings.uploads_path / uploaded["url"].rsplit("/", 1)[1]
    outside = tmp_path / "outside.png"
    outside.write_bytes(uploaded["bytes"])
    path.unlink()
    try:
        path.symlink_to(outside)
    except OSError:
        pytest.skip("Creating symlinks requires privileges on this Windows host")
    assert client.get(uploaded["url"], headers=uploaded["headers"]).status_code == 404


@pytest.mark.parametrize("image_format,media_type", [
    ("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp"),
    ("BMP", "image/bmp"), ("TIFF", "image/tiff"),
])
def test_download_media_type_comes_from_validated_image_content(client, registered, inference, image_format, media_type):
    data = BytesIO()
    Image.new("RGB", (8, 8), "white").save(data, format=image_format)
    headers = {"Authorization": f"Bearer {registered['token']}"}
    response = client.post(
        "/api/image-processing", headers=headers,
        files={"image": ("untrusted-name.png", data.getvalue(), "image/png")},
    )
    assert response.status_code == 200, response.text
    downloaded = client.get(response.json()["image_url"], headers=headers)
    assert downloaded.status_code == 200 and downloaded.content == data.getvalue()
    assert downloaded.headers["content-type"] == media_type
