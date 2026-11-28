from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
import random
from typing import Any

from ..core.errors import AppError, bad_request, forbidden
from ..data_loader import get_character, get_character_map, get_weapon
from ..schemas.match import (
    ChamberTimeInput,
    CompletedGameRecord,
    CompletedGameSideSummary,
    MatchFormat,
    MatchPickSlot,
    MatchPlayerInfo,
    MatchState,
    NextGameSetup,
    SideName,
    SideOwnedChar,
    SideState,
    UndoRequest,
    WinReason,
    WinnerSide,
)
from ..schemas.ruleset import DraftStep, RuleSetConfig, TieBreakRule
from .cost_engine import (
    calc_chamber_scores,
    calc_character_cost,
    calc_cost_penalty_seconds,
    calc_weapon_cost,
    calc_weapon_refinement_seconds,
)
from .traveler import (
    TRAVELER_ELEMENT_SLUGS,
    TRAVELER_GENDER_SLUGS,
    TRAVELER_GENERIC_ALIASES,
    is_traveler_element_slug,
    is_traveler_gender_slug,
    normalize_traveler_inventory_dict,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def create_initial_match_state(
    *,
    code: str,
    ruleset_id: str,
    ruleset_name: str,
    ruleset: RuleSetConfig,
    host_user_id: str,
    match_format: MatchFormat = "bo1",
) -> MatchState:
    is_bo3 = match_format == "bo3"
    return MatchState(
        code=code,
        status="lobby",
        ruleset_id=ruleset_id,
        ruleset_name=ruleset_name,
        ruleset=ruleset,
        host_user_id=host_user_id,
        sides={"blue": SideState(), "red": SideState()},
        current_step_index=0,
        turn_deadline_at=None,
        undo_request=None,
        winner_side=None,
        format=match_format,
        max_games=3 if is_bo3 else 1,
        wins_to_win=2 if is_bo3 else 1,
        current_game=1,
        series_scores={},
        game_history=[],
        next_game_setup=None,
        winner_user_id=None,
        last_game_win_reason=None,
        created_at=utc_now().isoformat(),
        finished_at=None,
    )


def _find_user_side(state: MatchState, user_id: str) -> SideName | None:
    for side_name in ("blue", "red"):
        side_key: SideName = side_name
        p = state.sides[side_key].player
        if p and p.user_id == user_id:
            return side_key
    return None


def _required_picks_for_side(ruleset: RuleSetConfig, side: SideName) -> int:
    return sum(1 for s in ruleset.draft_steps if s.side == side and s.action == "pick")


def get_step_seconds(ruleset: RuleSetConfig, step: DraftStep) -> int:
    if step.seconds is not None:
        return step.seconds
    return ruleset.ban_seconds if step.action == "ban" else ruleset.pick_seconds


def _compute_deadline(seconds: int, extra_cost_seconds: float = 0.0) -> str | None:
    if seconds <= 0:
        return None
    total = seconds + max(0, round(extra_cost_seconds))
    return (utc_now() + timedelta(seconds=total)).isoformat()


def _step_deadline_for_index(state: MatchState, step_index: int) -> str | None:
    if not (0 <= step_index < len(state.ruleset.draft_steps)):
        return None
    step = state.ruleset.draft_steps[step_index]
    bonus = state.sides[step.side].total_cost * state.ruleset.cost_rules.draft_bonus_seconds_per_cost
    return _compute_deadline(get_step_seconds(state.ruleset, step), bonus)


def _calc_overtime_seconds(deadline_iso: str | None, now: datetime | None = None) -> int:
    if not deadline_iso:
        return 0
    try:
        deadline = datetime.fromisoformat(deadline_iso)
    except ValueError:
        return 0
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    ref = now or utc_now()
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=timezone.utc)
    elapsed = (ref - deadline).total_seconds()
    if elapsed < 1.0:
        return 0
    return int(math.floor(elapsed))


def is_deadline_expired(deadline_iso: str | None, now: datetime | None = None) -> bool:
    if not deadline_iso:
        return False
    try:
        deadline = datetime.fromisoformat(deadline_iso)
    except ValueError:
        return False
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    ref = now or utc_now()
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=timezone.utc)
    return ref >= deadline


def _consume_draft_turn_overtime(
    side_state: SideState,
    ruleset: RuleSetConfig,
    deadline_iso: str | None,
    now: datetime | None = None,
) -> None:
    overtime = _calc_overtime_seconds(deadline_iso, now)
    if overtime <= 0:
        return
    if ruleset.use_reserve_time:
        available = max(0.0, side_state.reserve_remaining_seconds)
        used = min(available, float(overtime))
        side_state.reserve_remaining_seconds = round(available - used, 2)
        overflow = round(float(overtime) - used, 2)
        if overflow > 0:
            side_state.overtime_penalty_seconds = round(
                side_state.overtime_penalty_seconds + overflow, 2
            )
    else:
        side_state.overtime_penalty_seconds = round(
            side_state.overtime_penalty_seconds + overtime, 2
        )


def _compute_final_score(side: SideState) -> float:
    return round(
        side.cost_penalty_seconds
        + side.weapon_refinement_seconds
        + side.overtime_penalty_seconds
        + (side.chamber_total_seconds or 0),
        2,
    )


def _ensure_lineup(side_state: SideState) -> list[int]:
    n = len(side_state.picks)
    if len(side_state.lineup) != n or set(side_state.lineup) != set(range(n)):
        side_state.lineup = list(range(n))
    return side_state.lineup


def _recalculate_side_costs(side: SideState, ruleset: RuleSetConfig) -> None:
    total = 0.0
    total_ref_sec = 0.0
    for slot in side.picks:
        slot.total_slot_cost = round(slot.character_cost + slot.weapon_cost, 2)
        total += slot.total_slot_cost
        total_ref_sec += slot.weapon_refinement_seconds
    side.total_cost = round(total, 2)
    side.cost_penalty_seconds = calc_cost_penalty_seconds(side.total_cost, ruleset.cost_rules)
    side.weapon_refinement_seconds = round(total_ref_sec, 2)


def _count_four_star_picks(side: SideState) -> int:
    count = 0
    for p in side.picks:
        char_info = get_character(p.character_slug)
        if char_info and char_info.get("rarity") == 4:
            count += 1
    return count


def _previously_picked_slugs_for_user(state: MatchState, user_id: str) -> set[str]:
    if state.format != "bo3" or not user_id:
        return set()
    locked: set[str] = set()
    for game in state.game_history:
        for side_summary in (game.blue, game.red):
            if side_summary.player and side_summary.player.user_id == user_id:
                locked.update(p.character_slug for p in side_summary.picks)
    return locked


