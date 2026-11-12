from typing import Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StrictBool


class CountSessionSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: UUID


class CountSessionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_saved: StrictBool = True


class DemoDataStatus(BaseModel):
    enabled: bool
    label: str
    warning: str


class InferenceResultResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    session_id: str
    final_fish_count: int
    final_count: int
    image_url: str
    image_path: str
    method: str = "BlueHarvest P2PNet"
    provider: str = "modal"
    confidence: float | None = None
    avg_length_mm: float | None = None
    density_label: str | None = None
    final_heatmap: str | None = None
    heatmap: str | None = None
    components: str | None = None
    stats: dict[str, Any] = Field(default_factory=dict)

