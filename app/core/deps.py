from __future__ import annotations

import hmac

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User
from .config import get_settings
from .database import get_db
from .errors import forbidden, unauthorized
from .security import decode_access_token


def extract_token(request: Request, authorization: str | None = None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token:
            return token
    settings = get_settings()
    cookie_token = request.cookies.get(settings.COOKIE_NAME)
    if cookie_token:
        return cookie_token
    return None


async def get_optional_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    token = extract_token(request, authorization)
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if not user:
        raise unauthorized()
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise forbidden()
    return user


async def require_super_admin_or_secret(
    x_admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
    user: User | None = Depends(get_optional_user),
) -> User | None:
    settings = get_settings()
    configured_secret = settings.ADMIN_SECRET_KEY.strip()
    if x_admin_secret is not None and x_admin_secret.strip() != "":
        if configured_secret and hmac.compare_digest(
            x_admin_secret.strip().encode("utf-8"),
            configured_secret.encode("utf-8"),
        ):
            return None
        raise forbidden(
            "Mã khóa Chủ hệ thống (X-Admin-Secret) không hợp lệ hoặc chưa được cấu hình trên máy chủ."
        )
    if not user:
        raise unauthorized()
    if user.role != "admin" or user.uid != settings.SEED_ADMIN_UID:
        raise forbidden("Chỉ Chủ hệ thống (Super Admin) mới có quyền phân quyền tài khoản.")
    return user
