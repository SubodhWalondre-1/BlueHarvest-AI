from uuid import UUID
from pydantic import BaseModel, ConfigDict, StrictBool


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
