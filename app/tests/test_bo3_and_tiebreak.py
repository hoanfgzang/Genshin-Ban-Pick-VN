from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.schemas.match import MatchPickSlot, SideState
from app.schemas.ruleset import DraftStep, RuleSetConfig, default_ruleset_config
from app.services import draft_engine

CHARS_PATH = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "characters.json"
WEPS_PATH = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "weapons.json"


def _load_catalog() -> tuple[list[dict], dict[str, str]]:
    chars = json.loads(CHARS_PATH.read_text(encoding="utf-8"))
    weps = json.loads(WEPS_PATH.read_text(encoding="utf-8"))
    weapon4_by_type: dict[str, str] = {}
    for w in weps:
        if w["rarity"] == 4 and w["weaponType"] not in weapon4_by_type:
            weapon4_by_type[w["weaponType"]] = w["slug"]
    return chars, weapon4_by_type


def _register_with_inventory(
    client: TestClient,
    uid: str,
    name: str,
    chars: list[dict],
    constellation: int = 0,
    level: int = 90,
) -> tuple[str, str]:
    res = client.post(
        "/api/auth/register",
        json={"uid": uid, "displayName": name, "password": "Password123"},
    )
    assert res.status_code == 200
    data = res.json()
    token = data["token"]
    user_id = data["user"]["id"]
    put_res = client.put(
        "/api/me/inventory",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "version": 1,
            "updatedAt": "2026-11-24T00:00:00Z",
            "characters": {
                c["slug"]: {"slug": c["slug"], "constellation": constellation, "level": level}
                for c in chars
            },
        },
    )
    assert put_res.status_code == 200
    return token, user_id


def _create_custom_ruleset(
    client: TestClient,
    *,
    name: str,
    tie_break_rule: str = "none",
    picks_per_side: int = 2,
    bans_per_side: int = 1,
) -> str:
    settings = get_settings()
    admin_res = client.post(
        "/api/auth/login",
        json={
            "uid": settings.SEED_ADMIN_UID,
            "password": settings.SEED_ADMIN_PASSWORD,
            "remember": True,
        },
    )
    assert admin_res.status_code == 200
    admin_token = admin_res.json()["token"]

    steps: list[dict] = []
    step_no = 1
    for _ in range(bans_per_side):
        steps.append({"step": step_no, "side": "blue", "action": "ban"})
        step_no += 1
        steps.append({"step": step_no, "side": "red", "action": "ban"})
        step_no += 1
    for _ in range(picks_per_side):
        steps.append({"step": step_no, "side": "blue", "action": "pick"})
        step_no += 1
        steps.append({"step": step_no, "side": "red", "action": "pick"})
        step_no += 1

    cfg = default_ruleset_config().model_dump(by_alias=True)
    cfg["draftSteps"] = steps
    cfg["tieBreakRule"] = tie_break_rule

    res = client.post(
        "/api/rulesets",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": name,
            "description": "Test ruleset",
            "isActive": True,
            "isDefault": False,
            "config": cfg,
        },
    )
    assert res.status_code == 200
    return res.json()["id"]