def _resolve_game_winner(
    blue: SideState,
    red: SideState,
    tie_break_rule: TieBreakRule,
) -> tuple[WinnerSide, WinReason]:
    b_score = round(blue.final_score or 0.0, 2)
    r_score = round(red.final_score or 0.0, 2)
    if b_score < r_score:
        return ("blue", "score")
    if r_score < b_score:
        return ("red", "score")

    def by_cost() -> tuple[WinnerSide, WinReason] | None:
        b_cost = round(blue.total_cost, 2)
        r_cost = round(red.total_cost, 2)
        if b_cost < r_cost:
            return ("blue", "lower_cost")
        if r_cost < b_cost:
            return ("red", "lower_cost")
        return None

    def by_four_star() -> tuple[WinnerSide, WinReason] | None:
        b_4s = _count_four_star_picks(blue)
        r_4s = _count_four_star_picks(red)
        if b_4s < r_4s:
            return ("blue", "fewer_4star")
        if r_4s < b_4s:
            return ("red", "fewer_4star")
        return None

    if tie_break_rule == "lower_cost":
        res = by_cost()
        if res:
            return res
    elif tie_break_rule == "fewer_4star":
        res = by_four_star()
        if res:
            return res
    elif tie_break_rule == "lower_cost_then_fewer_4star":
        res = by_cost()
        if res:
            return res
        res = by_four_star()
        if res:
            return res

    return ("draw", "draw")


def _build_side_summary(side_name: SideName, side_state: SideState) -> CompletedGameSideSummary:
    return CompletedGameSideSummary(
        side=side_name,
        player=side_state.player.model_copy(deep=True) if side_state.player else None,
        bans=list(side_state.bans),
        picks=[p.model_copy(deep=True) for p in side_state.picks],
        total_cost=side_state.total_cost,
        cost_penalty_seconds=side_state.cost_penalty_seconds,
        weapon_refinement_seconds=side_state.weapon_refinement_seconds,
        reserve_remaining_seconds=side_state.reserve_remaining_seconds,
        overtime_penalty_seconds=side_state.overtime_penalty_seconds,
        chamber_total_seconds=side_state.chamber_total_seconds,
        final_score=side_state.final_score,
        four_star_count=_count_four_star_picks(side_state),
    )


def select_side(
    state: MatchState,
    *,
    user_id: str,
    uid: str,
    display_name: str,
    owned_characters: dict[str, dict[str, Any]],
    side: SideName | None,
) -> MatchState:
    if state.status != "lobby":
        raise bad_request("INVALID_PHASE", "Chỉ có thể đổi bên khi trận đấu đang ở phòng chờ.")

    next_state = state.model_copy(deep=True)
    current_side = _find_user_side(next_state, user_id)

    if side is None:
        if current_side:
            next_state.sides[current_side].player = None
            next_state.sides[current_side].ready = False
            next_state.sides[current_side].owned_characters = {}
        return next_state

    target_player = next_state.sides[side].player
    if target_player and target_player.user_id != user_id:
        raise bad_request("SIDE_TAKEN", "Bên này đã có người chơi khác chọn.")

    if current_side and current_side != side:
        next_state.sides[current_side].player = None
        next_state.sides[current_side].ready = False
        next_state.sides[current_side].owned_characters = {}

    normalized_owned = normalize_traveler_inventory_dict(owned_characters)
    owned_map = {
        slug: SideOwnedChar(
            slug=slug,
            constellation=int(item["constellation"]),
            level=int(item["level"]),
        )
        for slug, item in normalized_owned.items()
        if get_character(slug) is not None and not is_traveler_element_slug(slug)
    }
    next_state.sides[side].player = MatchPlayerInfo(
        user_id=user_id,
        uid=uid,
        display_name=display_name,
        owned_count=len(owned_map),
    )
    next_state.sides[side].owned_characters = owned_map
    if current_side != side:
        next_state.sides[side].ready = False
    return next_state


def refresh_side_inventory(
    state: MatchState,
    *,
    user_id: str,
    owned_characters: dict[str, dict[str, Any]],
) -> MatchState:
    if state.status not in ("lobby", "between_games"):
        return state
    side = _find_user_side(state, user_id)
    if not side:
        return state

    next_state = state.model_copy(deep=True)
    normalized_owned = normalize_traveler_inventory_dict(owned_characters)
    owned_map = {
        slug: SideOwnedChar(
            slug=slug,
            constellation=int(item["constellation"]),
            level=int(item["level"]),
        )
        for slug, item in normalized_owned.items()
        if get_character(slug) is not None and not is_traveler_element_slug(slug)
    }
    next_state.sides[side].owned_characters = owned_map
    if next_state.sides[side].player:
        next_state.sides[side].player.owned_count = len(owned_map)
    return next_state


def choose_next_side(
    state: MatchState,
    *,
    user_id: str,
    user_role: str = "player",
    side: SideName,
) -> MatchState:
    if state.status != "between_games" or state.next_game_setup is None:
        raise bad_request("INVALID_PHASE", "Hiện không ở giai đoạn chọn bên cho ván tiếp theo.")

    setup = state.next_game_setup
    if setup.auto_swapped:
        raise bad_request(
            "AUTO_SWAPPED",
            "Ván trước hòa nên hệ thống tự động đảo bên Xanh ↔ Đỏ cho ván tiếp theo.",
        )

    is_admin = user_role == "admin"
    if not is_admin and user_id != setup.side_picker_user_id:
        raise forbidden("Chỉ người thua ván trước hoặc Admin mới có thể chọn bên cho ván tiếp theo.")

    picker_uid = setup.side_picker_user_id
    b_player = state.sides["blue"].player
    r_player = state.sides["red"].player
    if not b_player or not r_player or not picker_uid:
        raise bad_request("INVALID_STATE", "Thiếu thông tin người chơi trong trận.")

    other_uid = r_player.user_id if b_player.user_id == picker_uid else b_player.user_id

    next_state = state.model_copy(deep=True)
    assert next_state.next_game_setup is not None
    if side == "blue":
        next_state.next_game_setup.blue_user_id = picker_uid
        next_state.next_game_setup.red_user_id = other_uid
    else:
        next_state.next_game_setup.red_user_id = picker_uid
        next_state.next_game_setup.blue_user_id = other_uid
    next_state.next_game_setup.ready_user_ids = []
    return next_state


