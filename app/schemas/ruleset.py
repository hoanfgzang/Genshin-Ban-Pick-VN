from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from .auth import CamelModel


class DraftStep(CamelModel):
    step: int = Field(ge=1)
    side: Literal["blue", "red"]
    action: Literal["ban", "pick"]


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
            raise ValueError(f"Giá trị cost trong {label} không được âm.")
    return [round(float(x), 2) for x in vals]


class CostRules(CamelModel):
    default_char_5_costs: list[float] = Field(default_factory=lambda: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0])
    default_char_4_costs: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    default_weapon_5_costs: list[float] = Field(default_factory=lambda: [1.0, 1.5, 2.0, 2.5, 3.0])
    default_weapon_4_costs: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 0.0, 0.0])
    default_weapon_3_costs: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 0.0, 0.0])
    character_overrides: dict[str, list[float]] = Field(default_factory=dict)
    weapon_overrides: dict[str, list[float]] = Field(default_factory=dict)
    base_seconds_per_cost: float = Field(default=5.0, ge=0)
    milestones: list[CostMilestone] = Field(default_factory=list)
    draft_bonus_seconds_per_cost: float = Field(default=0.0, ge=0)

    @field_validator("default_char_5_costs", "default_char_4_costs")
    @classmethod
    def check_char_costs(cls, v: list[float]) -> list[float]:
        return _validate_float_list(v, 7, "C0–C6")

    @field_validator("default_weapon_5_costs", "default_weapon_4_costs", "default_weapon_3_costs")
    @classmethod
    def check_weapon_costs(cls, v: list[float]) -> list[float]:
        return _validate_float_list(v, 5, "R1–R5")

    @field_validator("character_overrides")
    @classmethod
    def check_char_overrides(cls, v: dict[str, list[float]]) -> dict[str, list[float]]:
        return {k: _validate_float_list(vals, 7, f"characterOverrides[{k}]") for k, vals in v.items()}

    @field_validator("weapon_overrides")
    @classmethod
    def check_weapon_overrides(cls, v: dict[str, list[float]]) -> dict[str, list[float]]:
        return {k: _validate_float_list(vals, 5, f"weaponOverrides[{k}]") for k, vals in v.items()}


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
    per_turn_seconds: int = Field(default=45, ge=0, le=600)
    weapon_phase_seconds: int = Field(default=90, ge=0, le=900)
    chamber_base_seconds: Literal[540] = 540
    cost_rules: CostRules = Field(default_factory=CostRules)

    @field_validator("draft_steps")
    @classmethod
    def validate_steps(cls, steps: list[DraftStep]) -> list[DraftStep]:
        if len(steps) < 2:
            raise ValueError("Thứ tự ban/pick phải có ít nhất 2 lượt.")
        blue_picks = sum(1 for s in steps if s.side == "blue" and s.action == "pick")
        red_picks = sum(1 for s in steps if s.side == "red" and s.action == "pick")
        if blue_picks == 0 or red_picks == 0:
            raise ValueError("Mỗi bên phải có ít nhất 1 lượt pick.")
        return [DraftStep(step=idx + 1, side=s.side, action=s.action) for idx, s in enumerate(steps)]


def default_ruleset_config() -> RuleSetConfig:
    return RuleSetConfig(
        draft_steps=default_draft_steps(),
        allow_duplicate_pick=False,
        per_turn_seconds=45,
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