def _play_single_game_over_ws(
    state: dict,
    *,
    ws_by_uid: dict,
    all_chars: list[dict],
    weapon4_by_type: dict[str, str],
    used_by_uid: dict[str, set[str]],
    blue_chambers: list[dict[str, int]],
    red_chambers: list[dict[str, int]],
    ban_slugs: list[str | None] | None = None,
    override_picks_by_uid: dict[str, list[str]] | None = None,
) -> dict:
    def recv_both() -> dict:
        ws_list = list(ws_by_uid.values())
        first = ws_list[0].receive_json()
        for other in ws_list[1:]:
            other.receive_json()
        return first

    ban_queue = list(ban_slugs or [])
    pick_queues = {uid: list(slugs) for uid, slugs in (override_picks_by_uid or {}).items()}

    while state["status"] == "drafting":
        step = state["ruleset"]["draftSteps"][state["currentStepIndex"]]
        side = step["side"]
        actor_uid = state["sides"][side]["player"]["userId"]
        actor_ws = ws_by_uid[actor_uid]

        if step["action"] == "ban":
            chosen: str | None = ban_queue.pop(0) if ban_queue else None
        else:
            already_used_in_game = {
                p["characterSlug"]
                for s in ("blue", "red")
                for p in state["sides"][s]["picks"]
            } | {
                slug
                for s in ("blue", "red")
                for slug in state["sides"][s]["bans"]
                if slug
            }
            if pick_queues.get(actor_uid):
                chosen = pick_queues[actor_uid].pop(0)
            else:
                owned = state["sides"][side]["ownedCharacters"]
                prev_locked = used_by_uid.get(actor_uid, set())
                chosen = next(
                    slug
                    for slug in owned
                    if slug not in already_used_in_game and slug not in prev_locked
                )

        actor_ws.send_json({"action": "draft_pick_or_ban", "characterSlug": chosen})
        state = recv_both()["state"]

    assert state["status"] == "weapon_phase"

    for side_key in ("blue", "red"):
        uid = state["sides"][side_key]["player"]["userId"]
        actor_ws = ws_by_uid[uid]
        for pick in state["sides"][side_key]["picks"]:
            char_obj = next(c for c in all_chars if c["slug"] == pick["characterSlug"])
            actor_ws.send_json(
                {
                    "action": "set_weapon",
                    "slot": pick["slot"],
                    "weaponSlug": weapon4_by_type[char_obj["weapon"]],
                    "refinement": 1,
                }
            )
            state = recv_both()["state"]

    blue_uid = state["sides"]["blue"]["player"]["userId"]
    red_uid = state["sides"]["red"]["player"]["userId"]
    ws_by_uid[blue_uid].send_json({"action": "lock_weapons"})
    state = recv_both()["state"]
    ws_by_uid[red_uid].send_json({"action": "lock_weapons"})
    state = recv_both()["state"]
    assert state["status"] == "scoring"

    ws_by_uid[blue_uid].send_json({"action": "submit_scores", "chambers": blue_chambers})
    state = recv_both()["state"]
    ws_by_uid[red_uid].send_json({"action": "submit_scores", "chambers": red_chambers})
    state = recv_both()["state"]
    return state


