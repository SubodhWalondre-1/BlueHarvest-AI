import pytest
from unittest.mock import AsyncMock, patch
import httpx
from app.core.config import settings
from app.services.sms_service import send_sms_otp
from app.services.email_service import DeliveryNotConfigured


@pytest.mark.anyio
async def test_send_sms_otp_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "fast2sms_api_key", None)
    with pytest.raises(DeliveryNotConfigured, match="FAST2SMS_API_KEY"):
        await send_sms_otp("+919876543210", "123456")


@pytest.mark.anyio
async def test_send_sms_otp_success_otp_route(monkeypatch):
    monkeypatch.setattr(settings, "fast2sms_api_key", "test_fast2sms_key_xyz")
    monkeypatch.setattr(settings, "fast2sms_route", "otp")

    mock_response = httpx.Response(
        status_code=200,
        json={"return": True, "request_id": "req_123", "message": ["SMS sent successfully."]},
        request=httpx.Request("POST", "https://www.fast2sms.com/dev/bulkV2"),
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        await send_sms_otp("+919876543210", "654321")

        mock_post.assert_awaited_once()
        call_kwargs = mock_post.await_args.kwargs
        assert call_kwargs["headers"]["authorization"] == "test_fast2sms_key_xyz"
        assert call_kwargs["json"]["route"] == "otp"
        assert call_kwargs["json"]["variables_values"] == "654321"
        assert call_kwargs["json"]["numbers"] == "9876543210"


@pytest.mark.anyio
async def test_send_sms_otp_success_q_route(monkeypatch):
    monkeypatch.setattr(settings, "fast2sms_api_key", "test_fast2sms_key_xyz")
    monkeypatch.setattr(settings, "fast2sms_route", "q")

    mock_response = httpx.Response(
        status_code=200,
        json={"return": True, "request_id": "req_456", "message": ["SMS sent successfully."]},
        request=httpx.Request("POST", "https://www.fast2sms.com/dev/bulkV2"),
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        await send_sms_otp("9876543210", "999888")

        mock_post.assert_awaited_once()
        call_kwargs = mock_post.await_args.kwargs
        assert call_kwargs["json"]["route"] == "q"
        assert "999888" in call_kwargs["json"]["message"]
        assert call_kwargs["json"]["numbers"] == "9876543210"


@pytest.mark.anyio
async def test_send_sms_otp_api_failure(monkeypatch):
    monkeypatch.setattr(settings, "fast2sms_api_key", "test_fast2sms_key_xyz")

    mock_response = httpx.Response(
        status_code=200,
        json={"return": False, "status_code": 411, "message": "Invalid mobile number"},
        request=httpx.Request("POST", "https://www.fast2sms.com/dev/bulkV2"),
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        with pytest.raises(RuntimeError, match="Fast2SMS delivery failed: Invalid mobile number"):
            await send_sms_otp("123", "123456")
