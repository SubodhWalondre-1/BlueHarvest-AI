import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException, Request, UploadFile
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.api.routes import image_processing
from app.core.config import Settings, settings
from app.core.time import utcnow_naive
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import CountSession, InferenceJob, RateLimitBucket, UploadedImage, User
from app.services import inference_resource_service as resources
from app.services.image_validation import read_and_validate_image


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


def request():
    return Request({"type": "http", "client": ("198.51.100.1", 1234), "headers": []})


def reserve(db, user_id="resource-user-1", size=100):
    job_id = str(uuid4())
    filename = f"{uuid4().hex}.png"
    resources.reserve_inference_job(db, request(), user_id, job_id, filename, size)
    return job_id, filename


@pytest.fixture()
def image_bytes():
    data = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(data, format="PNG")
    return data.getvalue()


def upload(client, registered, data):
    return client.post("/api/image-processing", headers={"Authorization": f"Bearer {registered['token']}"},
                       files={"image": ("sample.png", data, "image/png")})


def assert_http_cleanup():
    assert not list(settings.uploads_path.iterdir())
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        assert db.scalar(select(InferenceJob)) is None
        assert db.scalar(select(UploadedImage)) is None
        assert db.scalar(select(CountSession)) is None
    finally:
        provider.close()


def test_shared_admission_enforces_global_and_per_user_concurrency(resource_db, monkeypatch):
    monkeypatch.setattr(settings, "inference_max_concurrent", 3)
    monkeypatch.setattr(settings, "inference_user_max_concurrent", 2)
    barrier = Barrier(8)

    def compete(index):
        with resource_db() as db:
            barrier.wait(timeout=10)
            try:
                reserve(db, f"resource-user-{index % 2 + 1}")
                return 200
            except HTTPException as exc:
                assert exc.detail["code"] == "inference_busy"
                assert int(exc.headers["Retry-After"]) > 0
                return exc.status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(compete, range(8)))
    assert results.count(200) == 3 and results.count(429) == 5
    with resource_db() as db:
        jobs = list(db.scalars(select(InferenceJob)))
        assert len(jobs) == 3
        assert all(sum(job.user_id == user_id for job in jobs) <= 2 for user_id in {job.user_id for job in jobs})
        assert sum(bucket.request_count for bucket in db.scalars(select(RateLimitBucket))) == 3


def test_daily_quota_is_shared_and_failed_jobs_do_not_refund_provider_attempts(resource_db, monkeypatch):
    monkeypatch.setattr(settings, "inference_daily_limit", 2)
    with resource_db() as db:
        for _ in range(2):
            job_id, filename = reserve(db)
            resources.abandon_inference_job(db, job_id, filename)
        with pytest.raises(HTTPException) as rejected:
            reserve(db)
        assert rejected.value.status_code == 429
        assert db.scalar(select(InferenceJob)) is None
        for bucket in db.scalars(select(RateLimitBucket)):
            bucket.expires_at = utcnow_naive() - timedelta(seconds=1)
        db.commit()
        reserve(db)
        assert db.scalar(select(RateLimitBucket)).request_count == 1


def test_in_flight_bytes_reserve_storage_before_files_are_written(resource_db, monkeypatch):
    monkeypatch.setattr(settings, "inference_user_max_concurrent", 2)
    monkeypatch.setattr(settings, "upload_user_quota_mb", 1)
    with resource_db() as db:
        reserve(db, size=512 * 1024)
        with pytest.raises(HTTPException) as rejected:
            reserve(db, size=512 * 1024 + 1)
        assert rejected.value.status_code == 413 and rejected.value.detail["code"] == "upload_quota_exceeded"
        assert len(list(db.scalars(select(InferenceJob)))) == 1
        assert db.scalar(select(RateLimitBucket)).request_count == 1


def test_owned_legacy_file_sizes_are_backfilled_without_claiming_untracked_files(resource_db, monkeypatch):
    monkeypatch.setattr(settings, "upload_user_quota_mb", 1)
    filename = f"{'a' * 32}.png"
    (settings.uploads_path / filename).write_bytes(b"x" * (1024 * 1024))
    untracked = settings.uploads_path / f"{'b' * 32}.png"
    untracked.write_bytes(b"legacy")
    with resource_db() as db:
        db.add(UploadedImage(filename=filename, user_id="resource-user-1", media_type="image/png"))
        db.commit()
        with pytest.raises(HTTPException) as rejected:
            reserve(db)
        assert rejected.value.status_code == 413
        assert db.get(UploadedImage, filename).size_bytes == 1024 * 1024
        assert db.get(UploadedImage, untracked.name) is None and untracked.read_bytes() == b"legacy"


