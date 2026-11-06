import asyncio
from email import policy
from email.parser import BytesParser
from io import BytesIO
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi import HTTPException
from PIL import Image
from sqlalchemy import select

from app.api.routes import image_processing
from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models import CountSession, InferenceJob, UploadedImage
from app.services import inference_resource_service, storage_service


@pytest.fixture()
def storage(client, monkeypatch):
    monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
    monkeypatch.setattr(settings, "cloudinary_api_key", "test-key")
    monkeypatch.setattr(settings, "cloudinary_api_secret", "test-secret")
    assets, calls = {}, []
    original_async, original_sync = httpx.AsyncClient, httpx.Client

    def handle(request):
        calls.append(request)
        assert request.url.host == "api.cloudinary.com"
        assert request.headers["authorization"].startswith("Basic ")
        if request.url.path.endswith("/upload"):
            message = BytesParser(policy=policy.default).parsebytes(
                f"Content-Type: {request.headers['content-type']}\r\n\r\n".encode() + request.content)
            parts = {part.get_param("name", header="content-disposition"): part for part in message.iter_parts()}
            assert parts["type"].get_content() == "authenticated"
            public_id = parts["public_id"].get_content()
            assets[public_id] = parts["file"].get_payload(decode=True)
            return httpx.Response(200, json={"asset_id": public_id, "public_id": public_id, "type": "authenticated"})
        if request.url.path.endswith("/asset/download"):
            content = assets.get(request.url.params["asset_id"])
            return httpx.Response(200, content=content) if content else httpx.Response(404)
        if request.url.path.endswith("/destroy"):
            fields = parse_qs(request.content.decode())
            assert fields["type"] == ["authenticated"] and fields["invalidate"] == ["true"]
            content = assets.pop(fields["public_id"][0], None)
            return httpx.Response(200, json={"result": "ok" if content else "not found"})
        if request.url.path.endswith("/rename"):
            fields = parse_qs(request.content.decode())
            public_id = fields["from_public_id"][0]
            assert fields["to_public_id"] == [public_id]
            assert fields["to_type"] == ["authenticated"] and fields["invalidate"] == ["true"]
            return httpx.Response(200, json={"asset_id": public_id, "public_id": public_id, "type": "authenticated"})
        raise AssertionError(f"Unexpected storage operation: {request.url.path}")

    transport = httpx.MockTransport(handle)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_async(**kwargs, transport=transport))
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: original_sync(**kwargs, transport=transport))

    async def count(*_args):
        return {"final_fish_count": 17, "final_count": 17, "stats": {}}

    monkeypatch.setattr(image_processing, "count_fish_image", count)
    data = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(data, format="PNG")
    return {"assets": assets, "calls": calls, "image": data.getvalue()}


def upload(client, registered, storage):
    return client.post("/api/image-processing", headers={"Authorization": f"Bearer {registered['token']}"},
                       files={"image": ("fish.png", storage["image"], "image/png")})


def test_cloud_image_is_private_durable_and_deleted_with_its_session(client, registered, storage):
    response = upload(client, registered, storage)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["image_url"].startswith("/api/uploads/")
    assert "cloudinary.com" not in response.text
    assert client.get(result["image_url"]).status_code == 401
    headers = {"Authorization": f"Bearer {registered['token']}"}
    assert not list(settings.uploads_path.iterdir())
    downloaded = client.get(result["image_url"], headers=headers)
    assert downloaded.status_code == 200 and downloaded.content == storage["image"]
    assert downloaded.headers["cache-control"] == "private, no-store"
    assert client.post("/api/count-sessions", headers=headers, json={"session_id": result["session_id"]}).status_code == 200
    assert client.delete(f"/api/count-sessions/{result['session_id']}", headers=headers).status_code == 204
    assert not storage["assets"]
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        assert db.scalar(select(UploadedImage)) is None
        assert db.scalar(select(CountSession)) is None
    finally:
        provider.close()