def test_bo3_full_3_game_ws_flow_and_cumulative_lockout(test_client: TestClient) -> None:
    all_chars, weapon4_by_type = _load_catalog()
    shared_chars = all_chars[:60]

    token_a, uid_a = _register_with_inventory(
        test_client, "850000001", "Player Alpha", shared_chars, constellation=0, level=90
    )
    token_b, uid_b = _register_with_inventory(
        test_client, "850000002", "Player Beta", shared_chars, constellation=0, level=90
    )

    rs_id = test_client.get("/api/rulesets").json()[0]["id"]
    create_res = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id, "format": "bo3"},
    )
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["format"] == "bo3"
    assert created["maxGames"] == 3
    assert created["winsToWin"] == 2
    code = created["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
    ):
        ws_by_uid = {uid_a: ws_a, uid_b: ws_b}

        def recv_both() -> dict:
            m_a = ws_a.receive_json()
            ws_b.receive_json()
            return m_a

        ws_a.receive_json()
        ws_b.receive_json()

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_both()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_both()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_both()["state"]
        assert state["status"] == "drafting"
        assert state["currentGame"] == 1

        used_by_uid: dict[str, set[str]] = {uid_a: set(), uid_b: set()}
        # Game 1: Alpha (Blue) nhanh hơn Beta (Red) -> Alpha thắng Game 1
        state = _play_single_game_over_ws(
            state,
            ws_by_uid=ws_by_uid,
            all_chars=all_chars,
            weapon4_by_type=weapon4_by_type,
            used_by_uid=used_by_uid,
            blue_chambers=[{"minutes": 8, "seconds": 30}] * 3,
            red_chambers=[{"minutes": 7, "seconds": 0}] * 3,
        )

        assert state["status"] == "between_games"
        assert state["seriesScores"] == {uid_a: 1, uid_b: 0}
        assert len(state["gameHistory"]) == 1
        assert state["nextGameSetup"]["gameNumber"] == 2
        assert state["nextGameSetup"]["sidePickerUserId"] == uid_b
        assert state["nextGameSetup"]["autoSwapped"] is False

        g1_a_picks = [p["characterSlug"] for p in state["gameHistory"][0]["blue"]["picks"]]
        g1_b_picks = [p["characterSlug"] for p in state["gameHistory"][0]["red"]["picks"]]
        used_by_uid[uid_a].update(g1_a_picks)
        used_by_uid[uid_b].update(g1_b_picks)

        # Winner Alpha không được phép chọn bên
        ws_a.send_json({"action": "choose_next_side", "side": "blue"})
        err_winner = ws_a.receive_json()
        assert err_winner["type"] == "match:error"
        assert err_winner["code"] == "FORBIDDEN"

        # Không được sẵn sàng trước khi người thua chọn bên
        ws_b.send_json({"action": "set_ready", "ready": True})
        err_no_side = ws_b.receive_json()
        assert err_no_side["type"] == "match:error"
        assert err_no_side["code"] == "SIDE_CHOICE_REQUIRED"

        # Người thua Beta chọn Bên Xanh (đi trước) cho Game 2 -> đảo bên!
        ws_b.send_json({"action": "choose_next_side", "side": "blue"})
        state = recv_both()["state"]
        assert state["nextGameSetup"]["blueUserId"] == uid_b
        assert state["nextGameSetup"]["redUserId"] == uid_a

        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_both()["state"]
        assert state["status"] == "drafting"
        assert state["currentGame"] == 2
        assert state["sides"]["blue"]["player"]["userId"] == uid_b
        assert state["sides"]["red"]["player"]["userId"] == uid_a

        # Game 2 Step 0 (Blue = Beta ban): được phép Ban nhân vật Beta đã pick ở Game 1
        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": g1_b_picks[0]})
        state = recv_both()["state"]
        # Step 1 (Red = Alpha ban): bỏ qua, Step 2 & 3 (ban): bỏ qua
        for step_idx in (1, 2, 3):
            step = state["ruleset"]["draftSteps"][step_idx]
            ws_by_uid[state["sides"][step["side"]]["player"]["userId"]].send_json(
                {"action": "draft_pick_or_ban", "characterSlug": None}
            )
            state = recv_both()["state"]

        # Step 4 (Blue = Beta pick #1):
        # 1) Thử pick lại nhân vật chính Beta đã pick ở Game 1 -> PREVIOUSLY_PICKED
        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": g1_b_picks[1]})
        err_prev = ws_b.receive_json()
        assert err_prev["type"] == "match:error"
        assert err_prev["code"] == "PREVIOUSLY_PICKED"

        # 2) Pick nhân vật mà đối thủ Alpha đã pick ở Game 1 -> thành công!
        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": g1_a_picks[0]})
        state = recv_both()["state"]
        assert state["sides"]["blue"]["picks"][0]["characterSlug"] == g1_a_picks[0]

        # Hoàn tất phần còn lại của Game 2: Beta (hiện tại là Blue) thắng -> 1-1
        state = _play_single_game_over_ws(
            state,
            ws_by_uid=ws_by_uid,
            all_chars=all_chars,
            weapon4_by_type=weapon4_by_type,
            used_by_uid=used_by_uid,
            blue_chambers=[{"minutes": 8, "seconds": 30}] * 3,
            red_chambers=[{"minutes": 7, "seconds": 0}] * 3,
        )
        assert state["status"] == "between_games"
        assert state["seriesScores"] == {uid_a: 1, uid_b: 1}
        assert state["nextGameSetup"]["sidePickerUserId"] == uid_a

        g2_b_picks = [p["characterSlug"] for p in state["gameHistory"][1]["blue"]["picks"]]
        g2_a_picks = [p["characterSlug"] for p in state["gameHistory"][1]["red"]["picks"]]
        used_by_uid[uid_b].update(g2_b_picks)
        used_by_uid[uid_a].update(g2_a_picks)

        # Alpha (thua Game 2) chọn lại Bên Xanh cho Game 3
        ws_a.send_json({"action": "choose_next_side", "side": "blue"})
        state = recv_both()["state"]
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_both()["state"]
        assert state["status"] == "drafting"
        assert state["currentGame"] == 3

        # Bỏ qua 4 lượt Ban đầu của Game 3
        for step_idx in range(4):
            step = state["ruleset"]["draftSteps"][step_idx]
            ws_by_uid[state["sides"][step["side"]]["player"]["userId"]].send_json(
                {"action": "draft_pick_or_ban", "characterSlug": None}
            )
            state = recv_both()["state"]

        # Game 3 khóa cộng dồn CẢ Game 1 lẫn Game 2 của Alpha
        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": g1_a_picks[0]})
        assert ws_a.receive_json()["code"] == "PREVIOUSLY_PICKED"
        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": g2_a_picks[0]})
        assert ws_a.receive_json()["code"] == "PREVIOUSLY_PICKED"

        # Hoàn tất Game 3 -> Alpha (Blue) thắng 2-1
        state = _play_single_game_over_ws(
            state,
            ws_by_uid=ws_by_uid,
            all_chars=all_chars,
            weapon4_by_type=weapon4_by_type,
            used_by_uid=used_by_uid,
            blue_chambers=[{"minutes": 8, "seconds": 30}] * 3,
            red_chambers=[{"minutes": 7, "seconds": 0}] * 3,
        )
        assert state["status"] == "finished"
        assert state["winnerSide"] == "blue"
        assert state["winnerUserId"] == uid_a
        assert state["seriesScores"] == {uid_a: 2, uid_b: 1}
        assert len(state["gameHistory"]) == 3

    # Kiểm tra API /api/me/matches phản ánh đúng BO3
    my_matches = test_client.get(
        "/api/me/matches", headers={"Authorization": f"Bearer {token_a}"}
    ).json()
    bo3_row = next(m for m in my_matches if m["code"] == code)
    assert bo3_row["format"] == "bo3"
    assert bo3_row["currentGame"] == 3
    assert bo3_row["maxGames"] == 3
    assert bo3_row["blueSeriesWins"] == 2
    assert bo3_row["redSeriesWins"] == 1


