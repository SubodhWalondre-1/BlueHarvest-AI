import asyncio
from io import BytesIO

import pytest
from fastapi import HTTPException
from PIL import Image

from app.core.config import settings
from app.services import counting_service


class _FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class _FakeAsyncClient:
    response = _FakeResponse()
    calls = []

    def __init__(self, *args, **kwargs):
        self.init_kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        return self.response

    async def get(self, url, **kwargs):
        self.calls.append(("GET", url, kwargs))
        return self.response


def _enable_modal(monkeypatch):
    monkeypatch.setattr(settings, "modal_enabled", True)
    monkeypatch.setattr(settings, "modal_base_url", "https://modal.example.test")
    monkeypatch.setattr(settings, "modal_key", "test-key-not-a-real-secret")
    monkeypatch.setattr(settings, "modal_secret", "test-secret-not-a-real-secret")
    monkeypatch.setattr(settings, "modal_predict_path", "/predict")
    monkeypatch.setattr(settings, "modal_health_path", "/health")
    monkeypatch.setattr(settings, "modal_request_format", "multipart")
    monkeypatch.setattr(settings, "modal_image_field", "image")
    monkeypatch.setattr(settings, "modal_count_field", None)
    monkeypatch.setattr(settings, "modal_points_field", None)
    monkeypatch.setattr(counting_service.httpx, "AsyncClient", _FakeAsyncClient)
    _FakeAsyncClient.calls = []


def test_modal_count_uses_auth_headers_and_existing_image_field(monkeypatch):
    _enable_modal(monkeypatch)
    _FakeAsyncClient.response = _FakeResponse(200, {
        "data": {"pred_count": 84},
        "model_name": "BlueHarvest P2PNet",
        "inference_time_ms": 132.4,
        "confidence": 0.91,
    })

    result = asyncio.run(counting_service.count_fish_image(b"image-bytes", "sample.png", "image/png"))

    method, url, kwargs = _FakeAsyncClient.calls[0]
    assert method == "POST"
    assert url == "https://modal.example.test/predict"
    assert kwargs["headers"]["Modal-Key"] == "test-key-not-a-real-secret"
    assert kwargs["headers"]["Modal-Secret"] == "test-secret-not-a-real-secret"
    assert kwargs["files"]["image"] == ("sample.png", b"image-bytes", "image/png")
    assert result["final_fish_count"] == 84
    assert result["final_count"] == 84
    assert result["stats"]["processing_time_ms"] == 132.4
    assert result["confidence"] == 0.91


def test_modal_missing_credentials_returns_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "modal_enabled", True)
    monkeypatch.setattr(settings, "modal_base_url", "https://modal.example.test")
    monkeypatch.setattr(settings, "modal_key", None)
    monkeypatch.setattr(settings, "modal_secret", None)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(counting_service.count_fish_image(b"image", "a.png", "image/png"))
    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "model_not_configured"


def test_modal_response_without_count_fails_without_fabricating_metrics(monkeypatch):
    _enable_modal(monkeypatch)
    _FakeAsyncClient.response = _FakeResponse(200, {"model_name": "P2PNet", "confidence": 0.99})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(counting_service.count_fish_image(b"image", "a.png", "image/png"))
    assert exc.value.status_code == 502
    assert exc.value.detail["code"] == "inference_count_missing"


def test_modal_can_use_configured_nested_count_field(monkeypatch):
    _enable_modal(monkeypatch)
    monkeypatch.setattr(settings, "modal_count_field", "data.total_spawn")
    _FakeAsyncClient.response = _FakeResponse(200, {"data": {"total_spawn": 21}})
    result = asyncio.run(counting_service.count_fish_image(b"image", "a.png", "image/png"))
    assert result["final_fish_count"] == 21


def test_modal_health_check_uses_authenticated_health_endpoint(monkeypatch):
    _enable_modal(monkeypatch)
    _FakeAsyncClient.response = _FakeResponse(200, {"status": "healthy"})
    result = asyncio.run(counting_service.check_modal_health())
    method, url, kwargs = _FakeAsyncClient.calls[0]
    assert method == "GET"
    assert url == "https://modal.example.test/health"
    assert "Modal-Key" in kwargs["headers"] and "Modal-Secret" in kwargs["headers"]
    assert result["status"] == "ok"


def test_configured_points_field_counts_actual_returned_points(monkeypatch):
    _enable_modal(monkeypatch)
    monkeypatch.setattr(settings, "modal_points_field", "predictions.points")
    _FakeAsyncClient.response = _FakeResponse(200, {"predictions": {"points": [[1, 2], [3, 4], [5, 6]]}})
    result = asyncio.run(counting_service.count_fish_image(b"image", "a.png", "image/png"))
    assert result["final_fish_count"] == 3


def test_modal_base64_json_request_format(monkeypatch):
    import base64

    _enable_modal(monkeypatch)
    monkeypatch.setattr(settings, "modal_request_format", "base64_json")
    monkeypatch.setattr(settings, "modal_image_field", "image_base64")
    _FakeAsyncClient.response = _FakeResponse(200, {"count": 4})
    result = asyncio.run(counting_service.count_fish_image(b"abc", "a.png", "image/png"))
    _, _, kwargs = _FakeAsyncClient.calls[0]
    assert kwargs["json"]["image_base64"] == base64.b64encode(b"abc").decode("ascii")
    assert result["final_count"] == 4


def test_image_processing_route_returns_modal_count_shape(client, registered, monkeypatch):
    from app.api.routes import image_processing

    async def fake_count(image_bytes, filename, content_type=None):
        assert image_bytes
        assert filename == "sample.png"
        assert content_type == "image/png"
        return {"final_fish_count": 19, "final_count": 19, "method": "BlueHarvest P2PNet", "stats": {}}

    monkeypatch.setattr(image_processing, "count_fish_image", fake_count)
    image_buffer = BytesIO()
    Image.new("RGB", (8, 8), "white").save(image_buffer, format="PNG")
    image_buffer.seek(0)
    response = client.post(
        "/api/image-processing",
        headers={"Authorization": f"Bearer {registered['token']}"},
        files={"image": ("sample.png", image_buffer, "image/png")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["final_fish_count"] == 19
    assert body["final_count"] == 19


def test_model_health_route_requires_auth_and_returns_probe(client, registered, monkeypatch):
    from app.api.routes import image_processing

    async def fake_health():
        return {"status": "ok", "provider": "modal", "upstream_status_code": 200}

    monkeypatch.setattr(image_processing, "check_modal_health", fake_health)
    unauthorized = client.get("/api/model/health")
    assert unauthorized.status_code == 401
    response = client.get(
        "/api/model/health",
        headers={"Authorization": f"Bearer {registered['token']}"},
    )
    assert response.status_code == 200
    assert response.json()["provider"] == "modal"
