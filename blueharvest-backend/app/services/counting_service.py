"""Modal adapter for the deployed BlueHarvest P2PNet model.

All provider credentials are loaded from environment-backed application settings.
The response parser deliberately requires a real count from the upstream service;
it never synthesizes a count or model metric.
"""

from __future__ import annotations

import base64
import math
from typing import Any
from urllib.parse import urljoin

import httpx
from fastapi import HTTPException, status

from app.core.config import settings


_COUNT_KEYS = (
    "final_fish_count",
    "final_count",
    "shrimp_spawn_count",
    "spawn_count",
    "predicted_count",
    "pred_count",
    "count",
    "total_count",
    "num_objects",
    "number_of_objects",
)
_NESTED_RESULT_KEYS = ("data", "result", "prediction", "stats", "metrics")


def _get_path(payload: Any, dotted_path: str | None) -> Any:
    if not dotted_path:
        return None
    current = payload
    for segment in dotted_path.split("."):
        if not segment or not isinstance(current, dict) or segment not in current:
            return None
        current = current[segment]
    return current


def _find_first(payload: Any, keys: tuple[str, ...]) -> Any:
    if not isinstance(payload, dict):
        return None
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    for parent_key in _NESTED_RESULT_KEYS:
        nested = payload.get(parent_key)
        if isinstance(nested, dict):
            found = _find_first(nested, keys)
            if found is not None:
                return found
    return None


def _normalize_count(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        numeric_value = float(value)
    except (OverflowError, ValueError):
        return None
    if not math.isfinite(numeric_value) or numeric_value < 0 or not numeric_value.is_integer():
        return None
    return int(numeric_value)


def _optional_finite_number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        numeric_value = float(value)
    except (OverflowError, ValueError):
        return None
    if not math.isfinite(numeric_value):
        return None
    return value


def _provider_headers() -> dict[str, str]:
    # Modal requires both headers for each request. Do not log these values.
    if not settings.modal_is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "model_not_configured",
                "message": "Modal P2PNet inference is not configured. Set MODAL_ENABLED, MODAL_KEY, and MODAL_SECRET in the backend environment.",
            },
        )
    return {"Modal-Key": str(settings.modal_key), "Modal-Secret": str(settings.modal_secret)}


def _build_predict_request(image_bytes: bytes, filename: str, content_type: str) -> dict[str, Any]:
    request_format = settings.modal_request_format.strip().lower()
    image_field = (settings.modal_image_field or "image").strip() or "image"
    if request_format == "multipart":
        return {"files": {image_field: (filename, image_bytes, content_type)}}
    if request_format == "base64_json":
        encoded = base64.b64encode(image_bytes).decode("ascii")
        return {"json": {image_field: encoded}}
    if request_format == "raw":
        return {"content": image_bytes, "headers": {"Content-Type": content_type}}
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "invalid_modal_request_format",
            "message": "MODAL_REQUEST_FORMAT must be multipart, base64_json, or raw.",
        },
    )


