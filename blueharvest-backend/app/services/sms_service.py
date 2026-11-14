import re
import httpx
from app.core.config import settings
from app.services.email_service import DeliveryNotConfigured


async def send_sms_otp(destination: str, code: str, purpose: str = "password reset") -> None:
    if not settings.fast2sms_api_key:
        raise DeliveryNotConfigured("SMS delivery is not configured. Set FAST2SMS_API_KEY.")

    # Normalize destination to 10-digit Indian phone number
    clean_number = re.sub(r"\D", "", destination)
    if len(clean_number) > 10 and clean_number.startswith("91"):
        clean_number = clean_number[2:]

    url = "https://www.fast2sms.com/dev/bulkV2"
    headers = {
        "authorization": settings.fast2sms_api_key,
        "Content-Type": "application/json",
    }

    route = (settings.fast2sms_route or "otp").lower()
    if route == "otp":
        payload = {
            "route": "otp",
            "variables_values": str(code),
            "numbers": clean_number,
        }
    elif route == "q":
        payload = {
            "route": "q",
            "message": f"Your BlueHarvest AI {purpose} code is {code}. It expires in {settings.otp_ttl_minutes} minutes.",
            "language": "english",
            "numbers": clean_number,
        }
    else:  # dlt route
        payload = {
            "route": "dlt",
            "variables_values": str(code),
            "numbers": clean_number,
        }
        if settings.fast2sms_sender_id:
            payload["sender_id"] = settings.fast2sms_sender_id

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code >= 400:
            raise RuntimeError(f"Fast2SMS HTTP {response.status_code}: {response.text}")
        data = response.json()
        if not data.get("return"):
            err_msg = data.get("message")
            if isinstance(err_msg, list):
                err_msg = ", ".join(str(m) for m in err_msg)
            raise RuntimeError(f"Fast2SMS delivery failed: {err_msg or data}")
