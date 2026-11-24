from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.database import get_db
from ..core.deps import require_super_admin_or_secret
from ..core.errors import bad_request, not_found
from ..models.inventory import UserCharacter
from ..models.user import User
from ..schemas.admin_users import (
    AdminUserItem,
    ManagedRole,
    PromoteByUidRequest,
    UpdateUserRoleRequest,
)

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


def _to_admin_user_item(user: User, owned_count: int, seed_uid: str) -> AdminUserItem:
    return AdminUserItem(
        id=user.id,
        uid=user.uid,
        display_name=user.display_name,
        email=user.email,
        role="admin" if user.role == "admin" else "player",
        is_seed_admin=user.uid == seed_uid,
        owned_count=int(owned_count),
        created_at=user.created_at,
    )


async def _count_owned(db: AsyncSession, user_id: str) -> int:
    res = await db.execute(
        select(func.count(UserCharacter.character_slug)).where(UserCharacter.user_id == user_id)
    )
    return int(res.scalar_one() or 0)


async def _change_role(
    db: AsyncSession,
    *,
    target: User,
    new_role: ManagedRole,
    actor: User | None,
) -> AdminUserItem:
    settings = get_settings()
    if actor is not None and target.id == actor.id and new_role != "admin":
        raise bad_request(
            "CANNOT_DEMOTE_SELF",
            "Bạn không thể tự gỡ quyền Admin của chính mình.",
        )
    if target.uid == settings.SEED_ADMIN_UID and new_role != "admin":
        raise bad_request(
            "CANNOT_DEMOTE_SEED_ADMIN",
            "Không thể hạ quyền tài khoản Chủ hệ thống (Admin gốc).",
        )

    if target.role != new_role:
        target.role = new_role
        await db.commit()
        await db.refresh(target)

    owned = await _count_owned(db, target.id)
    return _to_admin_user_item(target, owned, settings.SEED_ADMIN_UID)


@router.get("", response_model=list[AdminUserItem])
async def list_users(
    q: str = Query(default=""),
    role: ManagedRole | None = Query(default=None),
    _actor: User | None = Depends(require_super_admin_or_secret),
    db: AsyncSession = Depends(get_db),
) -> list[AdminUserItem]:
    settings = get_settings()
    owned_col = func.count(UserCharacter.character_slug).label("owned_count")
    stmt = (
        select(User, owned_col)
        .outerjoin(UserCharacter, UserCharacter.user_id == User.id)
        .group_by(User.id)
    )

    search = q.strip()
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                User.uid.ilike(pattern),
                User.display_name.ilike(pattern),
                User.email.ilike(pattern),
            )
        )
    if role is not None:
        stmt = stmt.where(User.role == role)

    priority = case(
        (User.uid == settings.SEED_ADMIN_UID, 0),
        (User.role == "admin", 1),
        else_=2,
    )
    stmt = stmt.order_by(priority.asc(), User.created_at.desc())

    res = await db.execute(stmt)
    return [_to_admin_user_item(u, cnt, settings.SEED_ADMIN_UID) for u, cnt in res.all()]


@router.patch("/{user_id}/role", response_model=AdminUserItem)
async def update_user_role(
    user_id: str,
    body: UpdateUserRoleRequest,
    actor: User | None = Depends(require_super_admin_or_secret),
    db: AsyncSession = Depends(get_db),
) -> AdminUserItem:
    res = await db.execute(select(User).where(User.id == user_id))
    target = res.scalar_one_or_none()
    if not target:
        raise not_found("USER_NOT_FOUND", "Không tìm thấy tài khoản.")
    return await _change_role(db, target=target, new_role=body.role, actor=actor)


@router.post("/by-uid", response_model=AdminUserItem)
async def update_user_role_by_uid(
    body: PromoteByUidRequest,
    actor: User | None = Depends(require_super_admin_or_secret),
    db: AsyncSession = Depends(get_db),
) -> AdminUserItem:
    res = await db.execute(select(User).where(User.uid == body.uid))
    target = res.scalar_one_or_none()
    if not target:
        raise not_found("USER_NOT_FOUND", f"Không tìm thấy tài khoản có UID {body.uid}.")
    return await _change_role(db, target=target, new_role=body.role, actor=actor)