def set_ready(state: MatchState, *, user_id: str, ready: bool) -> MatchState:
    if state.status == "lobby":
        side = _find_user_side(state, user_id)
        if not side:
            raise forbidden("Bạn cần chọn bên Xanh hoặc Đỏ trước khi sẵn sàng.")

        next_state = state.model_copy(deep=True)
        if ready:
            required = _required_picks_for_side(next_state.ruleset, side)
            owned_count = len(next_state.sides[side].owned_characters)
            if owned_count < required:
                raise bad_request(
                    "NOT_ENOUGH_CHARACTERS",
                    f"Kho của bạn cần tối thiểu {required} nhân vật để thi đấu bộ luật này (hiện có {owned_count}).",
                )

        next_state.sides[side].ready = ready

        if next_state.sides["blue"].player and next_state.sides["red"].player:
            if next_state.sides["blue"].ready and next_state.sides["red"].ready:
                b_uid = next_state.sides["blue"].player.user_id
                r_uid = next_state.sides["red"].player.user_id
                next_state.series_scores = {b_uid: 0, r_uid: 0}
                reserve_init = (
                    float(next_state.ruleset.reserve_time_seconds)
                    if next_state.ruleset.use_reserve_time
                    else 0.0
                )
                next_state.sides["blue"].reserve_remaining_seconds = reserve_init
                next_state.sides["red"].reserve_remaining_seconds = reserve_init
                next_state.status = "drafting"
                next_state.current_step_index = 0
                next_state.hover_character_slug = None
                next_state.turn_deadline_at = _step_deadline_for_index(next_state, 0)
        return next_state

    if state.status == "between_games":
        user_side = _find_user_side(state, user_id)
        if not user_side:
            raise forbidden("Bạn không phải người chơi trong trận này.")

        setup = state.next_game_setup
        if not setup or not setup.blue_user_id or not setup.red_user_id:
            raise bad_request(
                "SIDE_CHOICE_REQUIRED",
                "Đang chờ người thua ván trước chọn bên cho ván tiếp theo.",
            )

        next_side: SideName = "blue" if setup.blue_user_id == user_id else "red"
        next_state = state.model_copy(deep=True)
        assert next_state.next_game_setup is not None
        next_setup = next_state.next_game_setup

        if ready:
            required = _required_picks_for_side(next_state.ruleset, next_side)
            prev_picked = _previously_picked_slugs_for_user(next_state, user_id)
            owned_map = next_state.sides[user_side].owned_characters
            available_count = 0
            counted_traveler = False
            for slug in owned_map:
                if is_traveler_gender_slug(slug):
                    if not counted_traveler and any(
                        el_slug not in prev_picked for el_slug in TRAVELER_ELEMENT_SLUGS
                    ):
                        available_count += 1
                        counted_traveler = True
                elif slug not in prev_picked:
                    available_count += 1
            if available_count < required:
                raise bad_request(
                    "NOT_ENOUGH_CHARACTERS",
                    f"Kho của bạn cần tối thiểu {required} nhân vật chưa dùng ở các ván trước để đấu Ván {next_setup.game_number} (hiện còn {available_count}).",
                )
            if user_id not in next_setup.ready_user_ids:
                next_setup.ready_user_ids.append(user_id)
        else:
            next_setup.ready_user_ids = [uid for uid in next_setup.ready_user_ids if uid != user_id]

        if (
            next_setup.blue_user_id in next_setup.ready_user_ids
            and next_setup.red_user_id in next_setup.ready_user_ids
        ):
            by_uid: dict[str, SideState] = {}
            for s_key in ("blue", "red"):
                key: SideName = s_key
                side_obj = next_state.sides[key]
                if side_obj.player:
                    by_uid[side_obj.player.user_id] = side_obj

            blue_prev = by_uid[next_setup.blue_user_id]
            red_prev = by_uid[next_setup.red_user_id]

            reserve_init = (
                float(next_state.ruleset.reserve_time_seconds)
                if next_state.ruleset.use_reserve_time
                else 0.0
            )
            next_state.sides = {
                "blue": SideState(
                    player=blue_prev.player.model_copy(deep=True) if blue_prev.player else None,
                    ready=True,
                    reserve_remaining_seconds=reserve_init,
                    owned_characters={
                        k: v.model_copy(deep=True) for k, v in blue_prev.owned_characters.items()
                    },
                ),
                "red": SideState(
                    player=red_prev.player.model_copy(deep=True) if red_prev.player else None,
                    ready=True,
                    reserve_remaining_seconds=reserve_init,
                    owned_characters={
                        k: v.model_copy(deep=True) for k, v in red_prev.owned_characters.items()
                    },
                ),
            }
            next_state.current_game = next_setup.game_number
            next_state.next_game_setup = None
            next_state.status = "drafting"
            next_state.current_step_index = 0
            next_state.hover_character_slug = None
            next_state.undo_request = None
            next_state.last_game_win_reason = None
            next_state.turn_deadline_at = _step_deadline_for_index(next_state, 0)

        return next_state

    raise bad_request("INVALID_PHASE", "Trận đấu đã bắt đầu.")


def get_current_step(state: MatchState) -> DraftStep | None:
    if state.status != "drafting":
        return None
    if 0 <= state.current_step_index < len(state.ruleset.draft_steps):
        return state.ruleset.draft_steps[state.current_step_index]
    return None


def _all_banned_slugs(state: MatchState) -> set[str]:
    banned: set[str] = set()
    for side in ("blue", "red"):
        side_key: SideName = side
        for slug in state.sides[side_key].bans:
            if slug:
                banned.add(slug)
    return banned


def _all_picked_slugs(state: MatchState, side: SideName | None = None) -> set[str]:
    if side is not None:
        return {p.character_slug for p in state.sides[side].picks}
    picked: set[str] = set()
    for s in ("blue", "red"):
        s_key: SideName = s
        picked.update(p.character_slug for p in state.sides[s_key].picks)
    return picked


def _get_owned_traveler(side_state: SideState) -> SideOwnedChar | None:
    for gender_slug in TRAVELER_GENDER_SLUGS:
        owned = side_state.owned_characters.get(gender_slug)
        if owned is not None:
            return owned
    return None


def _side_has_picked_traveler(side_state: SideState) -> bool:
    return any(is_traveler_element_slug(p.character_slug) for p in side_state.picks)


def _validate_traveler_selection_slug(character_slug: str) -> None:
    if (
        is_traveler_gender_slug(character_slug)
        or character_slug in TRAVELER_GENERIC_ALIASES
        or character_slug in ("aether", "lumine")
    ):
        raise bad_request(
            "TRAVELER_ELEMENT_REQUIRED",
            "Vui lòng chọn hệ cụ thể cho Nhà Lữ Hành.",
        )


