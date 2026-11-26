from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from .auth import CamelModel
from .ruleset import RuleSetConfig

SideName = Literal["blue", "red"]
MatchFormat = Literal["bo1", "bo3"]
MatchStatus = Literal["lobby", "drafting", "weapon_phase", "scoring", "between_games", "finished"]
WinnerSide = Literal["blue", "red", "draw"]
WinReason = Literal["score", "lower_cost", "fewer_4star", "forfeit_timeout", "draw"]


class CreateMatchRequest(CamelModel):
    ruleset_id: str
    format: MatchFormat = "bo1"


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
    character_custom_cost_id: str | None = None
    character_custom_cost_note: str | None = None
    weapon_slug: str | None = None
    refinement: int = 1
    weapon_cost: float = 0.0
    weapon_refinement_seconds: float = 0.0
    weapon_custom_cost_id: str | None = None
    weapon_custom_cost_note: str | None = None
    total_slot_cost: float


class SideOwnedChar(CamelModel):
    slug: str
    constellation: int
    level: int


class UndoRequest(CamelModel):
    requester_side: SideName
    target_step_index: int
    target_step_number: int
    target_action: Literal["ban", "pick"]
    target_character_slug: str | None = None
    steps_to_revert: int
    created_at: str


class SideState(CamelModel):
    player: MatchPlayerInfo | None = None
    ready: bool = False
    owned_characters: dict[str, SideOwnedChar] = Field(default_factory=dict)
    bans: list[str | None] = Field(default_factory=list)
    picks: list[MatchPickSlot] = Field(default_factory=list)
    lineup: list[int] = Field(default_factory=list)
    total_cost: float = 0.0
    cost_penalty_seconds: float = 0.0
    weapon_refinement_seconds: float = 0.0
    reserve_remaining_seconds: float = 0.0
    overtime_penalty_seconds: float = 0.0
    weapons_locked: bool = False
    chambers: list[ChamberTimeInput] | None = None
    chamber_diffs: list[int] | None = None
    chamber_total_seconds: int | None = None
    final_score: float | None = None
    score_submitted: bool = False


class CompletedGameSideSummary(CamelModel):
    side: SideName
    player: MatchPlayerInfo | None = None
    bans: list[str | None] = Field(default_factory=list)
    picks: list[MatchPickSlot] = Field(default_factory=list)
    total_cost: float = 0.0
    cost_penalty_seconds: float = 0.0
    weapon_refinement_seconds: float = 0.0
    reserve_remaining_seconds: float = 0.0
    overtime_penalty_seconds: float = 0.0
    chamber_total_seconds: int | None = None
    final_score: float | None = None
    four_star_count: int = 0


class CompletedGameRecord(CamelModel):
    game_number: int
    blue: CompletedGameSideSummary
    red: CompletedGameSideSummary
    winner_side: WinnerSide
    winner_user_id: str | None = None
    win_reason: WinReason = "score"
    finished_at: str


class NextGameSetup(CamelModel):
    game_number: int
    side_picker_user_id: str | None = None
    auto_swapped: bool = False
    blue_user_id: str | None = None
    red_user_id: str | None = None
    ready_user_ids: list[str] = Field(default_factory=list)


class MatchState(CamelModel):
    code: str
    status: MatchStatus
    ruleset_id: str
    ruleset_name: str
    ruleset: RuleSetConfig
    host_user_id: str
    sides: dict[SideName, SideState]
    current_step_index: int = 0
    hover_character_slug: str | None = None
    turn_deadline_at: str | None = None
    undo_request: UndoRequest | None = None
    winner_side: WinnerSide | None = None
    format: MatchFormat = "bo1"
    max_games: int = 1
    wins_to_win: int = 1
    current_game: int = 1
    series_scores: dict[str, int] = Field(default_factory=dict)
    game_history: list[CompletedGameRecord] = Field(default_factory=list)
    next_game_setup: NextGameSetup | None = None
    winner_user_id: str | None = None
    last_game_win_reason: WinReason | None = None
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
    format: MatchFormat = "bo1"
    current_game: int = 1
    max_games: int = 1
    blue_series_wins: int = 0
    red_series_wins: int = 0
    created_at: datetime
    finished_at: datetime | None
