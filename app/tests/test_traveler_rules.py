from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from app.core.errors import AppError
from app.schemas.match import CompletedGameRecord, CompletedGameSideSummary, MatchPickSlot, SideState
from app.schemas.ruleset import CharacterCustomCost, CostRules, DraftStep, RuleSetConfig
from app.services import draft_engine
from app.services.cost_engine import calc_character_cost
from app.services.traveler import TRAVELER_ELEMENT_SLUGS

CHARS_PATH = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "characters.json"


def _non_traveler_slugs(limit: int = 16) -> list[str]:
    chars = json.loads(CHARS_PATH.read_text(encoding="utf-8"))
    return [c["slug"] for c in chars if c["slug"] not in ("traveler-boy", "traveler-girl")][:limit]


def _make_state(
    *,
    blue_traveler: str | None = "traveler-boy",
    red_traveler: str | None = "traveler-girl",
    allow_duplicate_pick: bool = False,
    match_format: str = "bo1",
    cost_rules: CostRules | None = None,
):
    extra = _non_traveler_slugs(12)
    blue_owned = {
        s: {"constellation": 0, "level": 90} for s in extra[:6]
    }
    red_owned = {
        s: {"constellation": 0, "level": 90} for s in extra[6:12]
    }
    if blue_traveler:
        blue_owned[blue_traveler] = {"constellation": 6, "level": 90}
    if red_traveler:
        red_owned[red_traveler] = {"constellation": 2, "level": 95}

    steps = [
        DraftStep(step=1, side="blue", action="ban"),
        DraftStep(step=2, side="red", action="ban"),
        DraftStep(step=3, side="blue", action="pick"),
        DraftStep(step=4, side="red", action="pick"),
        DraftStep(step=5, side="blue", action="pick"),
        DraftStep(step=6, side="red", action="pick"),
    ]
    ruleset = RuleSetConfig(
        draft_steps=steps,
        allow_duplicate_pick=allow_duplicate_pick,
        cost_rules=cost_rules or CostRules(),
    )
    state = draft_engine.create_initial_match_state(
        code="TRV001",
        ruleset_id="rs-1",
        ruleset_name="Traveler Test",
        ruleset=ruleset,
        host_user_id="u-blue",
        match_format=match_format,  # type: ignore[arg-type]
    )
    state = draft_engine.select_side(
        state,
        user_id="u-blue",
        uid="800000101",
        display_name="Blue",
        owned_characters=blue_owned,
        side="blue",
    )
    state = draft_engine.select_side(
        state,
        user_id="u-red",
        uid="800000102",
        display_name="Red",
        owned_characters=red_owned,
        side="red",
    )
    state = draft_engine.set_ready(state, user_id="u-blue", ready=True)
    state = draft_engine.set_ready(state, user_id="u-red", ready=True)
    return state


def test_inventory_api_enforces_single_traveler_and_generic_alias(test_client: TestClient) -> None:
    reg = test_client.post(
        "/api/auth/register",
        json={"uid": "801111111", "displayName": "Inv Traveler", "password": "Password123"},
    )
    assert reg.status_code == 200
    token = reg.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Gửi cả traveler-boy lẫn traveler-girl -> server chỉ giữ 1 trong 2
    res1 = test_client.put(
        "/api/me/inventory",
        headers=headers,
        json={
            "version": 1,
            "updatedAt": "2026-11-28T00:00:00Z",
            "characters": {
                "traveler-boy": {"slug": "traveler-boy", "constellation": 3, "level": 90},
                "traveler-girl": {"slug": "traveler-girl", "constellation": 6, "level": 95},
            },
        },
    )
    assert res1.status_code == 200
    chars1 = res1.json()["characters"]
    assert len(chars1) == 1
    assert "traveler-girl" in chars1
    assert "traveler-boy" not in chars1

    # Nhập slug chung "traveler" -> giữ nguyên giới tính hiện có trong kho (traveler-girl)
    res2 = test_client.put(
        "/api/me/inventory",
        headers=headers,
        json={
            "version": 1,
            "updatedAt": "2026-11-28T00:00:00Z",
            "characters": {
                "traveler": {"slug": "traveler", "constellation": 6, "level": 100},
            },
        },
    )
    assert res2.status_code == 200
    chars2 = res2.json()["characters"]
    assert list(chars2.keys()) == ["traveler-girl"]
    assert chars2["traveler-girl"]["level"] == 100


