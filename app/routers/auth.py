from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.database import get_db
from ..core.deps import get_current_user
from ..core.errors import bad_request, conflict, unauthorized
from ..core.security import create_access_token, hash_password, verify_password
from ..models.user import User
from ..schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_auth_cookie(response: Response, token: str, remember: bool) -> None:
    settings = get_settings()
    max_age = (
        settings.JWT_EXPIRE_HOURS_REMEMBER * 3600
        if remember
        else None
    )
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        max_age=max_age,
        path="/",
    )


def _to_user_response(user: User) -> UserResponse:
    settings = get_settings()
    is_admin = user.role == "admin"
    return UserResponse(
        id=user.id,
        uid=user.uid,
        display_name=user.display_name,
        email=user.email,
        role="admin" if is_admin else "player",
        is_super_admin=is_admin and user.uid == settings.SEED_ADMIN_UID,
        is_guest=False,
        created_at=user.created_at,
    )


@router.get("/config")
async def get_auth_config() -> dict[str, bool]:
    settings = get_settings()
    return {"requireEmail": settings.REQUIRE_EMAIL}


@router.post("/register", response_model=AuthResponse)
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    settings = get_settings()
    if settings.REQUIRE_EMAIL and not body.email:
        raise bad_request("EMAIL_REQUIRED", "Vui lòng nhập email để đăng ký tài khoản.")

    existing_uid = await db.execute(select(User).where(User.uid == body.uid))
    if existing_uid.scalar_one_or_none():
        raise conflict("UID_TAKEN", "UID này đã được đăng ký.")

    if body.email:
        existing_email = await db.execute(select(User).where(User.email == body.email))
        if existing_email.scalar_one_or_none():
            raise conflict("EMAIL_TAKEN", "Email này đã được sử dụng.")

    user = User(
        uid=body.uid,
        display_name=body.display_name,
        email=body.email,
        password_hash=hash_password(body.password),
        role="player",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.role, remember=True)
    _set_auth_cookie(response, token, remember=True)
    return AuthResponse(user=_to_user_response(user), token=token)


@router.post("/login", response_model=AuthResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    res = await db.execute(select(User).where(User.uid == body.uid))
    user = res.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise unauthorized("Sai UID hoặc mật khẩu.")

    token = create_access_token(user.id, user.role, remember=body.remember)
    _set_auth_cookie(response, token, remember=body.remember)
    return AuthResponse(user=_to_user_response(user), token=token)


@router.post("/logout")
async def logout(response: Response) -> dict[str, bool]:
    settings = get_settings()
    response.delete_cookie(key=settings.COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)) -> UserResponse:
    return _to_user_response(user)
