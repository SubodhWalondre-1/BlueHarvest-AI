import httpx
from app.core.config import settings
from app.services.email_service import DeliveryNotConfigured


async def send_sms_otp(destination: str, code: str, purpose: str = "password reset") -> None:
    if not all([settings.twilio_account_sid, settings.twilio_auth_token, settings.twilio_from_number]):
        raise DeliveryNotConfigured("SMS delivery is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER.")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    body = f"Your BlueHarvest AI {purpose} code is {code}. It expires in {settings.otp_ttl_minutes} minutes."
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            url,
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            data={"From": settings.twilio_from_number, "To": destination, "Body": body},
        )
        response.raise_for_status()
