import asyncio
import smtplib
from email.message import EmailMessage
from app.core.config import settings


class DeliveryNotConfigured(RuntimeError):
    pass


def _send_email_sync(destination: str, code: str) -> None:
    if not all([settings.smtp_host, settings.smtp_from_email]):
        raise DeliveryNotConfigured("Email delivery is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.")
    msg = EmailMessage()
    msg["Subject"] = "BlueHarvest AI password recovery code"
    msg["From"] = settings.smtp_from_email
    msg["To"] = destination
    msg.set_content(
        f"Your BlueHarvest AI password recovery code is {code}. "
        f"It expires in {settings.otp_ttl_minutes} minutes. If you did not request this, ignore this message."
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.ehlo()
        if settings.smtp_starttls:
            smtp.starttls()
            smtp.ehlo()
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(msg)


async def send_email_otp(destination: str, code: str) -> None:
    await asyncio.to_thread(_send_email_sync, destination, code)