def test_bo3_2_0_sweep_finishes_early(test_client: TestClient) -> None:
    all_chars, weapon4_by_type = _load_catalog()
    rs_id = _create_custom_ruleset(test_client, name="BO3 Fast Sweep")

    token_a, uid_a = _register_with_inventory(
        test_client, "851000001", "Sweep A", all_chars[:20], constellation=0, level=90
    )
    token_b, uid_b = _register_with_inventory(
        test_client, "851000002", "Sweep B", all_chars[20:40], constellation=0, level=90
    )

    code = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id, "format": "bo3"},
    ).json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
    ):
        ws_by_uid = {uid_a: ws_a, uid_b: ws_b}

        def recv_both() -> dict:
            m_a = ws_a.receive_json()
            ws_b.receive_json()
            return m_a

        ws_a.receive_json()
        ws_b.receive_json()

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_both()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_both()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_both()["state"]

        used_by_uid: dict[str, set[str]] = {uid_a: set(), uid_b: set()}
        state = _play_single_game_over_ws(
            state,
            ws_by_uid=ws_by_uid,
            all_chars=all_chars,
            weapon4_by_type=weapon4_by_type,
            used_by_uid=used_by_uid,
            blue_chambers=[{"minutes": 8, "seconds": 30}] * 3,
            red_chambers=[{"minutes": 7, "seconds": 0}] * 3,
        )
        assert state["status"] == "between_games"
        for s in ("blue", "red"):
            u = state["gameHistory"][0][s]["player"]["userId"]
            used_by_uid[u].update(p["characterSlug"] for p in state["gameHistory"][0][s]["picks"])

        # Người thua (B) chọn Đỏ (giữ nguyên bên) -> A vẫn là Blue và thắng luôn Game 2
        ws_b.send_json({"action": "choose_next_side", "side": "red"})
        recv_both()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_both()["state"]
        assert state["currentGame"] == 2

        state = _play_single_game_over_ws(
            state,
            ws_by_uid=ws_by_uid,
            all_chars=all_chars,
            weapon4_by_type=weapon4_by_type,
            used_by_uid=used_by_uid,
            blue_chambers=[{"minutes": 8, "seconds": 30}] * 3,
            red_chambers=[{"minutes": 7, "seconds": 0}] * 3,
        )
        assert state["status"] == "finished"
        assert state["currentGame"] == 2
        assert state["winnerSide"] == "blue"
        assert state["winnerUserId"] == uid_a
        assert state["seriesScores"] == {uid_a: 2, uid_b: 0}
        assert len(state["gameHistory"]) == 2


