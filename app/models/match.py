from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True, nullable=False)
    ruleset_id: Mapped[str] = mapped_column(String(36), nullable=False)
    ruleset_name: Mapped[str] = mapped_column(String(100), nullable=False)
    ruleset_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="lobby", nullable=False)
    host_user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    blue_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    red_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    state_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    winner_side: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
