from datetime import timedelta
from math import ceil
import re

from fastapi import HTTPException, Request
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.time import utcnow_naive
from app.models import CountSession, InferenceCapacity, InferenceJob, UploadedImage
from app.services.rate_limit_service import enforce_rate_limit


def lock_capacity(db: Session) -> None:
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else postgres_insert
    db.execute(insert(InferenceCapacity).values(id=1).on_conflict_do_nothing())
    # Serialize admission and completion across workers without holding a lock during inference.
    db.execute(update(InferenceCapacity).where(InferenceCapacity.id == 1).values(id=1))


def _upload_path(filename: str):
    if not re.fullmatch(r"[a-f0-9]{32}\.(jpg|png|webp|bmp|tiff)", filename):
        raise ValueError("Invalid upload filename.")
    return settings.uploads_path / filename


def _cleanup_expired(db: Session, now) -> None:
    for job in db.scalars(select(InferenceJob).where(InferenceJob.expires_at <= now)):
        if db.get(UploadedImage, job.filename) is None:
            _upload_path(job.filename).unlink(missing_ok=True)
        db.delete(job)
    db.flush()


def cleanup_expired_inference_jobs(db: Session) -> None:
    lock_capacity(db)
    now = utcnow_naive()
    _cleanup_expired(db, now)
    _cleanup_previews(db, now)
    _cleanup_pending_images(db)
    db.commit()


def reserve_inference_job(db: Session, request: Request, user_id: str, job_id: str, filename: str, size_bytes: int) -> None:
    lock_capacity(db)
    now = utcnow_naive()
    _cleanup_expired(db, now)
    _cleanup_previews(db, now, user_id)
    _cleanup_pending_images(db, user_id)
    jobs = list(db.scalars(select(InferenceJob)))
    own_jobs = [job for job in jobs if job.user_id == user_id]
    if len(jobs) >= settings.inference_max_concurrent or len(own_jobs) >= settings.inference_user_max_concurrent:
        blocking = own_jobs if len(own_jobs) >= settings.inference_user_max_concurrent else jobs
        retry_after = max(1, ceil((min(job.expires_at for job in blocking) - now).total_seconds()))
        db.commit()
        raise HTTPException(status_code=429, detail={"code": "inference_busy", "message": "Inference capacity is busy. Retry after the current jobs finish.", "retry_after": retry_after}, headers={"Retry-After": str(retry_after)})
    # Backfill sizes only for files with existing server-recorded ownership.
    for image in db.scalars(select(UploadedImage).where(UploadedImage.user_id == user_id, UploadedImage.size_bytes == 0)):
        path = _upload_path(image.filename)
        if path.is_file() and not path.is_symlink():
            image.size_bytes = path.stat().st_size
    db.flush()
    used_bytes = db.scalar(select(func.coalesce(func.sum(UploadedImage.size_bytes), 0)).where(UploadedImage.user_id == user_id))
    if used_bytes + sum(job.size_bytes for job in own_jobs) + size_bytes > settings.upload_user_quota_mb * 1024 * 1024:
        db.commit()
        raise HTTPException(status_code=413, detail={"code": "upload_quota_exceeded", "message": "Your image storage quota is full. Delete unused ledger records before uploading more images."})
    enforce_rate_limit(db, request, "inference-daily", ip_limit=None, account=user_id,
                       account_limit=settings.inference_daily_limit, window_seconds=86400, commit=False)
    db.add(InferenceJob(id=job_id, user_id=user_id, filename=filename, size_bytes=size_bytes,
                        expires_at=now + timedelta(seconds=settings.modal_timeout_seconds + 30)))
    db.commit()


def lock_inference_job(db: Session, job_id: str) -> InferenceJob:
    lock_capacity(db)
    job = db.scalar(select(InferenceJob).where(InferenceJob.id == job_id, InferenceJob.expires_at > utcnow_naive()))
    if job is None:
        raise HTTPException(status_code=503, detail={"code": "inference_reservation_expired", "message": "Inference reservation expired. Please run the scan again."})
    return job


def abandon_inference_job(db: Session, job_id: str, filename: str) -> None:
    db.rollback()
    _upload_path(filename).unlink(missing_ok=True)
    db.execute(delete(InferenceJob).where(InferenceJob.id == job_id))
    db.commit()


def mark_unused_session_image(db: Session, user_id: str, image_path: str | None) -> None:
    if not image_path or not image_path.startswith("/api/uploads/"):
        return
    filename = image_path.removeprefix("/api/uploads/")
    lock_capacity(db)
    image = db.scalar(select(UploadedImage).where(UploadedImage.filename == filename, UploadedImage.user_id == user_id))
    referenced = db.scalar(select(CountSession.id).where(CountSession.image_path == image_path, CountSession.user_id == user_id).limit(1))
    if image is not None and referenced is None:
        image.cleanup_pending = True


def _cleanup_pending_images(db: Session, user_id: str | None = None) -> None:
    statement = select(UploadedImage).where(UploadedImage.cleanup_pending.is_(True))
    if user_id is not None:
        statement = statement.where(UploadedImage.user_id == user_id)
    for image in db.scalars(statement):
        referenced = db.scalar(select(CountSession.id).where(
            CountSession.image_path == f"/api/uploads/{image.filename}", CountSession.user_id == image.user_id,
        ).limit(1))
        if referenced is None:
            _upload_path(image.filename).unlink(missing_ok=True)
            db.delete(image)
        else:
            image.cleanup_pending = False


def cleanup_pending_images(db: Session, user_id: str) -> None:
    lock_capacity(db)
    _cleanup_pending_images(db, user_id)
    db.commit()


def _cleanup_previews(db: Session, now, user_id: str | None = None) -> None:
    statement = select(CountSession).where(
        CountSession.is_saved.is_(False), CountSession.inference_verified.is_(True),
        CountSession.created_at <= now - timedelta(hours=settings.inference_preview_ttl_hours),
    )
    if user_id is not None:
        statement = statement.where(CountSession.user_id == user_id)
    previews = list(db.scalars(statement.limit(100)))
    for preview in previews:
        db.delete(preview)
    db.flush()
    for preview in previews:
        mark_unused_session_image(db, preview.user_id, preview.image_path)