def test_tiebreak_rules_for_equal_scores() -> None:
    all_chars, _ = _load_catalog()
    char_5 = next(c["slug"] for c in all_chars if c["rarity"] == 5)
    char_4a, char_4b = [c["slug"] for c in all_chars if c["rarity"] == 4][:2]

    def make_side(total_cost: float, pick_slugs: list[str], final_score: float = 150.0) -> SideState:
        return SideState(
            picks=[
                MatchPickSlot(
                    slot=idx,
                    character_slug=slug,
                    constellation=0,
                    level=90,
                    character_cost=0.0,
                    total_slot_cost=0.0,
                )
                for idx, slug in enumerate(pick_slugs)
            ],
            total_cost=total_cost,
            final_score=final_score,
            score_submitted=True,
        )

    # 1) none -> Hòa
    assert draft_engine._resolve_game_winner(
        make_side(2.0, [char_5]), make_side(5.0, [char_4a, char_4b]), "none"
    ) == ("draw", "draw")

    # 2) lower_cost -> bên Cost thấp hơn thắng
    assert draft_engine._resolve_game_winner(
        make_side(2.0, [char_4a, char_4b]), make_side(3.5, [char_5]), "lower_cost"
    ) == ("blue", "lower_cost")

    # 3) fewer_4star -> bên ít nhân vật 4★ hơn thắng
    assert draft_engine._resolve_game_winner(
        make_side(2.0, [char_4a, char_4b]), make_side(4.0, [char_5]), "fewer_4star"
    ) == ("red", "fewer_4star")

    # 4) lower_cost_then_fewer_4star -> bằng Cost thì xét 4★; bằng cả hai thì Hòa
    assert draft_engine._resolve_game_winner(
        make_side(3.0, [char_5]), make_side(3.0, [char_4a]), "lower_cost_then_fewer_4star"
    ) == ("blue", "fewer_4star")
    assert draft_engine._resolve_game_winner(
        make_side(3.0, [char_4a]), make_side(3.0, [char_4b]), "lower_cost_then_fewer_4star"
    ) == ("draw", "draw")