def _finalize_game_result(
    next_state: MatchState,
    game_winner_side: WinnerSide,
    win_reason: WinReason,
) -> None:
    blue = next_state.sides["blue"]
    red = next_state.sides["red"]
    next_state.last_game_win_reason = win_reason
    b_uid = blue.player.user_id if blue.player else ""
    r_uid = red.player.user_id if red.player else ""
    game_winner_uid = (
        b_uid if game_winner_side == "blue" else (r_uid if game_winner_side == "red" else None)
    )

    if next_state.format == "bo1":
        next_state.status = "finished"
        next_state.finished_at = utc_now().isoformat()
        next_state.winner_side = game_winner_side
        next_state.winner_user_id = game_winner_uid
        return

    record = CompletedGameRecord(
        game_number=next_state.current_game,
        blue=_build_side_summary("blue", blue),
        red=_build_side_summary("red", red),
        winner_side=game_winner_side,
        winner_user_id=game_winner_uid,
        win_reason=win_reason,
        finished_at=utc_now().isoformat(),
    )
    next_state.game_history = [
        g for g in next_state.game_history if g.game_number != next_state.current_game
    ] + [record]

    if b_uid and b_uid not in next_state.series_scores:
        next_state.series_scores[b_uid] = 0
    if r_uid and r_uid not in next_state.series_scores:
        next_state.series_scores[r_uid] = 0
    if game_winner_uid:
        next_state.series_scores[game_winner_uid] = (
            next_state.series_scores.get(game_winner_uid, 0) + 1
        )

    b_wins = next_state.series_scores.get(b_uid, 0)
    r_wins = next_state.series_scores.get(r_uid, 0)
    series_done = (
        b_wins >= next_state.wins_to_win
        or r_wins >= next_state.wins_to_win
        or next_state.current_game >= next_state.max_games
    )

    if series_done:
        next_state.status = "finished"
        next_state.finished_at = utc_now().isoformat()
        next_state.next_game_setup = None
        if b_wins > r_wins:
            next_state.winner_side = "blue"
            next_state.winner_user_id = b_uid
        elif r_wins > b_wins:
            next_state.winner_side = "red"
            next_state.winner_user_id = r_uid
        else:
            next_state.winner_side = "draw"
            next_state.winner_user_id = None
    else:
        next_state.status = "between_games"
        next_state.winner_side = None
        next_state.winner_user_id = None
        if game_winner_side == "draw":
            next_state.next_game_setup = NextGameSetup(
                game_number=next_state.current_game + 1,
                side_picker_user_id=None,
                auto_swapped=True,
                blue_user_id=r_uid,
                red_user_id=b_uid,
                ready_user_ids=[],
            )
        else:
            loser_uid = r_uid if game_winner_side == "blue" else b_uid
            next_state.next_game_setup = NextGameSetup(
                game_number=next_state.current_game + 1,
                side_picker_user_id=loser_uid,
                auto_swapped=False,
                blue_user_id=None,
                red_user_id=None,
                ready_user_ids=[],
            )


def get_draft_forfeit_deadline(state: MatchState) -> datetime | None:
    if (
        state.status != "drafting"
        or not state.turn_deadline_at
        or state.ruleset.max_overtime_seconds <= 0
    ):
        return None
    step = get_current_step(state)
    if not step:
        return None
    try:
        deadline = datetime.fromisoformat(state.turn_deadline_at)
    except ValueError:
        return None
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    side_state = state.sides[step.side]
    reserve_sec = (
        max(0.0, side_state.reserve_remaining_seconds)
        if state.ruleset.use_reserve_time
        else 0.0
    )
    remaining_budget = max(
        0.0,
        float(state.ruleset.max_overtime_seconds) - max(0.0, side_state.overtime_penalty_seconds),
    )
    return deadline + timedelta(seconds=reserve_sec + remaining_budget)


def is_draft_forfeit_expired(state: MatchState, now: datetime | None = None) -> bool:
    forfeit_at = get_draft_forfeit_deadline(state)
    if forfeit_at is None:
        return False
    ref = now or utc_now()
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=timezone.utc)
    return ref >= forfeit_at


def forfeit_draft_timeout(state: MatchState) -> MatchState | None:
    if state.status != "drafting" or state.ruleset.max_overtime_seconds <= 0:
        return None
    step = get_current_step(state)
    if not step:
        return None

    next_state = state.model_copy(deep=True)
    losing_side: SideName = step.side
    winning_side: SideName = "red" if losing_side == "blue" else "blue"
    losing_side_state = next_state.sides[losing_side]
    if next_state.ruleset.use_reserve_time:
        losing_side_state.reserve_remaining_seconds = 0.0
    losing_side_state.overtime_penalty_seconds = float(next_state.ruleset.max_overtime_seconds)

    next_state.turn_deadline_at = None
    next_state.undo_request = None
    next_state.hover_character_slug = None
    _finalize_game_result(next_state, winning_side, "forfeit_timeout")
    return next_state


