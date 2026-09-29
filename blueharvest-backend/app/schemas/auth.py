import re
from pydantic import BaseModel, EmailStr, Field, field_validator


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    phone: str | None = Field(default=None, max_length=24)
    pond_location: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = re.sub(r"[\s().-]", "", value.strip())
        if not re.fullmatch(r"\+?[1-9]\d{7,14}", normalized):
            raise ValueError("Phone must use an international format, for example +919876543210")
        return normalized

    @field_validator("username", "email", "pond_location", "full_name")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=20, max_length=8192)


class PasswordResetRequest(BaseModel):
    destination: str = Field(min_length=3, max_length=254)


class PasswordResetVerify(BaseModel):
    destination: str = Field(min_length=3, max_length=254)
    code: str = Field(pattern=r"^\d{6}$")


class PasswordResetConfirm(BaseModel):
    destination: str = Field(min_length=3, max_length=254)
    reset_token: str = Field(min_length=20, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
