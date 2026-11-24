from __future__ import annotations

from datetime import datetime, timedelta, timezone
import random
from typing import Any

from ..core.errors import AppError, bad_request, forbidden
from ..data_loader import get_character, get_character_map, get_weapon, get_weapons
from ..schemas.match import (
    ChamberTimeInput,
    MatchPickSlot,
    MatchPlayerInfo,
    MatchState,
    SideName,
    SideOwnedChar,
    SideState,
)
from ..schemas.ruleset import DraftStep, RuleSetConfig
from .cost_engine import (
    calc_chamber_scores,
    calc_character_cost,
    calc_cost_penalty_seconds,
    calc_weapon_cost,
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
) -> MatchState:
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
        winner_side=None,
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


def _compute_deadline(seconds: int, extra_cost_seconds: float = 0.0) -> str | None:
    if seconds <= 0:
        return None
    total = seconds + max(0, round(extra_cost_seconds))
    return (utc_now() + timedelta(seconds=total)).isoformat()


def _recalculate_side_costs(side: SideState, ruleset: RuleSetConfig) -> None:
    total = 0.0
    for slot in side.picks:
        slot.total_slot_cost = round(slot.character_cost + slot.weapon_cost, 2)
        total += slot.total_slot_cost
    side.total_cost = round(total, 2)
    side.cost_penalty_seconds = calc_cost_penalty_seconds(side.total_cost, ruleset.cost_rules)


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

    owned_map = {
        slug: SideOwnedChar(
            slug=slug,
            constellation=int(item["constellation"]),
            level=int(item["level"]),
        )
        for slug, item in owned_characters.items()
        if get_character(slug) is not None
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
    if state.status != "lobby":
        return state
    side = _find_user_side(state, user_id)
    if not side:
        return state

    next_state = state.model_copy(deep=True)
    owned_map = {
        slug: SideOwnedChar(
            slug=slug,
            constellation=int(item["constellation"]),
            level=int(item["level"]),
        )
        for slug, item in owned_characters.items()
        if get_character(slug) is not None
    }
    next_state.sides[side].owned_characters = owned_map
    if next_state.sides[side].player:
        next_state.sides[side].player.owned_count = len(owned_map)
    return next_state


def set_ready(state: MatchState, *, user_id: str, ready: bool) -> MatchState:
    if state.status != "lobby":
        raise bad_request("INVALID_PHASE", "Trận đấu đã bắt đầu.")

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
            next_state.status = "drafting"
            next_state.current_step_index = 0
            first_step = next_state.ruleset.draft_steps[0]
            bonus = next_state.sides[first_step.side].total_cost * next_state.ruleset.cost_rules.draft_bonus_seconds_per_cost
            next_state.turn_deadline_at = _compute_deadline(next_state.ruleset.per_turn_seconds, bonus)
    return next_state


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


def apply_draft_action(
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

    next_state = state.model_copy(deep=True)
    side_state = next_state.sides[step.side]

    banned = _all_banned_slugs(next_state)
    all_picked = _all_picked_slugs(next_state)
    own_picked = _all_picked_slugs(next_state, step.side)

    if step.action == "ban":
        if character_slug is not None:
            if not get_character(character_slug):
                raise bad_request("UNKNOWN_CHARACTER", "Nhân vật không tồn tại.")
            if character_slug in banned or character_slug in all_picked:
                raise bad_request("ALREADY_USED", "Nhân vật này đã bị Ban hoặc đã được Pick.")
        side_state.bans.append(character_slug)
    else:
        if not character_slug:
            raise bad_request("PICK_REQUIRED", "Lượt Pick bắt buộc phải chọn một nhân vật.")
        char_info = get_character(character_slug)
        if not char_info:
            raise bad_request("UNKNOWN_CHARACTER", "Nhân vật không tồn tại.")
        if character_slug in banned:
            raise bad_request("CHARACTER_BANNED", "Nhân vật này đã bị Ban.")
        if character_slug in own_picked:
            raise bad_request("ALREADY_PICKED", "Bạn đã Pick nhân vật này rồi.")
        if not next_state.ruleset.allow_duplicate_pick and character_slug in all_picked:
            raise bad_request("ALREADY_PICKED", "Nhân vật này đã được đối phương Pick.")

        owned = side_state.owned_characters.get(character_slug)
        if not owned:
            raise bad_request("NOT_OWNED", "Bạn không sở hữu nhân vật này trong kho tài khoản.")

        char_cost = calc_character_cost(
            character_slug,
            owned.constellation,
            next_state.ruleset.cost_rules,
        )
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
                total_slot_cost=char_cost,
            )
        )
        _recalculate_side_costs(side_state, next_state.ruleset)

    next_state.current_step_index += 1
    if next_state.current_step_index >= len(next_state.ruleset.draft_steps):
        next_state.status = "weapon_phase"
        max_cost = max(next_state.sides["blue"].total_cost, next_state.sides["red"].total_cost)
        bonus = max_cost * next_state.ruleset.cost_rules.draft_bonus_seconds_per_cost
        next_state.turn_deadline_at = _compute_deadline(next_state.ruleset.weapon_phase_seconds, bonus)
    else:
        next_step = next_state.ruleset.draft_steps[next_state.current_step_index]
        bonus = (
            next_state.sides[next_step.side].total_cost
            * next_state.ruleset.cost_rules.draft_bonus_seconds_per_cost
        )
        next_state.turn_deadline_at = _compute_deadline(next_state.ruleset.per_turn_seconds, bonus)

    return next_state


