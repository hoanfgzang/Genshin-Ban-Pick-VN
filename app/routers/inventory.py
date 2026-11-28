from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.deps import get_current_user
from ..data_loader import get_characters
from ..models.inventory import UserCharacter
from ..models.user import User
from ..schemas.inventory import InventoryDTO, OwnedCharacterDTO
from ..services.traveler import TRAVELER_GENDER_SLUGS, normalize_traveler_inventory_dict

router = APIRouter(prefix="/api/me/inventory", tags=["inventory"])


async def _load_inventory_dto(db: AsyncSession, user_id: str) -> InventoryDTO:
    res = await db.execute(select(UserCharacter).where(UserCharacter.user_id == user_id))
    rows = res.scalars().all()
    raw_chars: dict[str, OwnedCharacterDTO] = {}
    latest: datetime | None = None

    for row in rows:
        raw_chars[row.character_slug] = OwnedCharacterDTO(
            slug=row.character_slug,
            constellation=row.constellation,
            level=row.level,  # type: ignore[arg-type]
        )
        if latest is None or row.updated_at > latest:
            latest = row.updated_at

    characters = normalize_traveler_inventory_dict(raw_chars)
    updated_at = (latest or datetime.now(timezone.utc)).isoformat()
    return InventoryDTO(version=1, characters=characters, updated_at=updated_at)


@router.get("", response_model=InventoryDTO)
async def get_my_inventory(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InventoryDTO:
    return await _load_inventory_dto(db, user.id)


@router.put("", response_model=InventoryDTO)
async def save_my_inventory(
    body: InventoryDTO,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InventoryDTO:
    existing_res = await db.execute(
        select(UserCharacter.character_slug).where(UserCharacter.user_id == user.id)
    )
    existing_slugs = {row[0] for row in existing_res.all()}
    preferred_gender = next((s for s in TRAVELER_GENDER_SLUGS if s in existing_slugs), None)

    known_inventory_slugs = {c["slug"] for c in get_characters()}
    normalized_chars = normalize_traveler_inventory_dict(
        body.characters, preferred_gender=preferred_gender
    )
    now = datetime.now(timezone.utc)

    await db.execute(delete(UserCharacter).where(UserCharacter.user_id == user.id))
    for slug, entry in normalized_chars.items():
        if slug not in known_inventory_slugs:
            continue
        db.add(
            UserCharacter(
                user_id=user.id,
                character_slug=slug,
                constellation=entry.constellation,
                level=entry.level,
                updated_at=now,
            )
        )
    await db.commit()
    return await _load_inventory_dto(db, user.id)
