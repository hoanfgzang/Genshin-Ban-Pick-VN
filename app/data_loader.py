from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from .core.config import WEB_DATA_DIR
from .services.traveler import build_traveler_element_characters


@lru_cache
def get_characters() -> list[dict[str, Any]]:
    path = WEB_DATA_DIR / "characters.json"
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache
def get_traveler_element_characters() -> list[dict[str, Any]]:
    return build_traveler_element_characters()


@lru_cache
def get_character_map() -> dict[str, dict[str, Any]]:
    chars = {c["slug"]: c for c in get_characters()}
    for c in get_traveler_element_characters():
        chars[c["slug"]] = c
    return chars


def get_character(slug: str) -> dict[str, Any] | None:
    return get_character_map().get(slug)


@lru_cache
def get_weapons() -> list[dict[str, Any]]:
    path = WEB_DATA_DIR / "weapons.json"
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache
def get_weapon_map() -> dict[str, dict[str, Any]]:
    return {w["slug"]: w for w in get_weapons()}


def get_weapon(slug: str) -> dict[str, Any] | None:
    return get_weapon_map().get(slug)


def clear_catalog_cache() -> None:
    get_characters.cache_clear()
    get_traveler_element_characters.cache_clear()
    get_character_map.cache_clear()
    get_weapons.cache_clear()
    get_weapon_map.cache_clear()