def test_expired_job_cleanup_removes_only_tracked_incomplete_files(resource_db):
    abandoned = f"{'a' * 32}.png"
    completed = f"{'b' * 32}.png"
    legacy = f"{'c' * 32}.png"
    for filename in (abandoned, completed, legacy):
        (settings.uploads_path / filename).write_bytes(b"image")
    with resource_db() as db:
        for filename in (abandoned, completed):
            db.add(InferenceJob(id=str(uuid4()), filename=filename, user_id="resource-user-1", size_bytes=5,
                                expires_at=utcnow_naive() - timedelta(seconds=1)))
        db.add(UploadedImage(filename=completed, user_id="resource-user-1", size_bytes=5, media_type="image/png"))
        db.commit()
        resources.cleanup_expired_inference_jobs(db)
        assert db.scalar(select(InferenceJob)) is None
        assert not (settings.uploads_path / abandoned).exists()
        assert (settings.uploads_path / completed).read_bytes() == b"image"
        assert (settings.uploads_path / legacy).read_bytes() == b"image"


def test_absolute_inference_timeout_cleans_up_and_releases_slot(client, registered, image_bytes, monkeypatch):
    monkeypatch.setattr(settings, "modal_timeout_seconds", 0.02)

    async def never_complete(*_args):
        await asyncio.Event().wait()

    monkeypatch.setattr(image_processing, "count_fish_image", never_complete)
    response = upload(client, registered, image_bytes)
    assert response.status_code == 504 and response.json()["detail"]["code"] == "model_inference_timeout"
    assert_http_cleanup()


def test_cancellation_cleans_up_files_and_capacity(resource_db, image_bytes, monkeypatch):
    async def exercise(db):
        started = asyncio.Event()

        async def never_complete(*_args):
            started.set()
            await asyncio.Event().wait()

        monkeypatch.setattr(image_processing, "count_fish_image", never_complete)
        user = db.get(User, "resource-user-1")
        file = UploadFile(BytesIO(image_bytes), filename="sample.png")
        operation = asyncio.create_task(image_processing.image_processing(request(), file, user, db))
        await started.wait()
        operation.cancel()
        with pytest.raises(asyncio.CancelledError):
            await operation

    with resource_db() as db:
        asyncio.run(exercise(db))
        assert db.scalar(select(InferenceJob)) is None
        assert db.scalar(select(UploadedImage)) is None
        assert not list(settings.uploads_path.iterdir())


def test_partial_file_write_failure_cleans_up(client, registered, image_bytes, monkeypatch):
    from pathlib import Path

    original = Path.write_bytes

    def fail(path, data):
        original(path, data[:4])
        raise OSError("Simulated disk write failure")

    monkeypatch.setattr(Path, "write_bytes", fail)
    with pytest.raises(OSError, match="disk write failure"):
        upload(client, registered, image_bytes)
    assert_http_cleanup()


def test_deleting_session_releases_its_owned_image_storage(client, registered, image_bytes, monkeypatch):
    async def count(*_args):
        return {"final_fish_count": 17, "final_count": 17, "stats": {}}

    monkeypatch.setattr(image_processing, "count_fish_image", count)
    result = upload(client, registered, image_bytes).json()
    token_headers = {"Authorization": f"Bearer {registered['token']}"}
    assert client.delete(f"/api/count-sessions/{result['session_id']}", headers=token_headers).status_code == 204
    assert client.get(result["image_url"], headers=token_headers).status_code == 404
    assert_http_cleanup()


def test_failed_upload_read_always_closes_the_upload():
    class BrokenUpload:
        filename = "sample.png"
        content_type = "image/png"
        closed = False

        async def read(self, _size):
            raise RuntimeError("Simulated upload read failure")

        async def close(self):
            self.closed = True

    file = BrokenUpload()
    with pytest.raises(RuntimeError, match="upload read failure"):
        asyncio.run(read_and_validate_image(file))
    assert file.closed


