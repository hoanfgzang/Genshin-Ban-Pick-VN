from __future__ import annotations

import pytest

from app.schemas.ruleset import CostMilestone, CostRules
from app.services.cost_engine import (
    calc_chamber_scores,
    calc_character_cost,
    calc_cost_penalty_seconds,
    calc_weapon_cost,
)


def test_default_character_and_weapon_costs() -> None:
    rules = CostRules()

    # 5★ mặc định C0 = 1, mỗi +1 cung mệnh thêm 1 cost
    assert calc_character_cost("jean", 0, rules) == 1.0
    assert calc_character_cost("jean", 1, rules) == 2.0
    assert calc_character_cost("jean", 6, rules) == 7.0

    # 4★ mặc định 0 cost, nhưng có thể tùy chỉnh số lẻ (vd 0.5)
    assert calc_character_cost("bennett", 6, rules) == 0.0
    rules_with_override = CostRules(
        character_overrides={"bennett": [0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 1.0]}
    )
    assert calc_character_cost("bennett", 5, rules_with_override) == 0.5
    assert calc_character_cost("bennett", 6, rules_with_override) == 1.0

    # Vũ khí 5★ mặc định R1 = 1 cost; 4★ và 3★ = 0 cost
    assert calc_weapon_cost("amos-bow", 1, rules) == 1.0
    assert calc_weapon_cost("amos-bow", 5, rules) == 3.0
    assert calc_weapon_cost("favonius-warbow", 5, rules) == 0.0
    assert calc_weapon_cost("cool-steel", 5, rules) == 0.0


def test_milestone_penalty_seconds() -> None:
    # Mốc bậc thang: 0..6 => 5s/cost; 6..12 => 8s/cost + 10s bonus khi chạm mốc 6
    rules = CostRules(
        base_seconds_per_cost=5.0,
        milestones=[
            CostMilestone(min_cost=0.0, max_cost=6.0, seconds_per_cost=5.0, bonus_seconds=0.0),
            CostMilestone(min_cost=6.0, max_cost=12.0, seconds_per_cost=8.0, bonus_seconds=10.0),
            CostMilestone(min_cost=12.0, max_cost=None, seconds_per_cost=12.0, bonus_seconds=20.0),
        ],
    )
    assert calc_cost_penalty_seconds(0.0, rules) == 0.0
    assert calc_cost_penalty_seconds(4.5, rules) == 22.5
    # 7.5 cost = (6 * 5) + bonus 10 + (1.5 * 8) = 30 + 10 + 12 = 52.0
    assert calc_cost_penalty_seconds(7.5, rules) == 52.0
    # 13.0 cost = (6*5) + (10 + 6*8) + (20 + 1*12) = 30 + 58 + 32 = 120.0
    assert calc_cost_penalty_seconds(13.0, rules) == 120.0


def test_chamber_9_minute_subtraction_math() -> None:
    diffs, total = calc_chamber_scores(
        [
            {"minutes": 8, "seconds": 30},  # 9:00 - 8:30 = 30s
            {"minutes": 7, "seconds": 45},  # 9:00 - 7:45 = 75s
            {"minutes": 9, "seconds": 0},   # 9:00 - 9:00 = 0s
        ]
    )
    assert diffs == [30, 75, 0]
    assert total == 105

    with pytest.raises(ValueError):
        calc_chamber_scores(
            [
                {"minutes": 9, "seconds": 1},
                {"minutes": 8, "seconds": 0},
                {"minutes": 8, "seconds": 0},
            ]
        )
