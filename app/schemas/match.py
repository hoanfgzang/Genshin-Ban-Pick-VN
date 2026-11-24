from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from .auth import CamelModel
from .ruleset import RuleSetConfig

SideName = Literal["blue", "red"]
MatchStatus = Literal["lobby", "drafting", "weapon_phase", "scoring", "finished"]
WinnerSide = Literal["blue", "red", "draw"]


class CreateMatchRequest(CamelModel):
    ruleset_id: str


class ChamberTimeInput(CamelModel):
    minutes: int = Field(ge=0, le=9)
    seconds: int = Field(ge=0, le=59)

    @model_validator(mode="after")
    def check_max_9_min(self) -> ChamberTimeInput:
        if self.minutes * 60 + self.seconds > 540:
            raise ValueError("Thời gian hoàn thành tối đa là 09:00 (540 giây).")
        return self


class MatchPlayerInfo(CamelModel):
    user_id: str
    uid: str
    display_name: str
    owned_count: int


class MatchPickSlot(CamelModel):
    slot: int
    character_slug: str
    constellation: int
    level: int
    character_cost: float
    weapon_slug: str | None = None
    refinement: int = 1
    weapon_cost: float = 0.0
    total_slot_cost: float


class SideOwnedChar(CamelModel):
    slug: str
    constellation: int
    level: int


class SideState(CamelModel):
    player: MatchPlayerInfo | None = None
    ready: bool = False
    owned_characters: dict[str, SideOwnedChar] = Field(default_factory=dict)
    bans: list[str | None] = Field(default_factory=list)
    picks: list[MatchPickSlot] = Field(default_factory=list)
    total_cost: float = 0.0
    cost_penalty_seconds: float = 0.0
    weapons_locked: bool = False
    chambers: list[ChamberTimeInput] | None = None
    chamber_diffs: list[int] | None = None
    chamber_total_seconds: int | None = None
    final_score: float | None = None
    score_submitted: bool = False


class MatchState(CamelModel):
    code: str
    status: MatchStatus
    ruleset_id: str
    ruleset_name: str
    ruleset: RuleSetConfig
    host_user_id: str
    sides: dict[SideName, SideState]
    current_step_index: int = 0
    turn_deadline_at: str | None = None
    winner_side: WinnerSide | None = None
    created_at: str
    finished_at: str | None = None


class MatchSummaryResponse(CamelModel):
    id: str
    code: str
    ruleset_name: str
    status: MatchStatus
    winner_side: WinnerSide | None
    blue_player: MatchPlayerInfo | None
    red_player: MatchPlayerInfo | None
    blue_final_score: float | None
    red_final_score: float | None
    created_at: datetime
    finished_at: datetime | None
