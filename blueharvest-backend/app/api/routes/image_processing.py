from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from app.api.deps import get_current_user
from app.models import User
from app.services.image_validation import read_and_validate_image
from app.services.counting_service import check_modal_health, count_fish_image

router = APIRouter(prefix="/api", tags=["image processing"])


from uuid import uuid4
from fastapi.responses import FileResponse
from app.core.config import settings

@router.post("/image-processing")
async def image_processing(image: UploadFile = File(...), _user: User = Depends(get_current_user)):
    data, image_info = await read_and_validate_image(image)
    
    # Save uploaded image to persistent uploads directory
    image_ext = image_info.get("format", "jpeg").lower()
    if image_ext == "jpeg":
        image_ext = "jpg"
    unique_filename = f"{uuid4().hex}.{image_ext}"
    dest_path = settings.uploads_path / unique_filename
    dest_path.write_bytes(data)
    image_url = f"/api/uploads/{unique_filename}"

    result = await count_fish_image(data, image_info["filename"], image.content_type)
    result["image_url"] = image_url
    result["image_path"] = image_url
    # Only model-produced values are returned; no default count/confidence is fabricated.
    return result


@router.get("/uploads/{filename}")
async def get_uploaded_image(filename: str):
    file_path = (settings.uploads_path / filename).resolve()
    base_path = settings.uploads_path.resolve()
    if not str(file_path).startswith(str(base_path)) or not file_path.is_file():
        raise HTTPException(status_code=404, detail={"code": "image_not_found", "message": "Uploaded image not found."})
    suffix = file_path.suffix.lower()
    media_type = "image/jpeg"
    if suffix == ".png":
        media_type = "image/png"
    elif suffix == ".webp":
        media_type = "image/webp"
    elif suffix == ".bmp":
        media_type = "image/bmp"
    elif suffix in (".tif", ".tiff"):
        media_type = "image/tiff"
    return FileResponse(file_path, media_type=media_type)


@router.post("/preprocess-image")
async def preprocess_image(file: UploadFile = File(...), _user: User = Depends(get_current_user)):
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
async def model_health(_user: User = Depends(get_current_user)):
    """Authenticated live health probe for the configured Modal inference service."""
    return await check_modal_health()
