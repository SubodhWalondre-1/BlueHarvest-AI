from pydantic import BaseModel, Field


class CountSessionCreate(BaseModel):
    count: int | None = Field(default=None, ge=0, le=100_000_000)
    status: str = Field(default="completed", max_length=32)
    source: str = Field(default="Uploaded", max_length=32)
    container: str | None = Field(default=None, max_length=32)
    dimensions: str | None = Field(default=None, max_length=80)
    pond_location: str | None = Field(default=None, max_length=200)
    density: str | None = Field(default=None, max_length=80)
    confidence: float | None = Field(default=None, ge=0, le=1)
    avg_length_mm: float | None = Field(default=None, ge=0, le=1000)
    processing_time_ms: float | None = Field(default=None, ge=0)
    method: str | None = Field(default=None, max_length=120)
    image_path: str | None = None
    image_url: str | None = None
    is_demo: bool = False


class CountSessionUpdate(BaseModel):
    is_saved: bool | None = None
    status: str | None = Field(default=None, max_length=32)


class DemoDataStatus(BaseModel):
    enabled: bool
    label: str
    warning: str
