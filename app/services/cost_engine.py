from __future__ import annotations

import math

from ..data_loader import get_character, get_weapon
from ..schemas.ruleset import CostRules

CHAMBER_BASE_SECONDS = 540  # Cố định cứng 9:00 mỗi ải


def calc_character_cost(slug: str, constellation: int, cost_rules: CostRules) -> float:
    c = max(0, min(6, int(constellation)))
    override = cost_rules.character_overrides.get(slug)
    if override and len(override) == 7:
        return round(float(override[c]), 2)

    char = get_character(slug)
    rarity = char["rarity"] if char else 5
    table = cost_rules.default_char_5_costs if rarity >= 5 else cost_rules.default_char_4_costs
    return round(float(table[c]), 2)


def calc_weapon_cost(slug: str | None, cost_rules: CostRules) -> float:
    if not slug:
        return 0.0
    if slug in cost_rules.weapon_cost_overrides:
        return round(float(cost_rules.weapon_cost_overrides[slug]), 2)

    weapon = get_weapon(slug)
    rarity = weapon["rarity"] if weapon else 4
    val = cost_rules.default_weapon_5_cost if rarity >= 5 else cost_rules.default_weapon_4_cost
    return round(float(val), 2)


def calc_weapon_refinement_seconds(
    slug: str | None, refinement: int, cost_rules: CostRules
) -> float:
    if not slug:
        return 0.0
    idx = max(0, min(4, int(refinement) - 1))
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
    """Quy đổi tổng Cost thành số giây cộng thêm (điểm phạt ban đầu) theo các mốc."""
    cost = max(0.0, float(total_cost))
    if cost <= 0:
        return 0.0

    if not cost_rules.milestones:
        return round(cost * cost_rules.base_seconds_per_cost, 2)

    milestones = sorted(cost_rules.milestones, key=lambda m: m.min_cost)
    total_seconds = 0.0

    # Phần cost nhỏ hơn min_cost đầu tiên (nếu mốc đầu không bắt đầu từ 0)
    first_min = milestones[0].min_cost
    if first_min > 0:
        under_part = min(cost, first_min)
        total_seconds += under_part * cost_rules.base_seconds_per_cost

    for m in milestones:
        if cost >= m.min_cost and (cost > 0 if m.min_cost == 0 else True):
            total_seconds += m.bonus_seconds
        if cost > m.min_cost:
            upper = m.max_cost if m.max_cost is not None else math.inf
            portion = min(cost, upper) - m.min_cost
            if portion > 0:
                total_seconds += portion * m.seconds_per_cost

    # Nếu cost vượt quá max_cost của mốc cuối cùng mà mốc cuối có max_cost hữu hạn
    last_max = milestones[-1].max_cost
    if last_max is not None and cost > last_max:
        total_seconds += (cost - last_max) * cost_rules.base_seconds_per_cost

    return round(total_seconds, 2)


def calc_chamber_scores(chambers: list[dict[str, int]]) -> tuple[list[int], int]:
    """Mỗi ải cố định lấy 9:00 (540 giây) trừ đi thời gian hoàn thành người chơi nhập."""
    if len(chambers) != 3:
        raise ValueError("Phải nhập đủ thời gian cho đúng 3 ải.")
    diffs: list[int] = []
    for idx, ch in enumerate(chambers, start=1):
        m = int(ch["minutes"])
        s = int(ch["seconds"])
        if m < 0 or m > 9 or s < 0 or s > 59:
            raise ValueError(f"Thời gian ở ải {idx} không hợp lệ.")
        entered = m * 60 + s
        if entered > CHAMBER_BASE_SECONDS:
            raise ValueError(f"Thời gian ở ải {idx} không được vượt quá 09:00.")
        diffs.append(CHAMBER_BASE_SECONDS - entered)
    return diffs, sum(diffs)