def _extract_response(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "invalid_inference_response", "message": "The Modal inference service returned an unexpected response format."},
        )

    configured_count_field = (settings.modal_count_field or "").strip()
    if configured_count_field:
        raw_count = _get_path(payload, configured_count_field)
    else:
        raw_count = _find_first(payload, _COUNT_KEYS)
    count = _normalize_count(raw_count)

    # Some point-count APIs return explicit point coordinates rather than a count.
    # We only count list entries when the operator explicitly configures that field.
    configured_points_field = (settings.modal_points_field or "").strip()
    if count is None and configured_points_field:
        points = _get_path(payload, configured_points_field)
        if isinstance(points, list):
            count = len(points)

    if count is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "inference_count_missing",
                "message": "The Modal response did not contain a valid non-negative integer count. Check MODAL_COUNT_FIELD against the /predict response schema.",
            },
        )

    processing_ms = _find_first(payload, ("processing_time_ms", "inference_time_ms"))
    if processing_ms is None:
        seconds = _find_first(payload, ("inference_time_seconds", "processing_time_seconds"))
        seconds = _optional_finite_number(seconds)
        if seconds is not None and seconds >= 0:
            processing_ms = seconds * 1000
    processing_ms = _optional_finite_number(processing_ms)
    if processing_ms is not None and processing_ms < 0:
        processing_ms = None

    confidence = _find_first(payload, ("confidence", "confidence_score"))
    confidence = _optional_finite_number(confidence)
    if confidence is not None and not 0 <= confidence <= 1:
        confidence = None

    method = _find_first(payload, ("method", "model_name", "model"))
    method = method if isinstance(method, str) and method.strip() else "BlueHarvest P2PNet"

    stats: dict[str, Any] = {"selected_channel_name": method}
    if processing_ms is not None:
        stats["processing_time_ms"] = processing_ms
    if confidence is not None:
        stats["confidence"] = confidence

    result: dict[str, Any] = {
        "final_fish_count": count,
        "final_count": count,
        "method": method,
        "stats": stats,
        "provider": "modal",
    }

    # Forward optional model outputs only if supplied by the actual provider.
    avg_length = _optional_finite_number(_find_first(payload, ("avg_length_mm",)))
    if avg_length is not None and avg_length >= 0:
        result["avg_length_mm"] = avg_length
    density_label = _find_first(payload, ("density_label",))
    if isinstance(density_label, str) and density_label.strip():
        result["density_label"] = density_label
    # These frontend fields are image sources; forward only URLs/data-URI strings.
    for image_key in ("final_heatmap", "heatmap", "components"):
        image_value = _find_first(payload, (image_key,))
        if isinstance(image_value, str) and image_value.startswith(("https://", "http://", "data:image/")):
            result[image_key] = image_value
    if confidence is not None:
        result["confidence"] = confidence
    if "avg_length_mm" in result:
        result["stats"]["avg_length_mm"] = result["avg_length_mm"]
    if "density_label" in result:
        result["stats"]["density_label"] = result["density_label"]
    return result


def _url(path: str) -> str:
    return urljoin(settings.modal_base_url.rstrip("/") + "/", path.lstrip("/"))


async def count_fish_image(image_bytes: bytes, filename: str, content_type: str | None = None) -> dict[str, Any]:
    headers = _provider_headers()
    safe_content_type = content_type if content_type and content_type.startswith("image/") else "application/octet-stream"
    request_kwargs = _build_predict_request(image_bytes, filename, safe_content_type)
    request_kwargs.setdefault("headers", {}).update(headers)
    try:
        async with httpx.AsyncClient(timeout=settings.modal_timeout_seconds, follow_redirects=False) as client:
            response = await client.post(_url(settings.modal_predict_path), **request_kwargs)
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"code": "model_inference_timeout", "message": "The Modal inference request timed out. Please retry with the same image."},
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "model_service_unreachable", "message": "BlueHarvest could not reach the Modal inference service."},
        )

    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "model_service_auth_failed", "message": "Modal rejected the inference credentials. Rotate and verify MODAL_KEY and MODAL_SECRET."},
        )
    if response.status_code == 422 and settings.modal_request_format.strip().lower() == "multipart":
        current_field = (settings.modal_image_field or "file").strip() or "file"
        alt_field = "image" if current_field == "file" else "file"
        alt_kwargs = {"files": {alt_field: (filename, image_bytes, safe_content_type)}, "headers": dict(headers)}
        try:
            async with httpx.AsyncClient(timeout=settings.modal_timeout_seconds, follow_redirects=False) as client:
                retry_resp = await client.post(_url(settings.modal_predict_path), **alt_kwargs)
                if 200 <= retry_resp.status_code < 300:
                    response = retry_resp
        except Exception:
            pass

    if not 200 <= response.status_code < 300:
        err_detail = ""
        try:
            err_text = response.text.strip()
            if err_text:
                err_detail = f" Detail: {err_text[:200]}"
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "model_service_error", "message": f"Modal inference returned HTTP {response.status_code}.{err_detail} No count was produced."},
        )
    try:
        payload = response.json()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "invalid_inference_response", "message": "Modal inference returned a non-JSON response; no count was produced."},
        )
    return _extract_response(payload)


async def check_modal_health() -> dict[str, Any]:
    headers = _provider_headers()
    try:
        async with httpx.AsyncClient(timeout=min(settings.modal_timeout_seconds, 15.0), follow_redirects=False) as client:
            response = await client.get(_url(settings.modal_health_path), headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"code": "model_health_timeout", "message": "The Modal health check timed out."},
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "model_service_unreachable", "message": "BlueHarvest could not reach the Modal health endpoint."},
        )
    if not 200 <= response.status_code < 300:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "model_health_failed", "message": f"Modal health endpoint returned HTTP {response.status_code}."},
        )
    return {"status": "ok", "provider": "modal", "upstream_status_code": response.status_code}