def test_bo3_draw_auto_swap_and_3_game_cap(test_client: TestClient) -> None:
    all_chars, weapon4_by_type = _load_catalog()
    rs_id = _create_custom_ruleset(test_client, name="BO3 Draw Cap", tie_break_rule="none")

    token_a, uid_a = _register_with_inventory(
        test_client, "852000001", "Draw A", all_chars[:20], constellation=0, level=90
    )
    token_b, uid_b = _register_with_inventory(
        test_client, "852000002", "Draw B", all_chars[20:40], constellation=0, level=90
    )

    code = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id, "format": "bo3"},
    ).json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
    ):
        ws_by_uid = {uid_a: ws_a, uid_b: ws_b}

        def recv_both() -> dict:
            m_a = ws_a.receive_json()
            ws_b.receive_json()
            return m_a

        ws_a.receive_json()
        ws_b.receive_json()

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_both()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_both()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_both()["state"]

        # Game 1: cả 2 cố tình dùng C0 Cost bằng nhau (đều pick nhân vật 5★ hoặc 4★? dùng tie_break="none" và dùng cùng 3 ải + cost bằng nhau)
        # Đặt Cost bằng nhau bằng cách chọn cùng số 5★ từ 2 pool -> thực tế 4★/5★ có thể lệch, nên test trực tiếp bằng submit_chamber_times khi cả 2 cùng 5★ hoặc kiểm tra trên state!
        five_stars_a = [c["slug"] for c in all_chars[:20] if c["rarity"] == 5][:6]
        five_stars_b = [c["slug"] for c in all_chars[20:40] if c["rarity"] == 5][:6]
        used_by_uid: dict[str, set[str]] = {uid_a: set(), uid_b: set()}

        state = _play_single_game_over_ws(
            state,
            ws_by_uid=ws_by_uid,
            all_chars=all_chars,
            weapon4_by_type=weapon4_by_type,
            used_by_uid=used_by_uid,
            blue_chambers=[{"minutes": 8, "seconds": 0}] * 3,
            red_chambers=[{"minutes": 8, "seconds": 0}] * 3,
            override_picks_by_uid={uid_a: five_stars_a[:2], uid_b: five_stars_b[:2]},
        )
        assert state["status"] == "between_games"
        assert state["lastGameWinReason"] == "draw"
        assert state["seriesScores"] == {uid_a: 0, uid_b: 0}
        assert state["nextGameSetup"]["autoSwapped"] is True
        assert state["nextGameSetup"]["blueUserId"] == uid_b
        assert state["nextGameSetup"]["redUserId"] == uid_a

        # Không được gọi choose_next_side khi đã autoSwapped
        ws_b.send_json({"action": "choose_next_side", "side": "red"})
        err_auto = ws_b.receive_json()
        assert err_auto["type"] == "match:error"
        assert err_auto["code"] == "AUTO_SWAPPED"

        used_by_uid[uid_a].update(five_stars_a[:2])
        used_by_uid[uid_b].update(five_stars_b[:2])

        # Sẵn sàng Game 2 -> bên B tự động ở Bên Xanh, A ở Bên Đỏ
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_both()["state"]
        assert state["currentGame"] == 2
        assert state["sides"]["blue"]["player"]["userId"] == uid_b

        # Game 2: Blue (uid_b) thắng -> tỷ số 0 - 1 (A: 0, B: 1)
        state = _play_single_game_over_ws(
            state,
            ws_by_uid=ws_by_uid,
            all_chars=all_chars,
            weapon4_by_type=weapon4_by_type,
            used_by_uid=used_by_uid,
            blue_chambers=[{"minutes": 8, "seconds": 30}] * 3,
            red_chambers=[{"minutes": 7, "seconds": 0}] * 3,
            override_picks_by_uid={uid_b: five_stars_b[2:4], uid_a: five_stars_a[2:4]},
        )
        assert state["status"] == "between_games"
        assert state["seriesScores"] == {uid_a: 0, uid_b: 1}
        assert state["nextGameSetup"]["sidePickerUserId"] == uid_a
        used_by_uid[uid_b].update(five_stars_b[2:4])
        used_by_uid[uid_a].update(five_stars_a[2:4])

        # Game 3: A chọn Blue và thắng -> tỷ số 1 - 1 sau tối đa 3 ván -> Chung cuộc Hòa!
        ws_a.send_json({"action": "choose_next_side", "side": "blue"})
        recv_both()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_both()["state"]
        assert state["currentGame"] == 3

        state = _play_single_game_over_ws(
            state,
            ws_by_uid=ws_by_uid,
            all_chars=all_chars,
            weapon4_by_type=weapon4_by_type,
            used_by_uid=used_by_uid,
            blue_chambers=[{"minutes": 8, "seconds": 30}] * 3,
            red_chambers=[{"minutes": 7, "seconds": 0}] * 3,
            override_picks_by_uid={uid_a: five_stars_a[4:6], uid_b: five_stars_b[4:6]},
        )
        assert state["status"] == "finished"
        assert state["currentGame"] == 3
        assert state["winnerSide"] == "draw"
        assert state["winnerUserId"] is None
        assert state["seriesScores"] == {uid_a: 1, uid_b: 1}


