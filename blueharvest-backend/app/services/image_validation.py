from io import BytesIO
from PIL import Image, UnidentifiedImageError
from fastapi import HTTPException, UploadFile, status
from app.core.config import settings

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "BMP", "TIFF"}
MAX_IMAGE_PIXELS = 60_000_000


async def read_and_validate_image(upload: UploadFile) -> tuple[bytes, dict]:
    filename = (upload.filename or "upload").replace("\\", "/").split("/")[-1][:180]
    content_type = (upload.content_type or "").lower()
    try:
        data = await upload.read(settings.max_upload_mb * 1024 * 1024 + 1)
    finally:
        await upload.close()
    if not data:
        raise HTTPException(status_code=400, detail={"code": "empty_upload", "message": "The uploaded image is empty."})
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail={"code": "upload_too_large", "message": f"Maximum upload size is {settings.max_upload_mb} MB."})
    if content_type and not (content_type.startswith("image/") or content_type == "application/octet-stream"):
        raise HTTPException(status_code=415, detail={"code": "unsupported_media_type", "message": "Upload a supported image file."})
    try:
        with Image.open(BytesIO(data)) as image:
            image.verify()
        with Image.open(BytesIO(data)) as image:
            fmt = (image.format or "").upper()
            width, height = image.size
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=415, detail={"code": "invalid_image", "message": "The uploaded file is not a readable image."})
    if fmt not in ALLOWED_FORMATS:
        raise HTTPException(status_code=415, detail={"code": "unsupported_image_format", "message": "Supported formats: JPEG, PNG, WEBP, BMP and TIFF."})
    if width < 1 or height < 1:
        raise HTTPException(status_code=400, detail={"code": "invalid_dimensions", "message": "Image dimensions are invalid."})
    if width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(status_code=413, detail={"code": "image_dimensions_too_large", "message": "Image dimensions are too large to process safely."})
    return data, {"filename": filename, "format": fmt.lower(), "width": width, "height": height, "size_bytes": len(data)}
