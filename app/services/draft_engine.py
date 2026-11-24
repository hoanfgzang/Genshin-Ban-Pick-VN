from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
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
    UndoRequest,
)
from ..schemas.ruleset import DraftStep, RuleSetConfig
from .cost_engine import (
    calc_chamber_scores,
    calc_character_cost,
    calc_cost_penalty_seconds,
    calc_weapon_cost,
    calc_weapon_refinement_seconds,
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
        undo_request=None,
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


def _step_deadline_for_index(state: MatchState, step_index: int) -> str | None:
    if not (0 <= step_index < len(state.ruleset.draft_steps)):
        return None
    step = state.ruleset.draft_steps[step_index]
    bonus = state.sides[step.side].total_cost * state.ruleset.cost_rules.draft_bonus_seconds_per_cost
    return _compute_deadline(state.ruleset.per_turn_seconds, bonus)


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

    next_state = state.model_copy(deep=True)
    side_state = next_state.sides[step.side]

    overtime = _calc_overtime_seconds(state.turn_deadline_at, now)
    if overtime > 0:
        side_state.overtime_penalty_seconds = round(side_state.overtime_penalty_seconds + overtime, 2)
    next_state.undo_request = None

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
        overtime = _calc_overtime_seconds(state.turn_deadline_at, now)
        if overtime > 0:
            side_state = next_state.sides[current_step.side]
            side_state.overtime_penalty_seconds = round(
                side_state.overtime_penalty_seconds + overtime, 2
            )

    _revert_last_completed_step(next_state)
    next_state.undo_request = None
    next_state.turn_deadline_at = _step_deadline_for_index(next_state, next_state.current_step_index)
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


def set_pick_weapon(
    state: MatchState,
    *,
    user_id: str,
    user_role: str = "player",
    target_side: SideName | None = None,
    slot: int,
    weapon_slug: str,
    refinement: int,
) -> MatchState:
    is_admin = user_role == "admin"
    if is_admin and target_side in ("blue", "red"):
        if state.status not in ("drafting", "weapon_phase", "scoring"):
            raise bad_request(
                "INVALID_PHASE",
                "Không thể chỉnh vũ khí khi trận đấu chưa bắt đầu hoặc đã kết thúc.",
            )
        side: SideName = target_side
    else:
        if state.status not in ("drafting", "weapon_phase"):
            raise bad_request(
                "INVALID_PHASE",
                "Chỉ có thể chọn vũ khí trong lúc Ban/Pick hoặc pha điền vũ khí.",
            )
        found_side = _find_user_side(state, user_id)
        if not found_side:
            raise forbidden("Bạn không phải người chơi trong trận này.")
        side = found_side

    side_state = state.sides[side]
    if side_state.weapons_locked and not is_admin:
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
    next_side_state = next_state.sides[side]
    target_pick = next_side_state.picks[slot]
    target_pick.weapon_slug = weapon_slug
    target_pick.refinement = refinement
    target_pick.weapon_cost = calc_weapon_cost(
        weapon_slug,
        next_state.ruleset.cost_rules,
    )
    target_pick.weapon_refinement_seconds = calc_weapon_refinement_seconds(
        weapon_slug,
        refinement,
        next_state.ruleset.cost_rules,
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

    next_state = state.model_copy(deep=True)
    side_state = next_state.sides[side]
    missing = [p.slot + 1 for p in side_state.picks if not p.weapon_slug]
    if missing:
        raise bad_request(
            "MISSING_WEAPONS",
            f"Vui lòng điền đủ vũ khí cho nhân vật (còn thiếu ô: {', '.join(map(str, missing))}).",
        )

    if not side_state.weapons_locked:
        overtime = _calc_overtime_seconds(state.turn_deadline_at, now)
        if overtime > 0:
            side_state.overtime_penalty_seconds = round(
                side_state.overtime_penalty_seconds + overtime, 2
            )

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
    side_state.final_score = _compute_final_score(side_state)
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
                            w_slug, next_state.ruleset.cost_rules
                        )
                        pick.weapon_refinement_seconds = calc_weapon_refinement_seconds(
                            w_slug, 1, next_state.ruleset.cost_rules
                        )
            _recalculate_side_costs(side_state, next_state.ruleset)
            side_state.weapons_locked = True

        next_state.status = "scoring"
        next_state.turn_deadline_at = None
        return next_state

    return None
