import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

_cloudinary_initialized = False


def _init_cloudinary() -> bool:
    global _cloudinary_initialized
    if _cloudinary_initialized:
        return True
    if not settings.cloudinary_is_configured:
        return False
    try:
        import cloudinary
        if settings.cloudinary_url:
            cloudinary.config(cloudinary_url=settings.cloudinary_url, secure=True)
        else:
            cloudinary.config(
                cloud_name=settings.cloudinary_cloud_name,
                api_key=settings.cloudinary_api_key,
                api_secret=settings.cloudinary_api_secret,
                secure=True,
            )
        _cloudinary_initialized = True
        return True
    except Exception:
        logger.exception("Failed to initialize Cloudinary configuration.")
        return False


def upload_image_to_storage(image_bytes: bytes, filename: str) -> str:
    """
    Saves the image locally and uploads to Cloudinary if credentials are configured.
    Returns the public image URL (Cloudinary HTTPS CDN URL or local /api/uploads/ endpoint).
    """
    # Always write to local storage first for safety
    try:
        settings.uploads_path.mkdir(parents=True, exist_ok=True)
        local_path = settings.uploads_path / filename
        local_path.write_bytes(image_bytes)
    except OSError:
        logger.exception("Could not write image to local uploads directory.")

    if _init_cloudinary():
        try:
            import cloudinary.uploader
            public_id = filename.rsplit(".", 1)[0]
            response = cloudinary.uploader.upload(
                image_bytes,
                public_id=public_id,
                folder="blueharvest/uploads",
                resource_type="image",
                overwrite=True,
            )
            secure_url = response.get("secure_url")
            if secure_url:
                logger.info("Successfully uploaded image to Cloudinary: %s", secure_url)
                return secure_url
        except Exception:
            logger.exception("Cloudinary upload failed; falling back to local file storage URL.")

    return f"/api/uploads/{filename}"