def set_pick_weapon(
    state: MatchState,
    *,
    user_id: str,
    slot: int,
    weapon_slug: str,
    refinement: int,
) -> MatchState:
    if state.status not in ("drafting", "weapon_phase"):
        raise bad_request("INVALID_PHASE", "Chỉ có thể chọn vũ khí trong lúc Ban/Pick hoặc pha điền vũ khí.")

    side = _find_user_side(state, user_id)
    if not side:
        raise forbidden("Bạn không phải người chơi trong trận này.")

    side_state = state.sides[side]
    if side_state.weapons_locked:
        raise bad_request("WEAPONS_LOCKED", "Bạn đã khóa đội hình vũ khí.")
    if slot < 0 or slot >= len(side_state.picks):
        raise bad_request("INVALID_SLOT", "Vị trí nhân vật không hợp lệ.")
    if refinement < 1 or refinement > 5:
        raise bad_request("INVALID_REFINEMENT", "Tinh luyện phải từ R1 đến R5.")

    pick = side_state.picks[slot]
    char_info = get_character(pick.character_slug)
    weapon_info = get_weapon(weapon_slug)
    if not weapon_info:
        raise bad_request("UNKNOWN_WEAPON", "Vũ khí không tồn tại.")
    if char_info and weapon_info["weaponType"] != char_info["weapon"]:
        raise bad_request(
            "WEAPON_TYPE_MISMATCH",
            f"{char_info['name']} không thể trang bị loại vũ khí này.",
        )

    next_state = state.model_copy(deep=True)
    target_side = next_state.sides[side]
    target_pick = target_side.picks[slot]
    target_pick.weapon_slug = weapon_slug
    target_pick.refinement = refinement
    target_pick.weapon_cost = calc_weapon_cost(
        weapon_slug,
        refinement,
        next_state.ruleset.cost_rules,
    )
    _recalculate_side_costs(target_side, next_state.ruleset)
    return next_state


def lock_weapons(state: MatchState, *, user_id: str) -> MatchState:
    if state.status != "weapon_phase":
        raise bad_request("INVALID_PHASE", "Chưa tới giai đoạn khóa vũ khí.")

    side = _find_user_side(state, user_id)
    if not side:
        raise forbidden("Bạn không phải người chơi trong trận này.")

    next_state = state.model_copy(deep=True)
    side_state = next_state.sides[side]
    missing = [p.slot + 1 for p in side_state.picks if not p.weapon_slug]
    if missing:
        raise bad_request(
            "MISSING_WEAPONS",
            f"Vui lòng điền đủ vũ khí cho nhân vật (còn thiếu ô: {', '.join(map(str, missing))}).",
        )

    side_state.weapons_locked = True
    if next_state.sides["blue"].weapons_locked and next_state.sides["red"].weapons_locked:
        next_state.status = "scoring"
        next_state.turn_deadline_at = None
    return next_state


def submit_chamber_times(
    state: MatchState,
    *,
    user_id: str,
    chambers: list[dict[str, int]],
) -> MatchState:
    if state.status != "scoring":
        raise bad_request("INVALID_PHASE", "Trận đấu chưa chuyển sang giai đoạn nhập thời gian 3 ải.")

    side = _find_user_side(state, user_id)
    if not side:
        raise forbidden("Bạn không phải người chơi trong trận này.")

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
    side_state.final_score = round(side_state.cost_penalty_seconds + chamber_total, 2)
    side_state.score_submitted = True

    blue = next_state.sides["blue"]
    red = next_state.sides["red"]
    if blue.score_submitted and red.score_submitted:
        next_state.status = "finished"
        next_state.finished_at = utc_now().isoformat()
        b_score = blue.final_score or 0.0
        r_score = red.final_score or 0.0
        if b_score < r_score:
            next_state.winner_side = "blue"
        elif r_score < b_score:
            next_state.winner_side = "red"
        else:
            next_state.winner_side = "draw"

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
        candidates = [
            slug
            for slug in side_state.owned_characters
            if slug not in banned
            and slug not in own_picked
            and (state.ruleset.allow_duplicate_pick or slug not in all_picked)
        ]
        if not candidates:
            # Fallback nếu kho bị thiếu bất thường: lấy bất kỳ nhân vật chưa ban/pick
            candidates = [
                slug
                for slug in get_character_map()
                if slug not in banned and slug not in own_picked
            ]
        if not candidates:
            return None
        chosen = random.choice(candidates)
        if chosen not in side_state.owned_characters:
            # Hiếm gặp: đảm bảo không crash
            temp = state.model_copy(deep=True)
            temp.sides[step.side].owned_characters[chosen] = SideOwnedChar(
                slug=chosen, constellation=0, level=90
            )
            return apply_draft_action(temp, user_id=user_id, character_slug=chosen)
        return apply_draft_action(state, user_id=user_id, character_slug=chosen)

    if state.status == "weapon_phase":
        next_state = state.model_copy(deep=True)
        weapons = get_weapons()
        fallback_by_type: dict[str, str] = {}
        for w in sorted(weapons, key=lambda x: (x["rarity"], x["name"])):
            fallback_by_type.setdefault(w["weaponType"], w["slug"])

        for side_key in ("blue", "red"):
            s_key: SideName = side_key
            side_state = next_state.sides[s_key]
            for pick in side_state.picks:
                if not pick.weapon_slug:
                    char = get_character(pick.character_slug)
                    w_type = char["weapon"] if char else "sword"
                    w_slug = fallback_by_type.get(w_type)
                    if w_slug:
                        pick.weapon_slug = w_slug
                        pick.refinement = 1
                        pick.weapon_cost = calc_weapon_cost(
                            w_slug, 1, next_state.ruleset.cost_rules
                        )
            _recalculate_side_costs(side_state, next_state.ruleset)
            side_state.weapons_locked = True

        next_state.status = "scoring"
        next_state.turn_deadline_at = None
        return next_state

    return None
