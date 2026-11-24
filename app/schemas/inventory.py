from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from .auth import CamelModel


class OwnedCharacterDTO(CamelModel):
    slug: str = Field(min_length=1, max_length=80)
    constellation: int = Field(ge=0, le=6)
    level: Literal[90, 95, 100]


class InventoryDTO(CamelModel):
    version: Literal[1] = 1
    characters: dict[str, OwnedCharacterDTO] = Field(default_factory=dict)
    updated_at: str

    @field_validator("characters")
    @classmethod
    def validate_keys_match(cls, v: dict[str, OwnedCharacterDTO]) -> dict[str, OwnedCharacterDTO]:
        for k, item in v.items():
            if k != item.slug:
                v[k] = OwnedCharacterDTO(slug=k, constellation=item.constellation, level=item.level)
        return v