def test_bo3_insufficient_unlocked_chars_and_timeout_respects_lockout() -> None:
    all_chars, weapon4_by_type = _load_catalog()
    ruleset = RuleSetConfig(
        draft_steps=[
            DraftStep(step=1, side="blue", action="pick"),
            DraftStep(step=2, side="red", action="pick"),
            DraftStep(step=3, side="blue", action="pick"),
            DraftStep(step=4, side="red", action="pick"),
        ],
        tie_break_rule="lower_cost",
    )

    state = draft_engine.create_initial_match_state(
        code="BO3LIM",
        ruleset_id="rs-custom",
        ruleset_name="Custom 2-pick",
        ruleset=ruleset,
        host_user_id="u-blue",
        match_format="bo3",
    )
    # Blue chỉ có đúng 3 nhân vật -> đủ 2 pick Ván 1, nhưng Ván 2 chỉ còn 1 nhân vật khả dụng (< 2)
    blue_inv = {c["slug"]: {"constellation": 0, "level": 90} for c in all_chars[:3]}
    red_inv = {c["slug"]: {"constellation": 0, "level": 90} for c in all_chars[3:10]}

    state = draft_engine.select_side(
        state, user_id="u-blue", uid="860000001", display_name="Blue", owned_characters=blue_inv, side="blue"
    )
    state = draft_engine.select_side(
        state, user_id="u-red", uid="860000002", display_name="Red", owned_characters=red_inv, side="red"
    )
    state = draft_engine.set_ready(state, user_id="u-blue", ready=True)
    state = draft_engine.set_ready(state, user_id="u-red", ready=True)

    # Pick hết Ván 1
    while state.status == "drafting":
        step = draft_engine.get_current_step(state)
        assert step is not None
        nxt = draft_engine.auto_handle_timeout(state)
        assert nxt is not None
        state = nxt

    for side_key, uid in (("blue", "u-blue"), ("red", "u-red")):
        for pick in state.sides[side_key].picks:
            c = next(ch for ch in all_chars if ch["slug"] == pick.character_slug)
            state = draft_engine.set_pick_weapon(
                state, user_id=uid, slot=pick.slot, weapon_slug=weapon4_by_type[c["weapon"]], refinement=1
            )
    state = draft_engine.lock_weapons(state, user_id="u-blue")
    state = draft_engine.lock_weapons(state, user_id="u-red")

    state = draft_engine.submit_chamber_times(
        state, user_id="u-blue", chambers=[{"minutes": 8, "seconds": 30}] * 3
    )
    state = draft_engine.submit_chamber_times(
        state, user_id="u-red", chambers=[{"minutes": 7, "seconds": 30}] * 3
    )
    assert state.status == "between_games"

    # Người thua (Red) chọn Red (Blue giữ nguyên bên Blue)
    state = draft_engine.choose_next_side(state, user_id="u-red", side="red")

    # Blue chỉ còn 1 nhân vật chưa dùng ở Ván 1 -> báo lỗi NOT_ENOUGH_CHARACTERS
    try:
        draft_engine.set_ready(state, user_id="u-blue", ready=True)
        assert False, "Expected NOT_ENOUGH_CHARACTERS"
    except Exception as exc:
        assert getattr(exc, "code", None) == "NOT_ENOUGH_CHARACTERS"

    # Bổ sung kho cho Blue đủ 4 nhân vật -> sẵn sàng thành công sang Ván 2
    state = draft_engine.refresh_side_inventory(
        state,
        user_id="u-blue",
        owned_characters={c["slug"]: {"constellation": 0, "level": 90} for c in all_chars[:4]},
    )
    state = draft_engine.set_ready(state, user_id="u-blue", ready=True)
    state = draft_engine.set_ready(state, user_id="u-red", ready=True)
    assert state.status == "drafting"
    assert state.current_game == 2

    g1_blue_locked = {p.character_slug for p in state.game_history[0].blue.picks}
    g1_red_locked = {p.character_slug for p in state.game_history[0].red.picks}

    # auto_handle_timeout ở Ván 2 không bao giờ pick trùng nhân vật của chính người đó ở Ván 1
    while state.status == "drafting":
        nxt = draft_engine.auto_handle_timeout(state)
        assert nxt is not None
        state = nxt

    g2_blue_picks = {p.character_slug for p in state.sides["blue"].picks}
    g2_red_picks = {p.character_slug for p in state.sides["red"].picks}
    assert g2_blue_picks.isdisjoint(g1_blue_locked)
    assert g2_red_picks.isdisjoint(g1_red_locked)
