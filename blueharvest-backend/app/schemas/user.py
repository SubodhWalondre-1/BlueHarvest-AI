import re
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field, TypeAdapter, field_validator, model_validator


def normalize_phone(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Phone must be a string.")
    if not value.strip():
        return None
    normalized = re.sub(r"[\s().-]", "", value.strip())
    if not re.fullmatch(r"\+?[1-9]\d{7,14}", normalized):
        raise ValueError("Phone must use an international format, for example +919876543210")
    return normalized


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str | None = Field(default=None, min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    display_role: str | None = Field(default=None, min_length=2, max_length=80)
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=24)
    pond_location: str | None = Field(default=None, min_length=1, max_length=200)

    @field_validator("username", "display_role", "full_name", "email", "pond_location", mode="before")
    @classmethod
    def required_text(cls, value):
        if value is None:
            raise ValueError("This profile field cannot be null.")
        return value.strip() if isinstance(value, str) else value

    _phone = field_validator("phone", mode="before")(normalize_phone)


class ContactChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channel: Literal["email", "phone"]
    value: str | None = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("value", mode="before")
    @classmethod
    def strip_value(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def normalize_destination(self):
        if self.channel == "email":
            self.value = str(TypeAdapter(EmailStr).validate_python(self.value.strip() if self.value else self.value)).lower()
        else:
            self.value = normalize_phone(self.value)
        return self


class ContactChangeConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    challenge_id: UUID
    code: str = Field(pattern=r"^[0-9]{6}$")
    password: str = Field(min_length=1, max_length=128)


class SettingsUpdate(BaseModel):
    notifications_enabled: bool | None = None
    language: str | None = Field(default=None, min_length=2, max_length=32)
    theme: str | None = Field(default=None, min_length=2, max_length=32)
