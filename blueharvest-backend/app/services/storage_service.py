import asyncio
import re
from urllib.parse import quote, unquote, urlsplit

import httpx
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from app.core.config import settings


def storage_error() -> HTTPException:
    return HTTPException(status_code=503, detail={
        "code": "image_storage_unavailable",
        "message": "Image storage is unavailable. Please retry after storage is restored.",
    })


def storage_provider() -> str:
    if settings.cloudinary_is_configured:
        _credentials()
        return "cloudinary"
    if settings.app_env.lower() in {"production", "prod"} and not settings.upload_storage_persistent:
        raise storage_error()
    return "local"


def _credentials() -> tuple[str, tuple[str, str]]:
    cloud, key, secret = settings.cloudinary_cloud_name, settings.cloudinary_api_key, settings.cloudinary_api_secret
    if settings.cloudinary_url:
        parsed = urlsplit(settings.cloudinary_url)
        if parsed.scheme != "cloudinary":
            raise storage_error()
        cloud, key, secret = parsed.hostname, unquote(parsed.username or ""), unquote(parsed.password or "")
    if not cloud or not re.fullmatch(r"[A-Za-z0-9_-]+", cloud) or not key or not secret:
        raise storage_error()
    return f"https://api.cloudinary.com/v1_1/{cloud}", (key, secret)


def upload_path(filename: str):
    if not re.fullmatch(r"[a-f0-9]{32}\.(jpg|png|webp|bmp|tiff)", filename):
        raise ValueError("Invalid upload filename.")
    path = settings.uploads_path / filename
    if path.is_symlink() or path.resolve().parent != settings.uploads_path.resolve():
        raise ValueError("Invalid upload path.")
    return path


def _public_id(filename: str) -> str:
    upload_path(filename)
    return f"blueharvest/uploads/{filename.rsplit('.', 1)[0]}"


async def upload_image_to_storage(image_bytes: bytes, filename: str, provider: str) -> str | None:
    if provider == "local":
        try:
            settings.uploads_path.mkdir(parents=True, exist_ok=True)
            await run_in_threadpool(upload_path(filename).write_bytes, image_bytes)
            return None
        except OSError as exc:
            raise storage_error() from exc
    base, auth = _credentials()
    try:
        async with asyncio.timeout(settings.storage_timeout_seconds), httpx.AsyncClient(timeout=settings.storage_timeout_seconds, follow_redirects=False) as client:
            response = await client.post(f"{base}/image/upload", auth=auth,
                data={"public_id": _public_id(filename), "type": "authenticated", "overwrite": "false"},
                files={"file": (filename, image_bytes)})
        response.raise_for_status()
        body = response.json()
        if (not isinstance(body, dict) or body.get("type") != "authenticated"
                or body.get("public_id") != _public_id(filename) or not isinstance(body.get("asset_id"), str)
                or not 1 <= len(body["asset_id"]) <= 128):
            raise storage_error()
        return str(body["asset_id"])
    except (TimeoutError, httpx.HTTPError, ValueError) as exc:
        raise storage_error() from exc


async def download_stored_image(asset_id: str, max_bytes: int, byte_range: str | None = None):
    base, auth = _credentials()
    try:
        async with asyncio.timeout(settings.storage_timeout_seconds), httpx.AsyncClient(timeout=settings.storage_timeout_seconds, follow_redirects=False) as client:
            async with client.stream("GET", f"{base}/asset/download", auth=auth,
                    params={"asset_id": asset_id}, headers={"Range": byte_range} if byte_range else {}) as response:
                if response.status_code == 404:
                    raise HTTPException(status_code=404, detail={"code": "image_not_found", "message": "Uploaded image not found."})
                if response.status_code == 416:
                    return b"", 416, {"content-range": response.headers.get("content-range", "bytes */*")}
                response.raise_for_status()
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > max_bytes:
                        raise storage_error()
                headers = {key: response.headers[key] for key in ("content-range", "accept-ranges") if key in response.headers}
                return bytes(data), response.status_code, headers
    except (TimeoutError, httpx.HTTPError) as exc:
        raise storage_error() from exc


def delete_stored_image(filename: str, provider: str) -> None:
    if provider != "local":
        base, auth = _credentials()
        delivery_type = "upload" if provider == "cloudinary_legacy" else "authenticated"
        with httpx.Client(timeout=min(settings.storage_timeout_seconds, 5), follow_redirects=False) as client:
            response = client.post(f"{base}/image/destroy", auth=auth,
                data={"public_id": _public_id(filename), "type": delivery_type, "invalidate": "true"})
        response.raise_for_status()
        if response.json().get("result") not in {"ok", "not found"}:
            raise storage_error()
    upload_path(filename).unlink(missing_ok=True)


async def secure_legacy_images(db) -> None:
    from sqlalchemy import select
    from app.models import UploadedImage

    for image in db.scalars(select(UploadedImage).where(UploadedImage.storage_provider == "cloudinary_legacy")):
        base, auth = _credentials()
        public_id = _public_id(image.filename)
        async with httpx.AsyncClient(timeout=settings.storage_timeout_seconds, follow_redirects=False) as client:
            response = await client.post(f"{base}/image/rename", auth=auth, data={
                "from_public_id": public_id, "to_public_id": public_id,
                "type": "upload", "to_type": "authenticated", "invalidate": "true",
            })
            if response.status_code in {404, 409}:
                # Recover a completed provider operation whose database commit was interrupted.
                response = await client.get(f"{base}/resources/image/authenticated/{quote(public_id, safe='')}", auth=auth)
        response.raise_for_status()
        body = response.json()
        if (not isinstance(body, dict) or body.get("type") != "authenticated"
                or body.get("public_id") != public_id or not isinstance(body.get("asset_id"), str)
                or not 1 <= len(body["asset_id"]) <= 128):
            raise storage_error()
        image.storage_provider, image.storage_asset_id = "cloudinary", str(body["asset_id"])
        db.commit()