def apply_draft_action(
    state: MatchState,
    *,
    user_id: str,
    character_slug: str | None,
    now: datetime | None = None,
) -> MatchState:
    if state.status != "drafting":
        raise bad_request("INVALID_PHASE", "Không phải giai đoạn Ban/Pick.")

    step = get_current_step(state)
    if not step:
        raise bad_request("DRAFT_COMPLETE", "Đã hoàn thành tất cả lượt Ban/Pick.")

    actor_side = _find_user_side(state, user_id)
    if actor_side != step.side:
        raise forbidden("Chưa tới lượt của bạn.")

    if is_draft_forfeit_expired(state, now):
        forfeited = forfeit_draft_timeout(state)
        if forfeited is not None:
            return forfeited

    next_state = state.model_copy(deep=True)
    side_state = next_state.sides[step.side]

    _consume_draft_turn_overtime(side_state, next_state.ruleset, state.turn_deadline_at, now)
    next_state.undo_request = None
    next_state.hover_character_slug = None

    banned = _all_banned_slugs(next_state)
    all_picked = _all_picked_slugs(next_state)
    own_picked = _all_picked_slugs(next_state, step.side)

    if step.action == "ban":
        if character_slug is not None:
            _validate_traveler_selection_slug(character_slug)
            if not get_character(character_slug):
                raise bad_request("UNKNOWN_CHARACTER", "Nhân vật không tồn tại.")
            if character_slug in banned or character_slug in all_picked:
                raise bad_request("ALREADY_USED", "Nhân vật này đã bị Ban hoặc đã được Pick.")
        side_state.bans.append(character_slug)
    else:
        if not character_slug:
            raise bad_request("PICK_REQUIRED", "Lượt Pick bắt buộc phải chọn một nhân vật.")
        _validate_traveler_selection_slug(character_slug)
        char_info = get_character(character_slug)
        if not char_info:
            raise bad_request("UNKNOWN_CHARACTER", "Nhân vật không tồn tại.")
        if character_slug in banned:
            raise bad_request("CHARACTER_BANNED", "Nhân vật này đã bị Ban.")
        if is_traveler_element_slug(character_slug):
            if _side_has_picked_traveler(side_state):
                raise bad_request(
                    "TRAVELER_ALREADY_PICKED_BY_SIDE",
                    "Mỗi bên chỉ được Pick tối đa 1 Nhà Lữ Hành trong 1 ván.",
                )
        elif character_slug in own_picked:
            raise bad_request("ALREADY_PICKED", "Bạn đã Pick nhân vật này rồi.")
        if not next_state.ruleset.allow_duplicate_pick and character_slug in all_picked:
            raise bad_request("ALREADY_PICKED", "Nhân vật này đã được đối phương Pick.")

        acting_user_id = side_state.player.user_id if side_state.player else user_id
        if character_slug in _previously_picked_slugs_for_user(next_state, acting_user_id):
            raise bad_request(
                "PREVIOUSLY_PICKED",
                "Bạn đã Pick nhân vật này ở ván trước và không thể chọn lại trong chế độ BO3.",
            )

        owned = (
            _get_owned_traveler(side_state)
            if is_traveler_element_slug(character_slug)
            else side_state.owned_characters.get(character_slug)
        )
        if not owned:
            raise bad_request("NOT_OWNED", "Bạn không sở hữu nhân vật này trong kho tài khoản.")

        char_cost = calc_character_cost(
            character_slug,
            owned.constellation,
            next_state.ruleset.cost_rules,
        )
        _ensure_lineup(side_state)
        slot_index = len(side_state.picks)
        side_state.picks.append(
            MatchPickSlot(
                slot=slot_index,
                character_slug=character_slug,
                constellation=owned.constellation,
                level=owned.level,
                character_cost=char_cost,
                weapon_slug=None,
                refinement=1,
                weapon_cost=0.0,
                weapon_refinement_seconds=0.0,
                total_slot_cost=char_cost,
            )
        )
        side_state.lineup.append(slot_index)
        _recalculate_side_costs(side_state, next_state.ruleset)

    next_state.current_step_index += 1
    if next_state.current_step_index >= len(next_state.ruleset.draft_steps):
        next_state.status = "weapon_phase"
        max_cost = max(next_state.sides["blue"].total_cost, next_state.sides["red"].total_cost)
        bonus = max_cost * next_state.ruleset.cost_rules.draft_bonus_seconds_per_cost
        next_state.turn_deadline_at = _compute_deadline(next_state.ruleset.weapon_phase_seconds, bonus)
    else:
        next_state.turn_deadline_at = _step_deadline_for_index(next_state, next_state.current_step_index)

    return next_state


def _revert_last_completed_step(state: MatchState) -> None:
    if state.status == "weapon_phase":
        if not state.ruleset.draft_steps:
            raise bad_request("CANNOT_UNDO", "Chưa có lượt Ban/Pick nào để lùi lại.")
        state.status = "drafting"
        state.sides["blue"].weapons_locked = False
        state.sides["red"].weapons_locked = False
        target_idx = len(state.ruleset.draft_steps) - 1
    elif state.status == "drafting":
        if state.current_step_index <= 0:
            raise bad_request("CANNOT_UNDO", "Chưa có lượt Ban/Pick nào để lùi lại.")
        target_idx = state.current_step_index - 1
    else:
        raise bad_request(
            "INVALID_PHASE",
            "Chỉ có thể lùi lượt trong giai đoạn Ban/Pick hoặc chọn vũ khí.",
        )

    step = state.ruleset.draft_steps[target_idx]
    side_state = state.sides[step.side]
    if step.action == "ban":
        if side_state.bans:
            side_state.bans.pop()
    else:
        if side_state.picks:
            side_state.picks.pop()
            side_state.lineup = [i for i in side_state.lineup if 0 <= i < len(side_state.picks)]
            _ensure_lineup(side_state)
            _recalculate_side_costs(side_state, state.ruleset)

    state.current_step_index = target_idx


def _lookup_step_character_slug(state: MatchState, step_index: int) -> str | None:
    if not (0 <= step_index < len(state.ruleset.draft_steps)):
        return None
    step = state.ruleset.draft_steps[step_index]
    pos = sum(
        1
        for s in state.ruleset.draft_steps[:step_index]
        if s.side == step.side and s.action == step.action
    )
    side_state = state.sides[step.side]
    if step.action == "ban":
        return side_state.bans[pos] if 0 <= pos < len(side_state.bans) else None
    return side_state.picks[pos].character_slug if 0 <= pos < len(side_state.picks) else None


def undo_draft_step(
    state: MatchState,
    *,
    user_id: str,
    user_role: str = "player",
    now: datetime | None = None,
) -> MatchState:
    is_admin = user_role == "admin"
    if is_admin:
        if state.status not in ("drafting", "weapon_phase"):
            raise bad_request(
                "INVALID_PHASE",
                "Chỉ có thể lùi lượt trong giai đoạn Ban/Pick hoặc chọn vũ khí.",
            )
        if state.status == "drafting" and state.current_step_index <= 0:
            raise bad_request("CANNOT_UNDO", "Chưa có lượt Ban/Pick nào để lùi lại.")
        next_state = state.model_copy(deep=True)
    else:
        if state.status != "drafting":
            raise bad_request(
                "INVALID_PHASE",
                "Chỉ Admin mới có thể lùi trực tiếp ngoài giai đoạn Ban/Pick.",
            )
        if state.current_step_index <= 0:
            raise bad_request("CANNOT_UNDO", "Chưa có lượt Ban/Pick nào để lùi lại.")
        current_step = get_current_step(state)
        actor_side = _find_user_side(state, user_id)
        if not current_step or actor_side != current_step.side:
            raise forbidden(
                "Chỉ người đang tới lượt hoặc Admin mới có thể lùi trực tiếp. Hãy dùng nút Xin lùi 1 hành động."
            )
        next_state = state.model_copy(deep=True)
        _consume_draft_turn_overtime(
            next_state.sides[current_step.side],
            next_state.ruleset,
            state.turn_deadline_at,
            now,
        )

    _revert_last_completed_step(next_state)
    next_state.undo_request = None
    next_state.hover_character_slug = None
    next_state.turn_deadline_at = _step_deadline_for_index(next_state, next_state.current_step_index)
    return next_state


