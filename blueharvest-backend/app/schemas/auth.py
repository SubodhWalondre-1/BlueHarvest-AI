from pydantic import BaseModel, EmailStr, Field, field_validator
from app.schemas.user import normalize_phone


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    phone: str | None = Field(default=None, max_length=24)
    pond_location: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=128)

    _phone = field_validator("phone", mode="before")(normalize_phone)

    @field_validator("username", "email", "pond_location", "full_name", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value


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