def test_failed_inference_removes_the_remote_asset(client, registered, storage, monkeypatch):
    async def fail(*_args):
        raise HTTPException(status_code=502, detail="Inference failed")

    monkeypatch.setattr(image_processing, "count_fish_image", fail)
    assert upload(client, registered, storage).status_code == 502
    assert not storage["assets"]


def test_other_account_cannot_trigger_remote_download(client, registered, storage):
    result = upload(client, registered, storage).json()
    other = client.post("/api/auth/signup", json={"full_name": "Other Owner", "username": "other_storage",
        "email": "other-storage@example.com", "pond_location": "Other Pond", "password": "OtherPassword!123"}).json()
    previous = len(storage["calls"])
    assert client.get(result["image_url"], headers={"Authorization": f"Bearer {other['access_token']}"}).status_code == 404
    assert len(storage["calls"]) == previous


def test_failed_remote_delete_retains_quota_until_retry(client, registered, storage, monkeypatch):
    result = upload(client, registered, storage).json()
    original = inference_resource_service.delete_stored_image

    def fail(*_args):
        raise OSError("Storage temporarily unavailable")

    monkeypatch.setattr(inference_resource_service, "delete_stored_image", fail)
    headers = {"Authorization": f"Bearer {registered['token']}"}
    assert client.delete(f"/api/count-sessions/{result['session_id']}", headers=headers).status_code == 204
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        image = db.scalar(select(UploadedImage))
        assert image.cleanup_pending and image.size_bytes == len(storage["image"])
        monkeypatch.setattr(inference_resource_service, "delete_stored_image", original)
        inference_resource_service.cleanup_pending_images(db, registered["user"]["id"])
        assert db.scalar(select(UploadedImage)) is None and not storage["assets"]
    finally:
        provider.close()


def test_production_requires_durable_storage_instead_of_silent_fallback(client, registered, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "upload_storage_persistent", False)
    with pytest.raises(HTTPException) as rejected:
        storage_service.storage_provider()
    assert rejected.value.status_code == 503
    assert client.get("/api/diagnostics").json()["storage"]["status"] == "error"
    monkeypatch.setattr(settings, "upload_storage_persistent", True)
    assert storage_service.storage_provider() == "local"


def test_interrupted_remote_upload_keeps_a_cleanup_reservation(client, registered, storage, monkeypatch):
    async def fail(*_args):
        raise storage_service.storage_error()

    monkeypatch.setattr(image_processing, "upload_image_to_storage", fail)
    assert upload(client, registered, storage).status_code == 503
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        job = db.scalar(select(InferenceJob))
        assert job is not None and job.storage_provider == "cloudinary"
        assert db.scalar(select(CountSession)) is None
    finally:
        provider.close()


def test_legacy_asset_is_converted_without_changing_its_private_route(client, registered, storage):
    filename = f"{'a' * 32}.png"
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        db.add(UploadedImage(filename=filename, user_id=registered["user"]["id"], media_type="image/png",
                             storage_provider="cloudinary_legacy", size_bytes=len(storage["image"])))
        db.commit()
        asyncio.run(storage_service.secure_legacy_images(db))
        image = db.get(UploadedImage, filename)
        assert image.storage_provider == "cloudinary"
        assert image.storage_asset_id == f"blueharvest/uploads/{'a' * 32}"
        storage["assets"][image.storage_asset_id] = storage["image"]
        response = client.get(f"/api/uploads/{filename}", headers={"Authorization": f"Bearer {registered['token']}"})
        assert response.status_code == 200 and response.content == storage["image"]
    finally:
        provider.close()


def test_cloudinary_url_credentials_are_decoded_without_a_global_sdk_config(client, monkeypatch):
    monkeypatch.setattr(settings, "cloudinary_url", "cloudinary://test-key:test%2Fsecret@test-cloud")
    assert storage_service._credentials() == ("https://api.cloudinary.com/v1_1/test-cloud", ("test-key", "test/secret"))
    monkeypatch.setattr(settings, "cloudinary_url", "https://untrusted.example")
    with pytest.raises(HTTPException) as rejected:
        storage_service.storage_provider()
    assert rejected.value.status_code == 503
