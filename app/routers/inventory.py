from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.deps import get_current_user
from ..data_loader import get_character_map
from ..models.inventory import UserCharacter
from ..models.user import User
from ..schemas.inventory import InventoryDTO, OwnedCharacterDTO

router = APIRouter(prefix="/api/me/inventory", tags=["inventory"])


async def _load_inventory_dto(db: AsyncSession, user_id: str) -> InventoryDTO:
    res = await db.execute(select(UserCharacter).where(UserCharacter.user_id == user_id))
    rows = res.scalars().all()
    characters: dict[str, OwnedCharacterDTO] = {}
    latest: datetime | None = None

    for row in rows:
        characters[row.character_slug] = OwnedCharacterDTO(
            slug=row.character_slug,
            constellation=row.constellation,
            level=row.level,  # type: ignore[arg-type]
        )
        if latest is None or row.updated_at > latest:
            latest = row.updated_at

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
    known_chars = get_character_map()
    now = datetime.now(timezone.utc)

    await db.execute(delete(UserCharacter).where(UserCharacter.user_id == user.id))
    for slug, entry in body.characters.items():
        if slug not in known_chars:
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
