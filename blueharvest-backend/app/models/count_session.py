from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.core.time import utcnow_naive


class CountSession(Base):
    __tablename__ = "count_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    batch_code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    count: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="completed", nullable=False)
    is_saved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    inference_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false(), nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="Uploaded", nullable=False)
    container: Mapped[str | None] = mapped_column(String(32))
    dimensions: Mapped[str | None] = mapped_column(String(80))
    pond_location: Mapped[str | None] = mapped_column(String(200))
    density: Mapped[str | None] = mapped_column(String(80))
    confidence: Mapped[float | None] = mapped_column(Float)
    avg_length_mm: Mapped[float | None] = mapped_column(Float)
    processing_time_ms: Mapped[float | None] = mapped_column(Float)
    method: Mapped[str | None] = mapped_column(String(120))
    image_path: Mapped[str | None] = mapped_column(Text)
    heatmap_path: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive, nullable=False)
