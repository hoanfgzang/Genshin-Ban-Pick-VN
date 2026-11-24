from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import field_validator

from .auth import CamelModel, UID_RE

ManagedRole = Literal["player", "admin"]


class AdminUserItem(CamelModel):
    id: str
    uid: str
    display_name: str
    email: str | None
    role: ManagedRole
    is_seed_admin: bool = False
    owned_count: int = 0
    created_at: datetime


class UpdateUserRoleRequest(CamelModel):
    role: ManagedRole


class PromoteByUidRequest(CamelModel):
    uid: str
    role: ManagedRole = "admin"

    @field_validator("uid")
    @classmethod
    def validate_uid(cls, v: str) -> str:
        s = v.strip()
        if not UID_RE.match(s):
            raise ValueError("UID Genshin phải gồm 9–10 chữ số.")
        return s
