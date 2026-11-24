from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ..data_loader import get_characters, get_weapons

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/characters")
async def list_characters() -> list[dict[str, Any]]:
    return get_characters()


@router.get("/weapons")
async def list_weapons() -> list[dict[str, Any]]:
    return get_weapons()
