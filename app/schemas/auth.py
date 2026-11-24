from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

UID_RE = re.compile(r"^\d{9,10}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class RegisterRequest(CamelModel):
    uid: str
    display_name: str = Field(min_length=2, max_length=30)
    email: str | None = None
    password: str = Field(min_length=8, max_length=72)

    @field_validator("uid")
    @classmethod
    def validate_uid(cls, v: str) -> str:
        s = v.strip()
        if not UID_RE.match(s):
            raise ValueError("UID Genshin phải gồm 9–10 chữ số.")
        return s

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 2:
            raise ValueError("Tên hiển thị tối thiểu 2 ký tự.")
        return s

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip().lower()
        if not s:
            return None
        if not EMAIL_RE.match(s):
            raise ValueError("Email không hợp lệ.")
        return s


class LoginRequest(CamelModel):
    uid: str
    password: str = Field(min_length=1, max_length=72)
    remember: bool = True

    @field_validator("uid")
    @classmethod
    def validate_uid(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Vui lòng nhập UID.")
        return s


class UserResponse(CamelModel):
    id: str
    uid: str
    display_name: str
    email: str | None
    role: Literal["player", "admin"]
    is_super_admin: bool = False
    is_guest: bool = False
    created_at: datetime


class AuthResponse(CamelModel):
    user: UserResponse
    token: str
