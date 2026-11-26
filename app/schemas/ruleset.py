from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from .auth import CamelModel

TieBreakRule = Literal["none", "lower_cost", "fewer_4star", "lower_cost_then_fewer_4star"]


class DraftStep(CamelModel):
    step: int = Field(ge=1)
    side: Literal["blue", "red"]
    action: Literal["ban", "pick"]
    seconds: int | None = Field(default=None, ge=0, le=600)


class CostMilestone(CamelModel):
    min_cost: float = Field(ge=0)
    max_cost: float | None = None
    seconds_per_cost: float = Field(ge=0)
    bonus_seconds: float = Field(default=0.0, ge=0)

    @model_validator(mode="after")
    def validate_bounds(self) -> CostMilestone:
        if self.max_cost is not None and self.max_cost <= self.min_cost:
            raise ValueError("maxCost phải lớn hơn minCost.")
        return self


def _validate_float_list(vals: list[float], expected_len: int, label: str) -> list[float]:
    if len(vals) != expected_len:
        raise ValueError(f"{label} phải có đúng {expected_len} phần tử.")
    for x in vals:
        if x < 0:
            raise ValueError(f"Giá trị trong {label} không được âm.")
    return [round(float(x), 2) for x in vals]


class CharacterCustomCost(CamelModel):
    id: str = Field(min_length=1, max_length=64)
    costs: list[float]
    note: str = Field(min_length=1, max_length=300)

    @field_validator("id")
    @classmethod
    def check_id(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("ID Custom Cost không được để trống.")
        return cleaned

    @field_validator("costs")
    @classmethod
    def check_costs(cls, v: list[float]) -> list[float]:
        return _validate_float_list(v, 7, "Custom C0–C6")

    @field_validator("note")
    @classmethod
    def check_note(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Ghi chú điều kiện Custom Cost không được để trống.")
        return cleaned


class WeaponCustomCost(CamelModel):
    id: str = Field(min_length=1, max_length=64)
    cost: float = Field(default=0.0, ge=0)
    refinement_seconds: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 0.0, 0.0])
    note: str = Field(min_length=1, max_length=300)

    @field_validator("id")
    @classmethod
    def check_id(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("ID Custom Cost vũ khí không được để trống.")
        return cleaned

    @field_validator("cost")
    @classmethod
    def check_cost(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Giá trị cost vũ khí không được âm.")
        return round(float(v), 2)

    @field_validator("refinement_seconds")
    @classmethod
    def check_ref_seconds(cls, v: list[float]) -> list[float]:
        return _validate_float_list(v, 5, "Custom R1–R5 (giây)")

    @field_validator("note")
    @classmethod
    def check_note(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Ghi chú điều kiện Custom Cost vũ khí không được để trống.")
        return cleaned


class CostRules(CamelModel):
    default_char_5_costs: list[float] = Field(default_factory=lambda: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0])
    default_char_4_costs: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    default_weapon_5_cost: float = Field(default=1.0, ge=0)
    default_weapon_4_cost: float = Field(default=0.0, ge=0)
    default_weapon_5_refinement_seconds: list[float] = Field(default_factory=lambda: [0.0, 5.0, 10.0, 15.0, 20.0])
    default_weapon_4_refinement_seconds: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 0.0, 0.0])
    character_overrides: dict[str, list[float]] = Field(default_factory=dict)
    character_custom_costs: dict[str, list[CharacterCustomCost]] = Field(default_factory=dict)
    weapon_cost_overrides: dict[str, float] = Field(default_factory=dict)
    weapon_refinement_overrides: dict[str, list[float]] = Field(default_factory=dict)
    weapon_custom_costs: dict[str, list[WeaponCustomCost]] = Field(default_factory=dict)
    base_seconds_per_cost: float = Field(default=5.0, ge=0)
    milestones: list[CostMilestone] = Field(default_factory=list)
    draft_bonus_seconds_per_cost: float = Field(default=0.0, ge=0)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_weapon_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "default_weapon_5_cost" not in d and "defaultWeapon5Cost" not in d:
            legacy5 = d.get("defaultWeapon5Costs") if "defaultWeapon5Costs" in d else d.get("default_weapon_5_costs")
            if isinstance(legacy5, list) and len(legacy5) > 0:
                d["defaultWeapon5Cost"] = float(legacy5[0])
        if "default_weapon_4_cost" not in d and "defaultWeapon4Cost" not in d:
            legacy4 = d.get("defaultWeapon4Costs") if "defaultWeapon4Costs" in d else d.get("default_weapon_4_costs")
            if isinstance(legacy4, list) and len(legacy4) > 0:
                d["defaultWeapon4Cost"] = float(legacy4[0])
        if "weapon_cost_overrides" not in d and "weaponCostOverrides" not in d:
            legacy_ov = d.get("weaponOverrides") if "weaponOverrides" in d else d.get("weapon_overrides")
            if isinstance(legacy_ov, dict):
                d["weaponCostOverrides"] = {
                    k: round(float(v[0]), 2)
                    for k, v in legacy_ov.items()
                    if isinstance(v, list) and len(v) > 0
                }
        return d

    @field_validator("default_char_5_costs", "default_char_4_costs")
    @classmethod
    def check_char_costs(cls, v: list[float]) -> list[float]:
        return _validate_float_list(v, 7, "C0–C6")

    @field_validator("default_weapon_5_cost", "default_weapon_4_cost")
    @classmethod
    def check_weapon_base_cost(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Giá trị cost vũ khí không được âm.")
        return round(float(v), 2)

    @field_validator("default_weapon_5_refinement_seconds", "default_weapon_4_refinement_seconds")
    @classmethod
    def check_weapon_refinement_seconds(cls, v: list[float]) -> list[float]:
        return _validate_float_list(v, 5, "R1–R5 (giây)")

    @field_validator("character_overrides")
    @classmethod
    def check_char_overrides(cls, v: dict[str, list[float]]) -> dict[str, list[float]]:
        return {k: _validate_float_list(vals, 7, f"characterOverrides[{k}]") for k, vals in v.items()}

    @field_validator("weapon_cost_overrides")
    @classmethod
    def check_weapon_cost_overrides(cls, v: dict[str, float]) -> dict[str, float]:
        out: dict[str, float] = {}
        for k, val in v.items():
            if val < 0:
                raise ValueError(f"Giá trị trong weaponCostOverrides[{k}] không được âm.")
            out[k] = round(float(val), 2)
        return out

    @field_validator("weapon_refinement_overrides")
    @classmethod
    def check_weapon_refinement_overrides(cls, v: dict[str, list[float]]) -> dict[str, list[float]]:
        return {
            k: _validate_float_list(vals, 5, f"weaponRefinementOverrides[{k}]")
            for k, vals in v.items()
        }

    @field_validator("character_custom_costs")
    @classmethod
    def check_char_custom_costs(
        cls, v: dict[str, list[CharacterCustomCost]]
    ) -> dict[str, list[CharacterCustomCost]]:
        for slug, items in v.items():
            seen: set[str] = set()
            for item in items:
                if item.id in seen:
                    raise ValueError(f"Trùng ID Custom Cost '{item.id}' cho nhân vật {slug}.")
                seen.add(item.id)
        return v

    @field_validator("weapon_custom_costs")
    @classmethod
    def check_weapon_custom_costs(
        cls, v: dict[str, list[WeaponCustomCost]]
    ) -> dict[str, list[WeaponCustomCost]]:
        for slug, items in v.items():
            seen: set[str] = set()
            for item in items:
                if item.id in seen:
                    raise ValueError(f"Trùng ID Custom Cost '{item.id}' cho vũ khí {slug}.")
                seen.add(item.id)
        return v


def split_draft_into_phases(steps: list[DraftStep]) -> list[dict[str, Any]]:
    phases: list[dict[str, Any]] = []
    for s in steps:
        if not phases or (s.action == "ban" and len(phases[-1]["picks"]) > 0):
            phases.append(
                {
                    "phase_number": len(phases) + 1,
                    "bans": [],
                    "picks": [],
                    "blue_bans": 0,
                    "red_bans": 0,
                }
            )
        current = phases[-1]
        if s.action == "ban":
            current["bans"].append(s)
            if s.side == "blue":
                current["blue_bans"] += 1
            else:
                current["red_bans"] += 1
        else:
            current["picks"].append(s)
    return phases


def default_draft_steps() -> list[DraftStep]:
    # Mỗi bên 3 Ban + 8 Pick (tổng 22 bước). Bên Trái (Blue) Ban trước & Pick trước.
    pattern: list[tuple[Literal["blue", "red"], Literal["ban", "pick"]]] = [
        ("blue", "ban"),
        ("red", "ban"),
        ("blue", "ban"),
        ("red", "ban"),
        ("blue", "pick"),
        ("red", "pick"),
        ("red", "pick"),
        ("blue", "pick"),
        ("blue", "pick"),
        ("red", "pick"),
        ("red", "pick"),
        ("blue", "pick"),
        ("blue", "ban"),
        ("red", "ban"),
        ("blue", "pick"),
        ("red", "pick"),
        ("red", "pick"),
        ("blue", "pick"),
        ("blue", "pick"),
        ("red", "pick"),
        ("red", "pick"),
        ("blue", "pick"),
    ]
    return [DraftStep(step=idx + 1, side=side, action=action) for idx, (side, action) in enumerate(pattern)]


class RuleSetConfig(CamelModel):
    draft_steps: list[DraftStep] = Field(default_factory=default_draft_steps)
    allow_duplicate_pick: bool = False
    tie_break_rule: TieBreakRule = "none"
    per_turn_seconds: int = Field(default=45, ge=0, le=600)
    ban_seconds: int = Field(default=45, ge=0, le=600)
    pick_seconds: int = Field(default=45, ge=0, le=600)
    use_reserve_time: bool = False
    reserve_time_seconds: int = Field(default=120, ge=0, le=3600)
    max_overtime_seconds: int = Field(default=600, ge=0, le=3600)
    weapon_phase_seconds: int = Field(default=90, ge=0, le=900)
    chamber_base_seconds: Literal[540] = 540
    cost_rules: CostRules = Field(default_factory=CostRules)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_timer_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        per_turn = d.get("perTurnSeconds", d.get("per_turn_seconds", 45))
        if "ban_seconds" not in d and "banSeconds" not in d:
            d["banSeconds"] = per_turn
        if "pick_seconds" not in d and "pickSeconds" not in d:
            d["pickSeconds"] = per_turn
        if "reserve_time_seconds" not in d and "reserveTimeSeconds" not in d:
            d["reserveTimeSeconds"] = 120
        if "max_overtime_seconds" not in d and "maxOvertimeSeconds" not in d:
            d["maxOvertimeSeconds"] = 600
        return d

    @field_validator("draft_steps")
    @classmethod
    def validate_steps(cls, steps: list[DraftStep]) -> list[DraftStep]:
        if len(steps) < 2:
            raise ValueError("Thứ tự ban/pick phải có ít nhất 2 lượt.")
        blue_picks = sum(1 for s in steps if s.side == "blue" and s.action == "pick")
        red_picks = sum(1 for s in steps if s.side == "red" and s.action == "pick")
        if blue_picks == 0 or red_picks == 0:
            raise ValueError("Mỗi bên phải có ít nhất 1 lượt pick.")
        for phase in split_draft_into_phases(steps):
            if phase["blue_bans"] != phase["red_bans"]:
                raise ValueError(
                    f"Phase {phase['phase_number']}: số lượt Ban của đội Xanh ({phase['blue_bans']}) và đội Đỏ ({phase['red_bans']}) phải bằng nhau."
                )
        return [
            DraftStep(step=idx + 1, side=s.side, action=s.action, seconds=s.seconds)
            for idx, s in enumerate(steps)
        ]


def default_ruleset_config() -> RuleSetConfig:
    return RuleSetConfig(
        draft_steps=default_draft_steps(),
        allow_duplicate_pick=False,
        tie_break_rule="none",
        per_turn_seconds=45,
        ban_seconds=30,
        pick_seconds=45,
        use_reserve_time=True,
        reserve_time_seconds=120,
        max_overtime_seconds=600,
        weapon_phase_seconds=90,
        chamber_base_seconds=540,
        cost_rules=CostRules(
            milestones=[
                CostMilestone(min_cost=0.0, max_cost=6.0, seconds_per_cost=5.0, bonus_seconds=0.0),
                CostMilestone(min_cost=6.0, max_cost=12.0, seconds_per_cost=8.0, bonus_seconds=0.0),
                CostMilestone(min_cost=12.0, max_cost=None, seconds_per_cost=12.0, bonus_seconds=0.0),
            ]
        ),
    )


class RuleSetUpsertRequest(CamelModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=1000)
    is_active: bool = True
    is_default: bool = False
    config: RuleSetConfig


class RuleSetResponse(CamelModel):
    id: str
    name: str
    description: str
    is_active: bool
    is_default: bool
    config: RuleSetConfig
    updated_by: str | None
    updated_at: datetime
