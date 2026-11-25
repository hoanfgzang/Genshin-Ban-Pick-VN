from __future__ import annotations

from pydantic import ValidationError
import pytest

from app.data_loader import get_weapons
from app.schemas.ruleset import CharacterCustomCost, CostMilestone, CostRules, WeaponCustomCost
from app.services.cost_engine import (
    calc_chamber_scores,
    calc_character_cost,
    calc_cost_penalty_seconds,
    calc_weapon_cost,
    calc_weapon_refinement_seconds,
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

    # Vũ khí 5★ mặc định 1 cost (không đổi theo tinh luyện); 4★ = 0 cost
    assert calc_weapon_cost("amos-bow", rules) == 1.0
    assert calc_weapon_cost("favonius-warbow", rules) == 0.0

    # Tinh luyện vũ khí 5★ mặc định R1..R5 = 0, +5, +10, +15, +20 giây; 4★ = 0s
    assert [calc_weapon_refinement_seconds("amos-bow", r, rules) for r in range(1, 6)] == [
        0.0,
        5.0,
        10.0,
        15.0,
        20.0,
    ]
    assert [calc_weapon_refinement_seconds("favonius-warbow", r, rules) for r in range(1, 6)] == [
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
    ]

    # Tùy chỉnh riêng Cost cơ bản và thời gian tinh luyện từng vũ khí
    weapon_rules = CostRules(
        weapon_cost_overrides={"favonius-warbow": 0.5, "amos-bow": 2.0},
        weapon_refinement_overrides={"amos-bow": [0.0, 10.0, 20.0, 30.0, 40.0]},
    )
    assert calc_weapon_cost("favonius-warbow", weapon_rules) == 0.5
    assert calc_weapon_cost("amos-bow", weapon_rules) == 2.0
    assert calc_weapon_refinement_seconds("amos-bow", 3, weapon_rules) == 20.0


def test_legacy_cost_rules_migration_and_catalog() -> None:
    legacy = CostRules.model_validate(
        {
            "defaultWeapon5Costs": [2.0, 2.5, 3.0, 3.5, 4.0],
            "defaultWeapon4Costs": [0.5, 1.0, 1.5, 2.0, 2.5],
            "defaultWeapon3Costs": [0.0, 0.0, 0.0, 0.0, 0.0],
            "weaponOverrides": {"amos-bow": [1.5, 2.0, 2.5, 3.0, 3.5]},
        }
    )
    assert legacy.default_weapon_5_cost == 2.0
    assert legacy.default_weapon_4_cost == 0.5
    assert legacy.weapon_cost_overrides == {"amos-bow": 1.5}
    assert legacy.default_weapon_5_refinement_seconds == [0.0, 5.0, 10.0, 15.0, 20.0]

    weapons = get_weapons()
    assert len(weapons) > 0
    assert all(w["rarity"] in (4, 5) for w in weapons)
    assert all(int(w["id"]) < 300000 for w in weapons)
    slugs = {w["slug"] for w in weapons}
    assert "serpent-devourer-sublimation" not in slugs
    assert "cool-steel" not in slugs


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


def test_custom_cost_rules_and_calculations() -> None:
    # Ghi chú điều kiện bắt buộc không được trống
    with pytest.raises(ValidationError):
        CharacterCustomCost(id="cc-1", costs=[0, 1, 2, 3, 4, 5, 6], note="   ")
    with pytest.raises(ValidationError):
        WeaponCustomCost(id="wc-1", cost=1.5, refinement_seconds=[0, 0, 0, 0, 0], note="")

    # Không cho phép trùng ID Custom Cost trên cùng nhân vật / vũ khí
    with pytest.raises(ValidationError):
        CostRules(
            character_custom_costs={
                "furina": [
                    CharacterCustomCost(id="cc-1", costs=[2, 3, 4, 5, 6, 7, 8], note="Đi cùng Neuvillette"),
                    CharacterCustomCost(id="cc-1", costs=[1, 2, 3, 4, 5, 6, 7], note="Trùng ID"),
                ]
            }
        )

    rules = CostRules(
        character_custom_costs={
            "bennett": [
                CharacterCustomCost(
                    id="cc-1",
                    costs=[0.5, 0.5, 0.5, 0.5, 0.5, 1.0, 1.5],
                    note="Đi cùng đội hình Mavuika Melt",
                ),
            ]
        },
        weapon_custom_costs={
            "favonius-warbow": [
                WeaponCustomCost(
                    id="wc-1",
                    cost=0.5,
                    refinement_seconds=[0.0, 2.0, 4.0, 6.0, 8.0],
                    note="Trang bị cho Yelan / Furina",
                )
            ]
        },
    )

    assert calc_character_cost("bennett", 6, rules) == 0.0
    assert calc_character_cost("bennett", 6, rules, "cc-1") == 1.5
    assert calc_character_cost("bennett", 6, rules, "unknown-id") == 0.0

    assert calc_weapon_cost("favonius-warbow", rules) == 0.0
    assert calc_weapon_cost("favonius-warbow", rules, "wc-1") == 0.5
    assert calc_weapon_cost("favonius-warbow", rules, "unknown-id") == 0.0

    assert calc_weapon_refinement_seconds("favonius-warbow", 5, rules) == 0.0
    assert calc_weapon_refinement_seconds("favonius-warbow", 5, rules, "wc-1") == 8.0
    assert calc_weapon_refinement_seconds("favonius-warbow", 5, rules, "unknown-id") == 0.0
