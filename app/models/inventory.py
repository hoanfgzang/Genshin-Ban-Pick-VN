from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class UserCharacter(Base):
    __tablename__ = "user_characters"
    __table_args__ = (
        CheckConstraint("constellation >= 0 AND constellation <= 6", name="ck_constellation_range"),
        CheckConstraint("level IN (90, 95, 100)", name="ck_level_values"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    character_slug: Mapped[str] = mapped_column(String(80), primary_key=True)
    constellation: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
