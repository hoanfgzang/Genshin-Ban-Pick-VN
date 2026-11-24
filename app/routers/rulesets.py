from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.deps import require_admin
from ..core.errors import bad_request, not_found
from ..models.ruleset import RuleSet
from ..models.user import User
from ..schemas.ruleset import RuleSetConfig, RuleSetResponse, RuleSetUpsertRequest

router = APIRouter(prefix="/api/rulesets", tags=["rulesets"])


def _to_response(rs: RuleSet) -> RuleSetResponse:
    return RuleSetResponse(
        id=rs.id,
        name=rs.name,
        description=rs.description,
        is_active=rs.is_active,
        is_default=rs.is_default,
        config=RuleSetConfig.model_validate(rs.config_json),
        updated_by=rs.updated_by,
        updated_at=rs.updated_at,
    )


@router.get("", response_model=list[RuleSetResponse])
async def list_rulesets(
    active_only: bool = Query(default=False, alias="activeOnly"),
    db: AsyncSession = Depends(get_db),
) -> list[RuleSetResponse]:
    stmt = select(RuleSet).order_by(RuleSet.is_default.desc(), RuleSet.updated_at.desc())
    if active_only:
        stmt = stmt.where(RuleSet.is_active.is_(True))
    res = await db.execute(stmt)
    return [_to_response(r) for r in res.scalars().all()]


@router.get("/{ruleset_id}", response_model=RuleSetResponse)
async def get_ruleset(
    ruleset_id: str,
    db: AsyncSession = Depends(get_db),
) -> RuleSetResponse:
    res = await db.execute(select(RuleSet).where(RuleSet.id == ruleset_id))
    rs = res.scalar_one_or_none()
    if not rs:
        raise not_found("RULESET_NOT_FOUND", "Không tìm thấy bộ luật.")
    return _to_response(rs)


@router.post("", response_model=RuleSetResponse)
async def create_ruleset(
    body: RuleSetUpsertRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> RuleSetResponse:
    if body.is_default:
        await db.execute(update(RuleSet).values(is_default=False))

    rs = RuleSet(
        name=body.name.strip(),
        description=body.description.strip(),
        is_active=body.is_active,
        is_default=body.is_default,
        config_json=body.config.model_dump(by_alias=True),
        updated_by=admin.id,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(rs)
    await db.commit()
    await db.refresh(rs)
    return _to_response(rs)


@router.put("/{ruleset_id}", response_model=RuleSetResponse)
async def update_ruleset(
    ruleset_id: str,
    body: RuleSetUpsertRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> RuleSetResponse:
    res = await db.execute(select(RuleSet).where(RuleSet.id == ruleset_id))
    rs = res.scalar_one_or_none()
    if not rs:
        raise not_found("RULESET_NOT_FOUND", "Không tìm thấy bộ luật.")

    if body.is_default and not rs.is_default:
        await db.execute(update(RuleSet).values(is_default=False))

    rs.name = body.name.strip()
    rs.description = body.description.strip()
    rs.is_active = body.is_active
    rs.is_default = body.is_default
    rs.config_json = body.config.model_dump(by_alias=True)
    rs.updated_by = admin.id
    rs.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(rs)
    return _to_response(rs)


@router.delete("/{ruleset_id}")
async def delete_ruleset(
    ruleset_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    del admin
    all_res = await db.execute(select(RuleSet))
    all_rulesets = all_res.scalars().all()
    if len(all_rulesets) <= 1:
        raise bad_request("LAST_RULESET", "Không thể xóa bộ luật cuối cùng trong hệ thống.")

    target = next((r for r in all_rulesets if r.id == ruleset_id), None)
    if not target:
        raise not_found("RULESET_NOT_FOUND", "Không tìm thấy bộ luật.")

    was_default = target.is_default
    await db.delete(target)
    if was_default:
        fallback = next((r for r in all_rulesets if r.id != ruleset_id), None)
        if fallback:
            fallback.is_default = True
            fallback.is_active = True

    await db.commit()
    return {"ok": True}
