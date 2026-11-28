from __future__ import annotations

from copy import deepcopy
from typing import Any

TRAVELER_ELEMENTS: tuple[str, ...] = (
    "pyro",
    "hydro",
    "anemo",
    "electro",
    "dendro",
    "cryo",
    "geo",
)

TRAVELER_ELEMENT_LABELS: dict[str, str] = {
    "pyro": "Hỏa",
    "hydro": "Thủy",
    "anemo": "Phong",
    "electro": "Lôi",
    "dendro": "Thảo",
    "cryo": "Băng",
    "geo": "Nham",
}

TRAVELER_GENDER_SLUGS: tuple[str, str] = ("traveler-boy", "traveler-girl")
TRAVELER_ELEMENT_SLUGS: tuple[str, ...] = tuple(f"traveler-{el}" for el in TRAVELER_ELEMENTS)
TRAVELER_GENERIC_ALIASES: set[str] = {"traveler", "nha-lu-hanh", "main"}


def is_traveler_gender_slug(slug: str | None) -> bool:
    return bool(slug and slug in TRAVELER_GENDER_SLUGS)


def is_traveler_element_slug(slug: str | None) -> bool:
    return bool(slug and slug in TRAVELER_ELEMENT_SLUGS)


def is_any_traveler_slug(slug: str | None) -> bool:
    return bool(
        slug
        and (
            slug in TRAVELER_GENDER_SLUGS
            or slug in TRAVELER_ELEMENT_SLUGS
            or slug in TRAVELER_GENERIC_ALIASES
            or slug in {"aether", "lumine"}
        )
    )


def get_traveler_element(slug: str | None) -> str | None:
    if not slug or not is_traveler_element_slug(slug):
        return None
    return slug.removeprefix("traveler-")


def build_traveler_element_characters() -> list[dict[str, Any]]:
    """Sinh 7 biến thể Nhà Lữ Hành theo 7 nguyên tố dùng cho tính Cost & Ban/Pick."""
    items: list[dict[str, Any]] = []
    for el in TRAVELER_ELEMENTS:
        label = TRAVELER_ELEMENT_LABELS[el]
        items.append(
            {
                "id": f"traveler-{el}",
                "slug": f"traveler-{el}",
                "name": f"Nhà Lữ Hành ({label})",
                "rarity": 5,
                "element": el,
                "weapon": "sword",
                "region": "mainactor",
                "release": "2020-09-27",
                "icon": "/characters/traveler-boy.png",
                "card": "/character_cards/traveler-boy.webp",
            }
        )
    return items


def _entry_rank(entry: Any) -> tuple[int, int]:
    if isinstance(entry, dict):
        c = int(entry.get("constellation", 0))
        lv = int(entry.get("level", 90))
        return (c, lv)
    c = int(getattr(entry, "constellation", 0))
    lv = int(getattr(entry, "level", 90))
    return (c, lv)


def _with_slug(entry: Any, slug: str) -> Any:
    if isinstance(entry, dict):
        return {
            "slug": slug,
            "constellation": int(entry.get("constellation", 0)),
            "level": int(entry.get("level", 90)),
        }
    if hasattr(entry, "model_copy"):
        return entry.model_copy(update={"slug": slug})
    return entry


def normalize_traveler_inventory_dict(
    chars: dict[str, Any],
    preferred_gender: str | None = None,
) -> dict[str, Any]:
    """Đảm bảo kho nhân vật chỉ sở hữu tối đa 1 trong 2 Nhà Lữ Hành (Nam hoặc Nữ).

    Hỗ trợ alias 'traveler', 'nha-lu-hanh', 'main', 'aether', 'lumine' và tự gộp nếu có cả 2.
    """
    normalized: dict[str, Any] = {}
    traveler_candidates: list[tuple[str, Any]] = []
    explicit_gender: str | None = None

    for raw_slug, entry in chars.items():
        slug = raw_slug.strip().lower()
        if slug in ("traveler-boy", "aether"):
            explicit_gender = explicit_gender or "traveler-boy"
            traveler_candidates.append(("traveler-boy", entry))
        elif slug in ("traveler-girl", "lumine"):
            explicit_gender = explicit_gender or "traveler-girl"
            traveler_candidates.append(("traveler-girl", entry))
        elif slug in TRAVELER_GENERIC_ALIASES:
            traveler_candidates.append(("generic", entry))
        elif is_traveler_element_slug(slug):
            # Không lưu biến thể nguyên tố vào kho tài khoản; bỏ qua
            continue
        else:
            normalized[raw_slug] = entry

    if traveler_candidates:
        # Chọn bản có cung mệnh/level cao nhất
        best_source, best_entry = max(
            traveler_candidates,
            key=lambda pair: (
                _entry_rank(pair[1]),
                1 if pair[0] == preferred_gender else 0,
            ),
        )
        has_boy = any(src == "traveler-boy" for src, _ in traveler_candidates)
        has_girl = any(src == "traveler-girl" for src, _ in traveler_candidates)

        if preferred_gender in TRAVELER_GENDER_SLUGS and (
            not (has_boy ^ has_girl) or best_source == "generic"
        ):
            chosen_gender = preferred_gender
        elif has_boy and not has_girl:
            chosen_gender = "traveler-boy"
        elif has_girl and not has_boy:
            chosen_gender = "traveler-girl"
        elif preferred_gender in TRAVELER_GENDER_SLUGS:
            chosen_gender = preferred_gender
        elif best_source in TRAVELER_GENDER_SLUGS:
            chosen_gender = best_source
        else:
            chosen_gender = "traveler-boy"

        normalized[chosen_gender] = _with_slug(best_entry, chosen_gender)

    return normalized


def migrate_legacy_traveler_cost_dict(
    mapping: dict[str, Any],
    *,
    deep_copy_value: bool = False,
) -> dict[str, Any]:
    """Di trú cấu hình Cost cũ của traveler-boy/traveler-girl sang 7 khóa traveler-<element>."""
    if not isinstance(mapping, dict):
        return mapping
    has_element_key = any(k in mapping for k in TRAVELER_ELEMENT_SLUGS)
    legacy_val = mapping.get("traveler-boy") or mapping.get("traveler-girl")
    out = dict(mapping)
    if not has_element_key and legacy_val is not None:
        for el_slug in TRAVELER_ELEMENT_SLUGS:
            out[el_slug] = deepcopy(legacy_val) if deep_copy_value else list(legacy_val)
    out.pop("traveler-boy", None)
    out.pop("traveler-girl", None)
    return out