def set_draft_hover(
    state: MatchState,
    *,
    user_id: str,
    character_slug: str | None,
) -> MatchState:
    if state.status != "drafting":
        raise bad_request("INVALID_PHASE", "Không phải giai đoạn Ban/Pick.")

    step = get_current_step(state)
    if not step:
        raise bad_request("DRAFT_COMPLETE", "Đã hoàn thành tất cả lượt Ban/Pick.")

    actor_side = _find_user_side(state, user_id)
    if actor_side != step.side:
        raise forbidden("Chưa tới lượt của bạn.")

    if character_slug is not None:
        _validate_traveler_selection_slug(character_slug)
        if not get_character(character_slug):
            raise bad_request("UNKNOWN_CHARACTER", "Nhân vật không tồn tại.")
        banned = _all_banned_slugs(state)
        all_picked = _all_picked_slugs(state)
        own_picked = _all_picked_slugs(state, step.side)
        if step.action == "ban":
            if character_slug in banned or character_slug in all_picked:
                raise bad_request("ALREADY_USED", "Nhân vật này đã bị Ban hoặc đã được Pick.")
        else:
            side_state = state.sides[step.side]
            if character_slug in banned:
                raise bad_request("CHARACTER_BANNED", "Nhân vật này đã bị Ban.")
            if is_traveler_element_slug(character_slug):
                if _side_has_picked_traveler(side_state):
                    raise bad_request(
                        "TRAVELER_ALREADY_PICKED_BY_SIDE",
                        "Mỗi bên chỉ được Pick tối đa 1 Nhà Lữ Hành trong 1 ván.",
                    )
            elif character_slug in own_picked:
                raise bad_request("ALREADY_PICKED", "Bạn đã Pick nhân vật này rồi.")
            if not state.ruleset.allow_duplicate_pick and character_slug in all_picked:
                raise bad_request("ALREADY_PICKED", "Nhân vật này đã được đối phương Pick.")
            acting_user_id = side_state.player.user_id if side_state.player else user_id
            if character_slug in _previously_picked_slugs_for_user(state, acting_user_id):
                raise bad_request(
                    "PREVIOUSLY_PICKED",
                    "Bạn đã Pick nhân vật này ở ván trước và không thể chọn lại trong chế độ BO3.",
                )
            has_owned = (
                _get_owned_traveler(side_state) is not None
                if is_traveler_element_slug(character_slug)
                else character_slug in side_state.owned_characters
            )
            if not has_owned:
                raise bad_request("NOT_OWNED", "Bạn không sở hữu nhân vật này trong kho tài khoản.")

    next_state = state.model_copy(deep=True)
    next_state.hover_character_slug = character_slug
    return next_state


def request_undo(state: MatchState, *, user_id: str) -> MatchState:
    if state.status not in ("drafting", "weapon_phase"):
        raise bad_request(
            "INVALID_PHASE",
            "Chỉ có thể xin lùi trong giai đoạn Ban/Pick hoặc chọn vũ khí.",
        )

    actor_side = _find_user_side(state, user_id)
    if not actor_side:
        raise forbidden("Bạn không phải người chơi trong trận này.")

    if state.undo_request is not None:
        raise bad_request("UNDO_REQUEST_PENDING", "Đang có một yêu cầu xin lùi đang chờ phản hồi.")

    completed_count = (
        state.current_step_index
        if state.status == "drafting"
        else len(state.ruleset.draft_steps)
    )
    target_idx: int | None = None
    for idx in range(completed_count - 1, -1, -1):
        if state.ruleset.draft_steps[idx].side == actor_side:
            target_idx = idx
            break

    if target_idx is None:
        raise bad_request("NO_ACTION_TO_UNDO", "Bạn chưa có hành động Ban/Pick nào để xin lùi.")

    target_step = state.ruleset.draft_steps[target_idx]
    req = UndoRequest(
        requester_side=actor_side,
        target_step_index=target_idx,
        target_step_number=target_step.step,
        target_action=target_step.action,
        target_character_slug=_lookup_step_character_slug(state, target_idx),
        steps_to_revert=completed_count - target_idx,
        created_at=utc_now().isoformat(),
    )
    next_state = state.model_copy(deep=True)
    next_state.undo_request = req
    return next_state


def respond_undo_request(
    state: MatchState,
    *,
    user_id: str,
    user_role: str = "player",
    accept: bool,
) -> MatchState:
    if state.undo_request is None:
        raise bad_request("NO_UNDO_REQUEST", "Không có yêu cầu xin lùi nào đang chờ.")
    if state.status not in ("drafting", "weapon_phase"):
        raise bad_request(
            "INVALID_PHASE",
            "Chỉ có thể phản hồi xin lùi trong giai đoạn Ban/Pick hoặc chọn vũ khí.",
        )

    req = state.undo_request
    opponent_side: SideName = "red" if req.requester_side == "blue" else "blue"
    actor_side = _find_user_side(state, user_id)
    is_admin = user_role == "admin"
    if not is_admin and actor_side != opponent_side:
        raise forbidden("Chỉ đối phương hoặc Admin mới có thể phản hồi yêu cầu xin lùi.")

    next_state = state.model_copy(deep=True)
    next_state.undo_request = None
    if not accept:
        return next_state

    completed_count = (
        next_state.current_step_index
        if next_state.status == "drafting"
        else len(next_state.ruleset.draft_steps)
    )
    if not (0 <= req.target_step_index < completed_count):
        raise bad_request("CANNOT_UNDO", "Không thể lùi về bước đã yêu cầu.")

    for _ in range(completed_count - req.target_step_index):
        _revert_last_completed_step(next_state)

    next_state.hover_character_slug = None
    next_state.turn_deadline_at = _step_deadline_for_index(next_state, next_state.current_step_index)
    return next_state


def cancel_undo_request(
    state: MatchState,
    *,
    user_id: str,
    user_role: str = "player",
) -> MatchState:
    if state.undo_request is None:
        raise bad_request("NO_UNDO_REQUEST", "Không có yêu cầu xin lùi nào đang chờ.")

    actor_side = _find_user_side(state, user_id)
    if user_role != "admin" and actor_side != state.undo_request.requester_side:
        raise forbidden("Chỉ người gửi yêu cầu hoặc Admin mới có thể hủy yêu cầu xin lùi.")

    next_state = state.model_copy(deep=True)
    next_state.undo_request = None
    return next_state


def _resolve_slot_actor(
    state: MatchState,
    *,
    user_id: str,
    user_role: str,
    target_side: SideName | None,
) -> SideName:
    is_admin = user_role == "admin"
    if is_admin and target_side in ("blue", "red"):
        if state.status not in ("drafting", "weapon_phase", "scoring"):
            raise bad_request(
                "INVALID_PHASE",
                "Không thể chỉnh vũ khí hoặc Custom Cost khi trận đấu chưa bắt đầu hoặc đã kết thúc.",
            )
        return target_side

    if state.status not in ("drafting", "weapon_phase"):
        raise bad_request(
            "INVALID_PHASE",
            "Chỉ có thể chỉnh vũ khí hoặc Custom Cost trong lúc Ban/Pick hoặc pha điền vũ khí.",
        )
    found_side = _find_user_side(state, user_id)
    if not found_side:
        raise forbidden("Bạn không phải người chơi trong trận này.")
    return found_side