def test_seven_elemental_traveler_costs_and_legacy_migration() -> None:
    rules = CostRules(
        character_overrides={
            "traveler-pyro": [1.0, 1.0, 1.5, 1.5, 2.0, 2.0, 3.0],
            "traveler-dendro": [0.0, 0.0, 0.5, 0.5, 0.5, 0.5, 1.0],
            "traveler-hydro": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        },
        character_custom_costs={
            "traveler-pyro": [
                CharacterCustomCost(
                    id="cc-1",
                    costs=[2.0, 2.0, 2.5, 2.5, 3.0, 3.0, 4.0],
                    note="Cầm Sương Mù",
                )
            ]
        },
    )
    assert calc_character_cost("traveler-pyro", 6, rules) == 3.0
    assert calc_character_cost("traveler-pyro", 6, rules, "cc-1") == 4.0
    assert calc_character_cost("traveler-dendro", 6, rules) == 1.0
    assert calc_character_cost("traveler-hydro", 6, rules) == 0.0
    # Hệ chưa override vẫn dùng mặc định 5★
    assert calc_character_cost("traveler-geo", 6, rules) == 7.0

    # Migrate ruleset cũ chỉ có traveler-boy / traveler-girl sang đủ 7 hệ
    migrated = CostRules.model_validate(
        {
            "characterOverrides": {
                "traveler-boy": [0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 1.5],
            },
            "characterCustomCosts": {
                "traveler-girl": [
                    {
                        "id": "cc-1",
                        "costs": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 2.0],
                        "note": "Legacy note",
                    }
                ]
            },
        }
    )
    assert "traveler-boy" not in migrated.character_overrides
    assert "traveler-girl" not in migrated.character_custom_costs
    for el_slug in TRAVELER_ELEMENT_SLUGS:
        assert migrated.character_overrides[el_slug] == [0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 1.5]
        assert migrated.character_custom_costs[el_slug][0].note == "Legacy note"


def test_draft_traveler_ban_and_cross_side_pick_rules() -> None:
    cost_rules = CostRules(
        character_overrides={
            "traveler-pyro": [1.0, 1.0, 1.0, 1.0, 1.0, 2.0, 3.0],
            "traveler-dendro": [0.0, 0.0, 0.0, 0.5, 0.5, 0.5, 1.0],
            "traveler-geo": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5],
        }
    )
    state = _make_state(
        blue_traveler="traveler-boy",
        red_traveler="traveler-girl",
        allow_duplicate_pick=False,
        cost_rules=cost_rules,
    )

    # Từ chối ban/hover chung không chọn hệ
    with pytest.raises(AppError) as err:
        draft_engine.set_draft_hover(state, user_id="u-blue", character_slug="traveler-boy")
    assert err.value.code == "TRAVELER_ELEMENT_REQUIRED"

    with pytest.raises(AppError) as err:
        draft_engine.apply_draft_action(state, user_id="u-blue", character_slug="traveler-girl")
    assert err.value.code == "TRAVELER_ELEMENT_REQUIRED"

    # Blue ban Nhà Lữ Hành hệ Hỏa -> chỉ cấm Hỏa
    state = draft_engine.apply_draft_action(state, user_id="u-blue", character_slug="traveler-pyro")
    assert state.sides["blue"].bans == ["traveler-pyro"]

    # Red ban hệ Thủy
    state = draft_engine.apply_draft_action(state, user_id="u-red", character_slug="traveler-hydro")

    # Blue không pick được hệ Hỏa đã bị Ban
    with pytest.raises(AppError) as err:
        draft_engine.apply_draft_action(state, user_id="u-blue", character_slug="traveler-pyro")
    assert err.value.code == "CHARACTER_BANNED"

    # Blue pick Nhà Lữ Hành hệ Thảo (sở hữu traveler-boy C6 Lv90 -> cost 1.0)
    state = draft_engine.apply_draft_action(state, user_id="u-blue", character_slug="traveler-dendro")
    assert state.sides["blue"].picks[0].character_slug == "traveler-dendro"
    assert state.sides["blue"].picks[0].constellation == 6
    assert state.sides["blue"].picks[0].character_cost == 1.0

    # Red không pick được cùng hệ Thảo khi allow_duplicate_pick=False
    with pytest.raises(AppError) as err:
        draft_engine.apply_draft_action(state, user_id="u-red", character_slug="traveler-dendro")
    assert err.value.code == "ALREADY_PICKED"

    # Red pick Nhà Lữ Hành hệ Nham (khác hệ -> được phép dù allow_duplicate_pick=False!)
    state = draft_engine.apply_draft_action(state, user_id="u-red", character_slug="traveler-geo")
    assert state.sides["red"].picks[0].character_slug == "traveler-geo"
    assert state.sides["red"].picks[0].constellation == 2
    assert state.sides["red"].picks[0].character_cost == 0.0

    # Blue không được pick thêm Nhà Lữ Hành thứ 2 (dù khác hệ) trong cùng 1 ván
    with pytest.raises(AppError) as err:
        draft_engine.apply_draft_action(state, user_id="u-blue", character_slug="traveler-anemo")
    assert err.value.code == "TRAVELER_ALREADY_PICKED_BY_SIDE"


