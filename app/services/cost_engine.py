from __future__ import annotations

import math

from ..data_loader import get_character, get_weapon
from ..schemas.ruleset import CostMilestone, CostRules
from .traveler import TRAVELER_GENDER_SLUGS, is_traveler_element_slug

CHAMBER_BASE_SECONDS = 600  # Cố định cứng 10:00 mỗi ải


def calc_character_cost(
    slug: str,
    constellation: int,
    cost_rules: CostRules,
    custom_cost_id: str | None = None,
) -> float:
    c = max(0, min(6, int(constellation)))
    if custom_cost_id:
        for item in cost_rules.character_custom_costs.get(slug, []):
            if item.id == custom_cost_id and len(item.costs) == 7:
                return round(float(item.costs[c]), 2)

    override = cost_rules.character_overrides.get(slug)
    if override and len(override) == 7:
        return round(float(override[c]), 2)

    if is_traveler_element_slug(slug):
        for legacy_slug in TRAVELER_GENDER_SLUGS:
            legacy_override = cost_rules.character_overrides.get(legacy_slug)
            if legacy_override and len(legacy_override) == 7:
                return round(float(legacy_override[c]), 2)

    char = get_character(slug)
    rarity = char["rarity"] if char else 5
    table = cost_rules.default_char_5_costs if rarity >= 5 else cost_rules.default_char_4_costs
    return round(float(table[c]), 2)


def calc_weapon_cost(
    slug: str | None,
    cost_rules: CostRules,
    custom_cost_id: str | None = None,
) -> float:
    if not slug:
        return 0.0
    if custom_cost_id:
        for item in cost_rules.weapon_custom_costs.get(slug, []):
            if item.id == custom_cost_id:
                return round(float(item.cost), 2)

    if slug in cost_rules.weapon_cost_overrides:
        return round(float(cost_rules.weapon_cost_overrides[slug]), 2)

    weapon = get_weapon(slug)
    rarity = weapon["rarity"] if weapon else 4
    val = cost_rules.default_weapon_5_cost if rarity >= 5 else cost_rules.default_weapon_4_cost
    return round(float(val), 2)


def calc_weapon_refinement_seconds(
    slug: str | None,
    refinement: int,
    cost_rules: CostRules,
    custom_cost_id: str | None = None,
) -> float:
    if not slug:
        return 0.0
    idx = max(0, min(4, int(refinement) - 1))
    if custom_cost_id:
        for item in cost_rules.weapon_custom_costs.get(slug, []):
            if item.id == custom_cost_id and len(item.refinement_seconds) == 5:
                return round(float(item.refinement_seconds[idx]), 2)

    override = cost_rules.weapon_refinement_overrides.get(slug)
    if override and len(override) == 5:
        return round(float(override[idx]), 2)

    weapon = get_weapon(slug)
    rarity = weapon["rarity"] if weapon else 4
    table = (
        cost_rules.default_weapon_5_refinement_seconds
        if rarity >= 5
        else cost_rules.default_weapon_4_refinement_seconds
    )
    return round(float(table[idx]), 2)


def calc_cost_penalty_seconds(total_cost: float, cost_rules: CostRules) -> float:
    """Quy đổi tổng Cost thành số giây phạt bằng cách nhân toàn bộ Cost với hệ số của mốc hiện tại."""
    cost = max(0.0, float(total_cost))
    if cost <= 0:
        return 0.0

    if not cost_rules.milestones:
        return round(cost * cost_rules.base_seconds_per_cost, 2)

    milestones = sorted(cost_rules.milestones, key=lambda m: m.min_cost)
    active: CostMilestone | None = None

    for m in milestones:
        upper = m.max_cost if m.max_cost is not None else math.inf
        if m.min_cost <= cost < upper:
            active = m

    if active is None:
        for m in milestones:
            if m.max_cost is not None and cost == m.max_cost:
                active = m

    if active is None:
        return round(cost * cost_rules.base_seconds_per_cost, 2)

    return round(cost * active.seconds_per_cost + active.bonus_seconds, 2)


def calc_chamber_scores(chambers: list[dict[str, int]]) -> tuple[list[int], int]:
    """Mỗi ải cố định lấy 10:00 (600 giây) trừ đi thời gian hoàn thành người chơi nhập."""
    if len(chambers) != 3:
        raise ValueError("Phải nhập đủ thời gian cho đúng 3 ải.")
    diffs: list[int] = []
    for idx, ch in enumerate(chambers, start=1):
        m = int(ch["minutes"])
        s = int(ch["seconds"])
        if m < 0 or m > 10 or s < 0 or s > 59:
            raise ValueError(f"Thời gian ở ải {idx} không hợp lệ.")
        entered = m * 60 + s
        if entered > CHAMBER_BASE_SECONDS:
            raise ValueError(f"Thời gian ở ải {idx} không được vượt quá 10:00.")
        diffs.append(CHAMBER_BASE_SECONDS - entered)
    return diffs, sum(diffs)
