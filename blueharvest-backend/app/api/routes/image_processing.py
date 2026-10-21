import re
import asyncio
import logging
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.config import settings
from app.core.time import utcnow_naive
from app.db.session import get_db
from app.models import CountSession, UploadedImage, User
from app.services.image_validation import read_and_validate_image
from app.services.counting_service import check_modal_health, count_fish_image
from app.services.rate_limit_service import enforce_rate_limit
from app.services.inference_resource_service import abandon_inference_job, lock_inference_job, reserve_inference_job
from app.services.storage_service import upload_image_to_storage

router = APIRouter(prefix="/api", tags=["image processing"])
logger = logging.getLogger(__name__)


@router.post("/image-processing")
async def image_processing(
    request: Request, image: UploadFile = File(...), _user: User = Depends(get_current_user),
    db: Session = Depends(get_db), source: Annotated[Literal["Uploaded", "Camera"], Form()] = "Uploaded",
):
    enforce_rate_limit(
        db, request, "inference", ip_limit=settings.inference_ip_limit, window_seconds=settings.inference_window_seconds,
        account=_user.id, account_limit=settings.inference_account_limit,
    )
    data, image_info = await read_and_validate_image(image)
    
    image_ext = image_info.get("format", "jpeg").lower()
    if image_ext == "jpeg":
        image_ext = "jpg"
    unique_filename = f"{uuid4().hex}.{image_ext}"
    dest_path = settings.uploads_path / unique_filename
    image_url = f"/api/uploads/{unique_filename}"
    job_id = str(uuid4())
    reserve_inference_job(db, request, _user.id, job_id, unique_filename, len(data))
    try:
        image_url = upload_image_to_storage(data, unique_filename)
        async with asyncio.timeout(settings.modal_timeout_seconds):
            result = await count_fish_image(data, image_info["filename"], image.content_type)
        job = lock_inference_job(db, job_id)
        db.add(UploadedImage(
            filename=unique_filename, user_id=_user.id,
            media_type="image/jpeg" if image_ext == "jpg" else f"image/{image_ext}",
            size_bytes=len(data),
        ))
        stats = result.get("stats", {})
        now = utcnow_naive()
        session_id = str(uuid4())
        db.add(CountSession(
            id=session_id, batch_code=f"BAT-{now:%y%m%d}-{uuid4().hex[:6].upper()}", user_id=_user.id,
            count=result["final_fish_count"], confidence=result.get("confidence"),
            avg_length_mm=result.get("avg_length_mm"), density=result.get("density_label"),
            processing_time_ms=stats.get("processing_time_ms"), method=result.get("method"),
            image_path=image_url, pond_location=_user.pond_location, source=source,
            status="completed", is_saved=False, is_demo=False, inference_verified=True,
        ))
        db.delete(job)
        db.commit()
    except BaseException as exc:
        # Remove incomplete uploads even when inference is cancelled.
        try:
            abandon_inference_job(db, job_id, unique_filename)
        except Exception:
            logger.exception("Incomplete inference cleanup will be retried after its reservation expires.")
        if isinstance(exc, TimeoutError):
            raise HTTPException(status_code=504, detail={"code": "model_inference_timeout", "message": "Inference exceeded the processing deadline. Please retry."}) from exc
        raise
    result["image_url"] = image_url
    result["image_path"] = image_url
    result["session_id"] = session_id
    # Only model-produced values are returned; no default count/confidence is fabricated.
    return result


@router.get("/uploads/{filename}")
async def get_uploaded_image(filename: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not re.fullmatch(r"[a-f0-9]{32}\.(jpg|png|webp|bmp|tiff)", filename):
        raise HTTPException(status_code=404, detail={"code": "image_not_found", "message": "Uploaded image not found."})
    image = db.scalar(select(UploadedImage).where(UploadedImage.filename == filename, UploadedImage.user_id == user.id))
    if image is None:
        raise HTTPException(status_code=404, detail={"code": "image_not_found", "message": "Uploaded image not found."})
    base_path = settings.uploads_path.resolve()
    file_path = base_path / filename
    if file_path.is_symlink() or file_path.resolve().parent != base_path or not file_path.is_file():
        raise HTTPException(status_code=404, detail={"code": "image_not_found", "message": "Uploaded image not found."})
    return FileResponse(file_path, media_type=image.media_type, headers={
        "Cache-Control": "private, no-store", "Vary": "Authorization", "X-Content-Type-Options": "nosniff",
    })


@router.post("/preprocess-image")
async def preprocess_image(request: Request, file: UploadFile = File(...), _user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    enforce_rate_limit(
        db, request, "preprocess", ip_limit=settings.inference_ip_limit, window_seconds=settings.inference_window_seconds,
        account=_user.id, account_limit=settings.inference_account_limit,
    )
    _data, image_info = await read_and_validate_image(file)
    return {
        "status": "validated",
        "image": image_info,
        "quality_assessment": {
            "status": "not_evaluated",
            "reason": "image_quality_pipeline_not_configured",
        },
        "message": "Image is readable. Image enhancement and quality scoring are not configured yet.",
    }


@router.get("/model/health")
async def model_health(request: Request, _user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Authenticated live health probe for the configured Modal inference service."""
    enforce_rate_limit(
        db, request, "model-health", ip_limit=settings.inference_ip_limit, window_seconds=settings.inference_window_seconds,
        account=_user.id, account_limit=settings.inference_account_limit,
    )
    return await check_modal_health()