def set_pick_weapon(
    state: MatchState,
    *,
    user_id: str,
    user_role: str = "player",
    target_side: SideName | None = None,
    slot: int,
    weapon_slug: str | None,
    refinement: int,
    weapon_custom_cost_id: str | None = None,
) -> MatchState:
    is_admin = user_role == "admin"
    side = _resolve_slot_actor(
        state,
        user_id=user_id,
        user_role=user_role,
        target_side=target_side,
    )

    side_state = state.sides[side]
    if side_state.weapons_locked and not is_admin:
        raise bad_request("WEAPONS_LOCKED", "Bạn đã khóa đội hình vũ khí.")
    if slot < 0 or slot >= len(side_state.picks):
        raise bad_request("INVALID_SLOT", "Vị trí nhân vật không hợp lệ.")

    cleaned_slug = weapon_slug.strip() if isinstance(weapon_slug, str) and weapon_slug.strip() else None
    if cleaned_slug is None:
        next_state = state.model_copy(deep=True)
        next_side_state = next_state.sides[side]
        target_pick = next_side_state.picks[slot]
        target_pick.weapon_slug = None
        target_pick.refinement = 1
        target_pick.weapon_custom_cost_id = None
        target_pick.weapon_custom_cost_note = None
        target_pick.weapon_cost = 0.0
        target_pick.weapon_refinement_seconds = 0.0
        _recalculate_side_costs(next_side_state, next_state.ruleset)
        if next_side_state.score_submitted and next_side_state.chamber_total_seconds is not None:
            next_side_state.final_score = _compute_final_score(next_side_state)
        return next_state

    if refinement < 1 or refinement > 5:
        raise bad_request("INVALID_REFINEMENT", "Tinh luyện phải từ R1 đến R5.")

    pick = side_state.picks[slot]
    char_info = get_character(pick.character_slug)
    weapon_info = get_weapon(cleaned_slug)
    if not weapon_info:
        raise bad_request("UNKNOWN_WEAPON", "Vũ khí không tồn tại.")
    if char_info and weapon_info["weaponType"] != char_info["weapon"]:
        raise bad_request(
            "WEAPON_TYPE_MISMATCH",
            f"{char_info['name']} không thể trang bị loại vũ khí này.",
        )

    w_cid = (
        weapon_custom_cost_id.strip()
        if isinstance(weapon_custom_cost_id, str) and weapon_custom_cost_id.strip()
        else None
    )
    w_note: str | None = None
    if w_cid is not None:
        matched_wcc = next(
            (
                item
                for item in state.ruleset.cost_rules.weapon_custom_costs.get(cleaned_slug, [])
                if item.id == w_cid
            ),
            None,
        )
        if not matched_wcc:
            raise bad_request("INVALID_CUSTOM_COST", "Mức Custom Cost vũ khí không tồn tại.")
        w_note = matched_wcc.note

    next_state = state.model_copy(deep=True)
    next_side_state = next_state.sides[side]
    target_pick = next_side_state.picks[slot]
    target_pick.weapon_slug = cleaned_slug
    target_pick.refinement = refinement
    target_pick.weapon_custom_cost_id = w_cid
    target_pick.weapon_custom_cost_note = w_note
    target_pick.weapon_cost = calc_weapon_cost(
        cleaned_slug,
        next_state.ruleset.cost_rules,
        w_cid,
    )
    target_pick.weapon_refinement_seconds = calc_weapon_refinement_seconds(
        cleaned_slug,
        refinement,
        next_state.ruleset.cost_rules,
        w_cid,
    )
    _recalculate_side_costs(next_side_state, next_state.ruleset)
    if next_side_state.score_submitted and next_side_state.chamber_total_seconds is not None:
        next_side_state.final_score = _compute_final_score(next_side_state)
    return next_state


def set_pick_character_custom_cost(
    state: MatchState,
    *,
    user_id: str,
    user_role: str = "player",
    target_side: SideName | None = None,
    slot: int,
    custom_cost_id: str | None,
) -> MatchState:
    is_admin = user_role == "admin"
    side = _resolve_slot_actor(
        state,
        user_id=user_id,
        user_role=user_role,
        target_side=target_side,
    )

    side_state = state.sides[side]
    if side_state.weapons_locked and not is_admin:
        raise bad_request("WEAPONS_LOCKED", "Bạn đã khóa đội hình vũ khí.")
    if slot < 0 or slot >= len(side_state.picks):
        raise bad_request("INVALID_SLOT", "Vị trí nhân vật không hợp lệ.")

    cid = (
        custom_cost_id.strip()
        if isinstance(custom_cost_id, str) and custom_cost_id.strip()
        else None
    )
    pick = side_state.picks[slot]
    c_note: str | None = None
    if cid is not None:
        matched_ccc = next(
            (
                item
                for item in state.ruleset.cost_rules.character_custom_costs.get(
                    pick.character_slug, []
                )
                if item.id == cid
            ),
            None,
        )
        if not matched_ccc:
            raise bad_request("INVALID_CUSTOM_COST", "Mức Custom Cost nhân vật không tồn tại.")
        c_note = matched_ccc.note

    next_state = state.model_copy(deep=True)
    next_side_state = next_state.sides[side]
    target_pick = next_side_state.picks[slot]
    target_pick.character_custom_cost_id = cid
    target_pick.character_custom_cost_note = c_note
    target_pick.character_cost = calc_character_cost(
        target_pick.character_slug,
        target_pick.constellation,
        next_state.ruleset.cost_rules,
        cid,
    )
    _recalculate_side_costs(next_side_state, next_state.ruleset)
    if next_side_state.score_submitted and next_side_state.chamber_total_seconds is not None:
        next_side_state.final_score = _compute_final_score(next_side_state)
    return next_state


def reorder_lineup(
    state: MatchState,
    *,
    user_id: str,
    user_role: str = "player",
    side: SideName,
    order: list[int],
) -> MatchState:
    is_admin = user_role == "admin"
    allowed_phases = (
        ("weapon_phase", "scoring", "finished") if is_admin else ("weapon_phase", "scoring")
    )
    if state.status not in allowed_phases:
        raise bad_request(
            "INVALID_PHASE",
            "Chỉ có thể sắp xếp đội hình sau khi hoàn tất Ban/Pick.",
        )

    if not is_admin:
        actor_side = _find_user_side(state, user_id)
        if actor_side != side:
            raise forbidden("Bạn chỉ có thể điều chỉnh vị trí đội hình bên đội của mình.")

    side_state = state.sides[side]
    n = len(side_state.picks)
    if (
        len(order) != n
        or any(not isinstance(idx, int) or isinstance(idx, bool) for idx in order)
        or set(order) != set(range(n))
    ):
        raise bad_request("INVALID_LINEUP", "Thứ tự vị trí đội hình không hợp lệ.")

    next_state = state.model_copy(deep=True)
    next_state.sides[side].lineup = list(order)
    return next_state


