import re
from pydantic import BaseModel, EmailStr, Field, field_validator


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    display_role: str | None = Field(default=None, min_length=2, max_length=80)
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=24)
    pond_location: str | None = Field(default=None, max_length=200)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = re.sub(r"[\s().-]", "", value.strip())
        if not re.fullmatch(r"\+?[1-9]\d{7,14}", normalized):
            raise ValueError("Phone must use an international format, for example +919876543210")
        return normalized


class SettingsUpdate(BaseModel):
    notifications_enabled: bool | None = None
    language: str | None = Field(default=None, min_length=2, max_length=32)
    theme: str | None = Field(default=None, min_length=2, max_length=32)
