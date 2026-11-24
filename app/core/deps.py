from __future__ import annotations

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