def test_provider_failure_releases_capacity_for_the_next_request(client, registered, image_bytes):
    for _ in range(2):
        assert upload(client, registered, image_bytes).status_code == 503
        assert_http_cleanup()


def test_failed_post_delete_file_cleanup_is_retried_from_persisted_metadata(client, registered, image_bytes, monkeypatch):
    from pathlib import Path

    async def count(*_args):
        return {"final_fish_count": 17, "final_count": 17, "stats": {}}

    monkeypatch.setattr(image_processing, "count_fish_image", count)
    result = upload(client, registered, image_bytes).json()
    filename = result["image_url"].rsplit("/", 1)[1]
    original = Path.unlink

    def fail(path, *args, **kwargs):
        if path.name == filename:
            raise PermissionError("Simulated temporary file lock")
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", fail)
    response = client.delete(f"/api/count-sessions/{result['session_id']}", headers={"Authorization": f"Bearer {registered['token']}"})
    assert response.status_code == 204
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        assert db.get(CountSession, result["session_id"]) is None
        assert db.get(UploadedImage, filename).cleanup_pending is True
        monkeypatch.setattr(Path, "unlink", original)
        resources.cleanup_expired_inference_jobs(db)
        assert db.get(UploadedImage, filename) is None
    finally:
        provider.close()
    assert_http_cleanup()


def test_legacy_foreign_image_path_cannot_delete_another_users_image(client, registered, image_bytes, monkeypatch):
    async def count(*_args):
        return {"final_fish_count": 17, "final_count": 17, "stats": {}}

    monkeypatch.setattr(image_processing, "count_fish_image", count)
    result = upload(client, registered, image_bytes).json()
    other = client.post("/api/auth/signup", json={"full_name": "Other Operator", "username": "other_delete",
        "email": "other-delete@example.com", "pond_location": "Other Pond", "password": "OtherPassword!123"}).json()
    forged_id = str(uuid4())
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        db.add(CountSession(id=forged_id, batch_code="BAT-FORGED-LEGACY", user_id=other["user"]["id"], count=999999, image_path=result["image_url"]))
        db.commit()
    finally:
        provider.close()
    assert client.delete(f"/api/count-sessions/{forged_id}", headers={"Authorization": f"Bearer {other['access_token']}"}).status_code == 204
    assert client.get(result["image_url"], headers={"Authorization": f"Bearer {registered['token']}"}).content == image_bytes


def test_expired_reservation_cannot_commit_a_result(resource_db):
    with resource_db() as db:
        job_id, _filename = reserve(db)
        db.get(InferenceJob, job_id).expires_at = utcnow_naive() - timedelta(seconds=1)
        db.commit()
        with pytest.raises(HTTPException) as rejected:
            resources.lock_inference_job(db, job_id)
        assert rejected.value.status_code == 503


@pytest.mark.parametrize("field", ["inference_max_concurrent", "inference_user_max_concurrent", "inference_daily_limit", "upload_user_quota_mb", "inference_preview_ttl_hours", "modal_timeout_seconds"])
def test_resource_limits_require_positive_values(field):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{field: 0})


def test_stale_previews_expire_without_removing_saved_or_unverified_history(resource_db):
    old = utcnow_naive() - timedelta(hours=settings.inference_preview_ttl_hours + 1)
    with resource_db() as db:
        for index, (saved, verified) in enumerate([(False, True), (True, True), (False, False)], 1):
            filename = f"{index:032x}.png"
            (settings.uploads_path / filename).write_bytes(b"image")
            db.add(UploadedImage(filename=filename, user_id="resource-user-1", media_type="image/png", size_bytes=5))
            db.add(CountSession(id=f"preview-{index}", batch_code=f"BAT-PREVIEW-{index}", user_id="resource-user-1", count=17,
                is_saved=saved, inference_verified=verified, image_path=f"/api/uploads/{filename}", created_at=old))
        db.commit()
        resources.cleanup_expired_inference_jobs(db)
        assert db.get(CountSession, "preview-1") is None
        assert db.get(CountSession, "preview-2") is not None
        assert db.get(CountSession, "preview-3") is not None
        assert not (settings.uploads_path / f"{1:032x}.png").exists()
        assert (settings.uploads_path / f"{2:032x}.png").exists()
        assert (settings.uploads_path / f"{3:032x}.png").exists()