def lock_weapons(
    state: MatchState,
    *,
    user_id: str,
    now: datetime | None = None,
) -> MatchState:
    if state.status != "weapon_phase":
        raise bad_request("INVALID_PHASE", "Chưa tới giai đoạn khóa vũ khí.")

    side = _find_user_side(state, user_id)
    if not side:
        raise forbidden("Bạn không phải người chơi trong trận này.")

    if is_deadline_expired(state.turn_deadline_at, now):
        timed_out = auto_handle_timeout(state)
        if timed_out is not None:
            return timed_out

    next_state = state.model_copy(deep=True)
    side_state = next_state.sides[side]
    for p in side_state.picks:
        if not p.weapon_slug:
            p.weapon_slug = None
            p.refinement = 1
            p.weapon_cost = 0.0
            p.weapon_refinement_seconds = 0.0
            p.weapon_custom_cost_id = None
            p.weapon_custom_cost_note = None
    _recalculate_side_costs(side_state, next_state.ruleset)

    side_state.weapons_locked = True
    if next_state.sides["blue"].weapons_locked and next_state.sides["red"].weapons_locked:
        next_state.status = "scoring"
        next_state.turn_deadline_at = None
        next_state.undo_request = None
    return next_state


def submit_chamber_times(
    state: MatchState,
    *,
    user_id: str,
    user_role: str = "player",
    target_side: SideName | None = None,
    chambers: list[dict[str, int]],
) -> MatchState:
    if state.status != "scoring":
        raise bad_request("INVALID_PHASE", "Trận đấu chưa chuyển sang giai đoạn nhập thời gian 3 ải.")

    is_admin = user_role == "admin"
    actor_side = _find_user_side(state, user_id)
    if not is_admin and not actor_side:
        raise forbidden("Chỉ người chơi trong trận hoặc Admin mới có thể nhập thời gian hoàn thành.")

    if target_side is not None:
        if target_side not in ("blue", "red"):
            raise bad_request("INVALID_SIDE", "Bên chọn phải là Xanh (blue) hoặc Đỏ (red).")
        side: SideName = target_side
    elif actor_side is not None:
        side = actor_side
    else:
        raise bad_request("INVALID_SIDE", "Cần chỉ định bên Xanh (blue) hoặc Đỏ (red) khi nhập thời gian.")

    try:
        validated_inputs = [ChamberTimeInput.model_validate(c) for c in chambers]
        diffs, chamber_total = calc_chamber_scores(
            [{"minutes": c.minutes, "seconds": c.seconds} for c in validated_inputs]
        )
    except Exception as exc:
        raise bad_request("INVALID_CHAMBER_TIMES", str(exc)) from exc

    next_state = state.model_copy(deep=True)
    side_state = next_state.sides[side]
    side_state.chambers = validated_inputs
    side_state.chamber_diffs = diffs
    side_state.chamber_total_seconds = chamber_total
    side_state.final_score = _compute_final_score(side_state)
    side_state.score_submitted = True

    blue = next_state.sides["blue"]
    red = next_state.sides["red"]
    if blue.score_submitted and red.score_submitted:
        game_winner_side, win_reason = _resolve_game_winner(
            blue, red, next_state.ruleset.tie_break_rule
        )
        _finalize_game_result(next_state, game_winner_side, win_reason)

    return next_state


def auto_handle_timeout(state: MatchState) -> MatchState | None:
    """Tự động xử lý khi hết giờ lượt Ban/Pick hoặc hết pha điền vũ khí."""
    if state.status == "drafting":
        step = get_current_step(state)
        if not step:
            return None
        side_state = state.sides[step.side]
        if not side_state.player:
            return None
        user_id = side_state.player.user_id

        if step.action == "ban":
            return apply_draft_action(state, user_id=user_id, character_slug=None)

        banned = _all_banned_slugs(state)
        all_picked = _all_picked_slugs(state)
        own_picked = _all_picked_slugs(state, step.side)
        prev_picked = _previously_picked_slugs_for_user(state, user_id)
        side_has_traveler = _side_has_picked_traveler(side_state)
        candidates: list[str] = []
        for slug in side_state.owned_characters:
            if is_traveler_gender_slug(slug):
                if not side_has_traveler:
                    for el_slug in TRAVELER_ELEMENT_SLUGS:
                        if (
                            el_slug not in banned
                            and el_slug not in prev_picked
                            and (state.ruleset.allow_duplicate_pick or el_slug not in all_picked)
                        ):
                            candidates.append(el_slug)
            elif (
                slug not in banned
                and slug not in own_picked
                and slug not in prev_picked
                and (state.ruleset.allow_duplicate_pick or slug not in all_picked)
            ):
                candidates.append(slug)
        if not candidates:
            # Fallback nếu kho bị thiếu bất thường: lấy bất kỳ nhân vật chưa ban/pick
            candidates = [
                slug
                for slug in get_character_map()
                if not is_traveler_gender_slug(slug)
                and not (side_has_traveler and is_traveler_element_slug(slug))
                and slug not in banned
                and slug not in own_picked
                and slug not in prev_picked
                and (state.ruleset.allow_duplicate_pick or slug not in all_picked)
            ]
        if not candidates:
            return None
        chosen = random.choice(candidates)
        needs_owned_inject = (
            _get_owned_traveler(side_state) is None
            if is_traveler_element_slug(chosen)
            else chosen not in side_state.owned_characters
        )
        if needs_owned_inject:
            # Hiếm gặp: đảm bảo không crash
            temp = state.model_copy(deep=True)
            inject_slug = "traveler-boy" if is_traveler_element_slug(chosen) else chosen
            temp.sides[step.side].owned_characters[inject_slug] = SideOwnedChar(
                slug=inject_slug, constellation=0, level=90
            )
            return apply_draft_action(temp, user_id=user_id, character_slug=chosen)
        return apply_draft_action(state, user_id=user_id, character_slug=chosen)

    if state.status == "weapon_phase":
        next_state = state.model_copy(deep=True)
        for side_key in ("blue", "red"):
            s_key: SideName = side_key
            side_state = next_state.sides[s_key]
            for pick in side_state.picks:
                if not pick.weapon_slug:
                    pick.weapon_slug = None
                    pick.refinement = 1
                    pick.weapon_cost = 0.0
                    pick.weapon_refinement_seconds = 0.0
                    pick.weapon_custom_cost_id = None
                    pick.weapon_custom_cost_note = None
            _recalculate_side_costs(side_state, next_state.ruleset)
            side_state.weapons_locked = True

        next_state.status = "scoring"
        next_state.turn_deadline_at = None
        next_state.undo_request = None
        return next_state

    return None