def test_bo3_traveler_locks_only_picked_element_and_timeout_expands_elements() -> None:
    state = _make_state(
        blue_traveler="traveler-boy",
        red_traveler=None,
        match_format="bo3",
    )
    # Giả lập Ván 1 Blue đã pick traveler-pyro
    state.current_game = 2
    state.game_history = [
        CompletedGameRecord(
            game_number=1,
            blue=CompletedGameSideSummary(
                side="blue",
                player=state.sides["blue"].player,
                picks=[
                    MatchPickSlot(
                        slot=0,
                        character_slug="traveler-pyro",
                        constellation=6,
                        level=90,
                        character_cost=1.0,
                        total_slot_cost=1.0,
                    )
                ],
            ),
            red=CompletedGameSideSummary(side="red", player=state.sides["red"].player),
            winner_side="red",
            finished_at="2026-11-28T00:00:00Z",
        )
    ]

    # Bỏ qua 2 lượt Ban
    state = draft_engine.apply_draft_action(state, user_id="u-blue", character_slug=None)
    state = draft_engine.apply_draft_action(state, user_id="u-red", character_slug=None)

    # Ván 2: Blue bị khóa traveler-pyro nhưng vẫn pick được traveler-dendro
    with pytest.raises(AppError) as err:
        draft_engine.apply_draft_action(state, user_id="u-blue", character_slug="traveler-pyro")
    assert err.value.code == "PREVIOUSLY_PICKED"

    state = draft_engine.apply_draft_action(state, user_id="u-blue", character_slug="traveler-dendro")
    assert state.sides["blue"].picks[0].character_slug == "traveler-dendro"

    # Kiểm tra Red (không sở hữu Nhà Lữ Hành) không thể pick
    with pytest.raises(AppError) as err:
        draft_engine.apply_draft_action(state, user_id="u-red", character_slug="traveler-anemo")
    assert err.value.code == "NOT_OWNED"

    # Kiểm tra auto_handle_timeout luôn pick slug hợp lệ (không bao giờ pick traveler-boy)
    solo_state = _make_state(blue_traveler="traveler-boy", red_traveler="traveler-girl")
    solo_state = draft_engine.apply_draft_action(solo_state, user_id="u-blue", character_slug=None)
    solo_state = draft_engine.apply_draft_action(solo_state, user_id="u-red", character_slug=None)
    # Chỉ giữ mỗi traveler-boy trong kho blue để ép auto_handle_timeout chọn Nhà Lữ Hành
    solo_state.sides["blue"].owned_characters = {
        "traveler-boy": solo_state.sides["blue"].owned_characters["traveler-boy"]
    }
    timed_out = draft_engine.auto_handle_timeout(solo_state)
    assert timed_out is not None
    assert timed_out.sides["blue"].picks[0].character_slug in TRAVELER_ELEMENT_SLUGS
