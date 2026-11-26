from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.schemas.ruleset import default_ruleset_config
from app.services import draft_engine

CHARS_PATH = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "characters.json"
WEPS_PATH = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "weapons.json"


def _load_sample_catalog() -> tuple[list[dict], dict[str, str], dict[str, str]]:
    chars = json.loads(CHARS_PATH.read_text(encoding="utf-8"))
    weps = json.loads(WEPS_PATH.read_text(encoding="utf-8"))
    # Chọn 1 vũ khí 4★ và 1 vũ khí 5★ bất kỳ cho mỗi loại vũ khí
    weapon4_by_type: dict[str, str] = {}
    weapon5_by_type: dict[str, str] = {}
    for w in weps:
        if w["rarity"] == 4 and w["weaponType"] not in weapon4_by_type:
            weapon4_by_type[w["weaponType"]] = w["slug"]
        if w["rarity"] == 5 and w["weaponType"] not in weapon5_by_type:
            weapon5_by_type[w["weaponType"]] = w["slug"]
    return chars, weapon4_by_type, weapon5_by_type


def _register_and_seed_inventory(
    client: TestClient,
    uid: str,
    name: str,
    chars: list[dict],
    constellation: int,
    level: int,
) -> tuple[str, str]:
    res = client.post(
        "/api/auth/register",
        json={"uid": uid, "displayName": name, "password": "Password123"},
    )
    assert res.status_code == 200
    data = res.json()
    token = data["token"]
    user_id = data["user"]["id"]

    inv_payload = {
        "version": 1,
        "updatedAt": "2026-11-24T00:00:00Z",
        "characters": {
            c["slug"]: {"slug": c["slug"], "constellation": constellation, "level": level}
            for c in chars[:24]
        },
    }
    put_res = client.put(
        "/api/me/inventory",
        headers={"Authorization": f"Bearer {token}"},
        json=inv_payload,
    )
    assert put_res.status_code == 200
    return token, user_id


def test_full_1v1_match_ws_flow(test_client: TestClient) -> None:
    all_chars, weapon_by_type, weapon5_by_type = _load_sample_catalog()
    # Cho Player A (Xanh) và Player B (Đỏ) dùng 24 nhân vật với cung mệnh khác nhau
    blue_chars = all_chars[:24]
    red_chars = all_chars[24:48]

    token_a, uid_a = _register_and_seed_inventory(
        test_client, "800000001", "Player Blue", blue_chars, constellation=2, level=100
    )
    token_b, uid_b = _register_and_seed_inventory(
        test_client, "800000002", "Player Red", red_chars, constellation=0, level=90
    )

    rulesets = test_client.get("/api/rulesets").json()
    rs_id = rulesets[0]["id"]

    # Tạo phòng đấu
    create_res = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id},
    )
    assert create_res.status_code == 200
    code = create_res.json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
    ):
        # Nhận state ban đầu
        msg_a = ws_a.receive_json()
        msg_b = ws_b.receive_json()
        assert msg_a["state"]["status"] == "lobby"
        assert msg_b["state"]["status"] == "lobby"

        # Chọn bên: A -> Trái (blue), B -> Phải (red)
        ws_a.send_json({"action": "select_side", "side": "blue"})
        ws_a.receive_json()
        ws_b.receive_json()

        ws_b.send_json({"action": "select_side", "side": "red"})
        ws_a.receive_json()
        ws_b.receive_json()

        # Cả 2 bấm Sẵn sàng -> tự động bắt đầu DRAFTING
        ws_a.send_json({"action": "set_ready", "ready": True})
        ws_a.receive_json()
        ws_b.receive_json()

        ws_b.send_json({"action": "set_ready", "ready": True})
        s_a = ws_a.receive_json()["state"]
        s_b = ws_b.receive_json()["state"]
        assert s_a["status"] == "drafting"
        assert s_b["currentStepIndex"] == 0

        steps = s_a["ruleset"]["draftSteps"]
        assert len(steps) == 22

        # Chạy toàn bộ 22 lượt Ban/Pick
        blue_pool = [c["slug"] for c in blue_chars]
        red_pool = [c["slug"] for c in red_chars]
        ban_pool = [c["slug"] for c in all_chars[48:]]

        state = s_a
        for idx, step in enumerate(steps):
            actor_ws = ws_a if step["side"] == "blue" else ws_b
            if step["action"] == "ban":
                chosen = ban_pool.pop(0)
            elif step["side"] == "blue":
                chosen = blue_pool.pop(0)
            else:
                chosen = red_pool.pop(0)

            actor_ws.send_json({"action": "draft_pick_or_ban", "characterSlug": chosen})
            state = ws_a.receive_json()["state"]
            ws_b.receive_json()

            # Thử gán vũ khí ngay cho slot 0 của đội Xanh khi vừa Pick xong!
            if idx == 4 and step["side"] == "blue":
                pick0 = state["sides"]["blue"]["picks"][0]
                assert pick0["constellation"] == 2
                assert pick0["level"] == 100
                char_obj = next(c for c in all_chars if c["slug"] == pick0["characterSlug"])

                # Skin vũ khí và vũ khí 3★ không còn trong danh sách -> UNKNOWN_WEAPON
                ws_a.send_json(
                    {
                        "action": "set_weapon",
                        "slot": 0,
                        "weaponSlug": "serpent-devourer-sublimation",
                        "refinement": 1,
                    }
                )
                err_skin = ws_a.receive_json()
                assert err_skin["type"] == "match:error"
                assert err_skin["code"] == "UNKNOWN_WEAPON"

                ws_a.send_json(
                    {
                        "action": "set_weapon",
                        "slot": 0,
                        "weaponSlug": "cool-steel",
                        "refinement": 1,
                    }
                )
                err_3star = ws_a.receive_json()
                assert err_3star["type"] == "match:error"
                assert err_3star["code"] == "UNKNOWN_WEAPON"

                ws_a.send_json(
                    {
                        "action": "set_weapon",
                        "slot": 0,
                        "weaponSlug": weapon5_by_type[char_obj["weapon"]],
                        "refinement": 3,
                    }
                )
                state = ws_a.receive_json()["state"]
                ws_b.receive_json()
                assert state["sides"]["blue"]["picks"][0]["refinement"] == 3
                assert state["sides"]["blue"]["picks"][0]["weaponCost"] == 1.0
                assert state["sides"]["blue"]["picks"][0]["weaponRefinementSeconds"] == 10.0
                assert state["sides"]["blue"]["weaponRefinementSeconds"] == 10.0

        assert state["status"] == "weapon_phase"
        assert len(state["sides"]["blue"]["bans"]) == 3
        assert len(state["sides"]["blue"]["picks"]) == 8
        assert len(state["sides"]["red"]["bans"]) == 3
        assert len(state["sides"]["red"]["picks"]) == 8

        # Điền nốt vũ khí cho cả 2 bên trong khoảng thời gian trống
        for side_key, actor_ws in (("blue", ws_a), ("red", ws_b)):
            for pick in state["sides"][side_key]["picks"]:
                if pick["weaponSlug"]:
                    continue
                char_obj = next(c for c in all_chars if c["slug"] == pick["characterSlug"])
                actor_ws.send_json(
                    {
                        "action": "set_weapon",
                        "slot": pick["slot"],
                        "weaponSlug": weapon_by_type[char_obj["weapon"]],
                        "refinement": 1,
                    }
                )
                state = ws_a.receive_json()["state"]
                ws_b.receive_json()

        ws_a.send_json({"action": "lock_weapons"})
        state = ws_a.receive_json()["state"]
        ws_b.receive_json()
        ws_b.send_json({"action": "lock_weapons"})
        state = ws_a.receive_json()["state"]
        ws_b.receive_json()

        assert state["status"] == "scoring"

        # Đội Đỏ điền thời gian nhanh hơn (còn nhiều thời gian hơn -> trừ từ 9:00 ít hơn) & Cost thấp hơn (C0 vs C2)
        ws_a.send_json(
            {
                "action": "submit_scores",
                "chambers": [
                    {"minutes": 7, "seconds": 30},  # 90s
                    {"minutes": 7, "seconds": 0},   # 120s
                    {"minutes": 7, "seconds": 30},  # 90s => tổng 300s
                ],
            }
        )
        state = ws_a.receive_json()["state"]
        ws_b.receive_json()

        ws_b.send_json(
            {
                "action": "submit_scores",
                "chambers": [
                    {"minutes": 8, "seconds": 30},  # 30s
                    {"minutes": 8, "seconds": 20},  # 40s
                    {"minutes": 8, "seconds": 30},  # 30s => tổng 100s
                ],
            }
        )
        state = ws_a.receive_json()["state"]
        ws_b.receive_json()

        assert state["status"] == "finished"
        assert state["winnerSide"] == "red"
        assert state["sides"]["red"]["finalScore"] < state["sides"]["blue"]["finalScore"]
        blue_side = state["sides"]["blue"]
        assert blue_side["weaponRefinementSeconds"] == 10.0
        assert blue_side["finalScore"] == round(
            blue_side["costPenaltySeconds"]
            + blue_side["weaponRefinementSeconds"]
            + blue_side["chamberTotalSeconds"],
            2,
        )


def test_match_validation_edge_cases(test_client: TestClient) -> None:
    all_chars, _, _ = _load_sample_catalog()
    # Tạo Player thiếu nhân vật (chỉ có 2 nhân vật -> không đủ 8 để sẵn sàng)
    token_short, _ = _register_and_seed_inventory(
        test_client, "811111111", "Short Inv", all_chars[:2], constellation=0, level=90
    )
    # _register_and_seed_inventory lưu 24, ghi đè lại còn 2 nhân vật
    test_client.put(
        "/api/me/inventory",
        headers={"Authorization": f"Bearer {token_short}"},
        json={
            "version": 1,
            "updatedAt": "2026-11-24T00:00:00Z",
            "characters": {
                c["slug"]: {"slug": c["slug"], "constellation": 0, "level": 90}
                for c in all_chars[:2]
            },
        },
    )

    token_full, _ = _register_and_seed_inventory(
        test_client, "822222222", "Full Inv", all_chars[:24], constellation=1, level=95
    )

    rulesets = test_client.get("/api/rulesets").json()
    code = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_full}"},
        json={"rulesetId": rulesets[0]["id"]},
    ).json()["code"]

    with test_client.websocket_connect(f"/ws/matches/{code}?token={token_short}") as ws_short:
        ws_short.receive_json()
        ws_short.send_json({"action": "select_side", "side": "blue"})
        ws_short.receive_json()
        ws_short.send_json({"action": "set_ready", "ready": True})
        err = ws_short.receive_json()
        assert err["type"] == "match:error"
        assert err["code"] == "NOT_ENOUGH_CHARACTERS"


def test_reorder_lineup_and_admin_controls(test_client: TestClient) -> None:
    all_chars, weapon_by_type, _ = _load_sample_catalog()
    blue_chars = all_chars[:24]
    red_chars = all_chars[24:48]

    token_a, _ = _register_and_seed_inventory(
        test_client, "833333331", "Blue Lineup", blue_chars, constellation=1, level=90
    )
    token_b, _ = _register_and_seed_inventory(
        test_client, "833333332", "Red Lineup", red_chars, constellation=0, level=90
    )

    settings = get_settings()
    admin_res = test_client.post(
        "/api/auth/login",
        json={
            "uid": settings.SEED_ADMIN_UID,
            "password": settings.SEED_ADMIN_PASSWORD,
            "remember": True,
        },
    )
    assert admin_res.status_code == 200
    admin_token = admin_res.json()["token"]

    rs_id = test_client.get("/api/rulesets").json()[0]["id"]
    code = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id},
    ).json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
        test_client.websocket_connect(f"/ws/matches/{code}?token={admin_token}") as ws_admin,
    ):
        for ws in (ws_a, ws_b, ws_admin):
            ws.receive_json()

        def recv_all() -> dict:
            st = ws_a.receive_json()
            ws_b.receive_json()
            ws_admin.receive_json()
            return st

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_all()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_all()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_all()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_all()["state"]

        # Không được reorder khi đang drafting
        ws_a.send_json({"action": "reorder_lineup", "side": "blue", "order": list(range(8))})
        err_phase = ws_a.receive_json()
        assert err_phase["type"] == "match:error"
        assert err_phase["code"] == "INVALID_PHASE"

        blue_pool = [c["slug"] for c in blue_chars]
        red_pool = [c["slug"] for c in red_chars]
        ban_pool = [c["slug"] for c in all_chars[48:]]

        for step in state["ruleset"]["draftSteps"]:
            actor_ws = ws_a if step["side"] == "blue" else ws_b
            if step["action"] == "ban":
                chosen = ban_pool.pop(0)
            elif step["side"] == "blue":
                chosen = blue_pool.pop(0)
            else:
                chosen = red_pool.pop(0)
            actor_ws.send_json({"action": "draft_pick_or_ban", "characterSlug": chosen})
            state = recv_all()["state"]

        assert state["status"] == "weapon_phase"
        assert state["sides"]["blue"]["lineup"] == list(range(8))
        orig_blue_picks = [p["characterSlug"] for p in state["sides"]["blue"]["picks"]]
        orig_blue_cost = state["sides"]["blue"]["totalCost"]

        # Player Blue tự sắp xếp lại vị trí & đảo Half 1 / Half 2
        blue_order = [4, 5, 6, 7, 1, 0, 3, 2]
        ws_a.send_json({"action": "reorder_lineup", "side": "blue", "order": blue_order})
        state = recv_all()["state"]
        assert state["sides"]["blue"]["lineup"] == blue_order
        assert [p["characterSlug"] for p in state["sides"]["blue"]["picks"]] == orig_blue_picks
        assert state["sides"]["blue"]["totalCost"] == orig_blue_cost

        # Player Blue cố sửa đội hình bên Đỏ -> FORBIDDEN
        ws_a.send_json({"action": "reorder_lineup", "side": "red", "order": list(range(8))})
        err_forbidden = ws_a.receive_json()
        assert err_forbidden["type"] == "match:error"
        assert err_forbidden["code"] == "FORBIDDEN"

        # Gửi hoán vị sai (trùng số) -> INVALID_LINEUP
        ws_a.send_json({"action": "reorder_lineup", "side": "blue", "order": [0, 0, 1, 2, 3, 4, 5, 6]})
        err_invalid = ws_a.receive_json()
        assert err_invalid["type"] == "match:error"
        assert err_invalid["code"] == "INVALID_LINEUP"

        # Điền vũ khí cho 2 bên rồi khóa
        for side_key, actor_ws in (("blue", ws_a), ("red", ws_b)):
            for pick in state["sides"][side_key]["picks"]:
                char_obj = next(c for c in all_chars if c["slug"] == pick["characterSlug"])
                actor_ws.send_json(
                    {
                        "action": "set_weapon",
                        "slot": pick["slot"],
                        "weaponSlug": weapon_by_type[char_obj["weapon"]],
                        "refinement": 1,
                    }
                )
                state = recv_all()["state"]

        ws_b.send_json({"action": "lock_weapons"})
        state = recv_all()["state"]
        assert state["sides"]["red"]["weaponsLocked"] is True

        # Admin chỉnh hộ vũ khí cho Đỏ ngay cả khi Đỏ đã khóa vũ khí
        red_pick0 = state["sides"]["red"]["picks"][0]
        red_char0 = next(c for c in all_chars if c["slug"] == red_pick0["characterSlug"])
        ws_admin.send_json(
            {
                "action": "set_weapon",
                "side": "red",
                "slot": 0,
                "weaponSlug": weapon_by_type[red_char0["weapon"]],
                "refinement": 4,
            }
        )
        state = recv_all()["state"]
        assert state["sides"]["red"]["picks"][0]["refinement"] == 4

        # Admin đổi vị trí cho bên Đỏ trong weapon_phase
        red_order = [7, 6, 5, 4, 3, 2, 1, 0]
        ws_admin.send_json({"action": "reorder_lineup", "side": "red", "order": red_order})
        state = recv_all()["state"]
        assert state["sides"]["red"]["lineup"] == red_order

        # Khóa bên Xanh -> sang pha scoring
        ws_a.send_json({"action": "lock_weapons"})
        state = recv_all()["state"]
        assert state["status"] == "scoring"

        # Trong pha scoring, Player vẫn được sắp xếp lại vị trí bên mình
        blue_scoring_order = [2, 3, 0, 1, 6, 7, 4, 5]
        ws_a.send_json({"action": "reorder_lineup", "side": "blue", "order": blue_scoring_order})
        state = recv_all()["state"]
        assert state["sides"]["blue"]["lineup"] == blue_scoring_order

        # Nộp thời gian 3 ải để kết thúc trận
        chambers = [{"minutes": 8, "seconds": 0}] * 3
        ws_a.send_json({"action": "submit_scores", "chambers": chambers})
        recv_all()
        ws_b.send_json({"action": "submit_scores", "chambers": chambers})
        state = recv_all()["state"]
        assert state["status"] == "finished"

        # Khi finished, Player không được đổi nữa (INVALID_PHASE), nhưng Admin vẫn đổi được
        ws_a.send_json({"action": "reorder_lineup", "side": "blue", "order": list(range(8))})
        err_finished = ws_a.receive_json()
        assert err_finished["type"] == "match:error"
        assert err_finished["code"] == "INVALID_PHASE"

        admin_final_order = [0, 2, 4, 6, 1, 3, 5, 7]
        ws_admin.send_json({"action": "reorder_lineup", "side": "blue", "order": admin_final_order})
        state = recv_all()["state"]
        assert state["sides"]["blue"]["lineup"] == admin_final_order


def test_undo_and_request_undo_ws_flow(test_client: TestClient) -> None:
    all_chars, weapon_by_type, _ = _load_sample_catalog()
    blue_chars = all_chars[:24]
    red_chars = all_chars[24:48]

    token_a, _ = _register_and_seed_inventory(
        test_client, "844444441", "Blue Undo", blue_chars, constellation=2, level=90
    )
    token_b, _ = _register_and_seed_inventory(
        test_client, "844444442", "Red Undo", red_chars, constellation=0, level=90
    )

    settings = get_settings()
    admin_token = test_client.post(
        "/api/auth/login",
        json={
            "uid": settings.SEED_ADMIN_UID,
            "password": settings.SEED_ADMIN_PASSWORD,
            "remember": True,
        },
    ).json()["token"]

    rs_id = test_client.get("/api/rulesets").json()[0]["id"]
    code = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id},
    ).json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
        test_client.websocket_connect(f"/ws/matches/{code}?token={admin_token}") as ws_admin,
    ):
        for ws in (ws_a, ws_b, ws_admin):
            ws.receive_json()

        def recv_all() -> dict:
            st = ws_a.receive_json()
            ws_b.receive_json()
            ws_admin.receive_json()
            return st

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_all()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_all()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_all()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_all()["state"]

        blue_pool = [c["slug"] for c in blue_chars]
        red_pool = [c["slug"] for c in red_chars]
        ban_pool = [c["slug"] for c in all_chars[48:]]

        # Chạy 4 lượt Ban (index 0..3) và Blue Pick #1 (index 4)
        for idx in range(5):
            step = state["ruleset"]["draftSteps"][idx]
            actor_ws = ws_a if step["side"] == "blue" else ws_b
            slug = ban_pool.pop(0) if step["action"] == "ban" else blue_pool.pop(0)
            actor_ws.send_json({"action": "draft_pick_or_ban", "characterSlug": slug})
            state = recv_all()["state"]

        assert state["currentStepIndex"] == 5  # Đang là lượt của Red (chưa pick)
        assert len(state["sides"]["blue"]["picks"]) == 1

        # 1) Red đang tới lượt, chưa pick -> bấm lùi lại -> trả lượt về cho Blue pick lại (index 4)
        ws_b.send_json({"action": "undo_draft_step"})
        state = recv_all()["state"]
        assert state["currentStepIndex"] == 4
        assert len(state["sides"]["blue"]["picks"]) == 0
        assert state["sides"]["blue"]["totalCost"] == 0.0

        # Hiện đang là lượt Blue -> Red không được bấm lùi trực tiếp nữa (phải chờ Blue)
        ws_b.send_json({"action": "undo_draft_step"})
        err_wait = ws_b.receive_json()
        assert err_wait["type"] == "match:error"
        assert err_wait["code"] == "FORBIDDEN"

        # Blue pick lại index 4 -> tới lượt Red (index 5 & 6: 2 pick liên tục của Red)
        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": blue_pool[0]})
        state = recv_all()["state"]
        assert state["currentStepIndex"] == 5

        # 2) Red pick index 5 (vẫn đang trong lượt của Red ở index 6) -> lùi lại để Red pick lại index 5
        ws_b.send_json({"action": "undo_draft_step"})
        # Chú ý: Red phải pick trước khi undo!
        # Ở đây index 5 là Red chưa pick nên undo sẽ lùi về Blue (index 4) -> test luôn việc pick rồi mới undo:
        state = recv_all()["state"]
        assert state["currentStepIndex"] == 4
        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": blue_pool[0]})
        state = recv_all()["state"]

        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": red_pool[0]})
        state = recv_all()["state"]
        assert state["currentStepIndex"] == 6  # Vẫn đang trong lượt Red!
        assert len(state["sides"]["red"]["picks"]) == 1

        ws_b.send_json({"action": "undo_draft_step"})
        state = recv_all()["state"]
        assert state["currentStepIndex"] == 5
        assert len(state["sides"]["red"]["picks"]) == 0

        # Red hoàn thành index 5 & 6 -> sang lượt Blue (index 7 & 8)
        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": red_pool[0]})
        state = recv_all()["state"]
        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": red_pool[1]})
        state = recv_all()["state"]
        assert state["currentStepIndex"] == 7

        # Blue pick index 7 (vẫn là lượt Blue ở index 8)
        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": blue_pool[1]})
        state = recv_all()["state"]
        assert state["currentStepIndex"] == 8

        # 3) Blue bấm lùi 2 lần -> lùi về lượt Red (index 6) -> Blue bị chặn phải chờ Red pick xong
        ws_a.send_json({"action": "undo_draft_step"})
        state = recv_all()["state"]
        assert state["currentStepIndex"] == 7
        ws_a.send_json({"action": "undo_draft_step"})
        state = recv_all()["state"]
        assert state["currentStepIndex"] == 6
        assert len(state["sides"]["red"]["picks"]) == 1

        ws_a.send_json({"action": "undo_draft_step"})
        err_blue_wait = ws_a.receive_json()
        assert err_blue_wait["type"] == "match:error"
        assert err_blue_wait["code"] == "FORBIDDEN"

        # 4) Xin lùi 1 hành động: Blue (đang chờ) xin lùi hành động vừa rồi của mình (step 4)
        ws_a.send_json({"action": "request_undo"})
        state = recv_all()["state"]
        assert state["undoRequest"] is not None
        assert state["undoRequest"]["requesterSide"] == "blue"
        assert state["undoRequest"]["targetStepIndex"] == 4
        assert state["undoRequest"]["stepsToRevert"] == 2

        # Red từ chối -> giữ nguyên trạng thái
        ws_b.send_json({"action": "respond_undo", "accept": False})
        state = recv_all()["state"]
        assert state["undoRequest"] is None
        assert state["currentStepIndex"] == 6

        # Blue xin lại, rồi tự hủy
        ws_a.send_json({"action": "request_undo"})
        state = recv_all()["state"]
        assert state["undoRequest"] is not None
        ws_a.send_json({"action": "cancel_undo_request"})
        state = recv_all()["state"]
        assert state["undoRequest"] is None
        assert state["currentStepIndex"] == 6

        # Blue xin lại, Red đồng ý -> lùi lại lượt pick vừa rồi của Blue (index 4)
        ws_a.send_json({"action": "request_undo"})
        state = recv_all()["state"]
        ws_b.send_json({"action": "respond_undo", "accept": True})
        state = recv_all()["state"]
        assert state["undoRequest"] is None
        assert state["currentStepIndex"] == 4
        assert len(state["sides"]["blue"]["picks"]) == 0
        assert len(state["sides"]["red"]["picks"]) == 0

        # Hoàn tất toàn bộ 22 bước để vào weapon_phase
        used_bans = set(state["sides"]["blue"]["bans"] + state["sides"]["red"]["bans"])
        rem_blue = [c["slug"] for c in blue_chars if c["slug"] not in used_bans]
        rem_red = [c["slug"] for c in red_chars if c["slug"] not in used_bans]
        rem_bans = [c["slug"] for c in all_chars[48:] if c["slug"] not in used_bans]

        while state["status"] == "drafting":
            step = state["ruleset"]["draftSteps"][state["currentStepIndex"]]
            actor_ws = ws_a if step["side"] == "blue" else ws_b
            if step["action"] == "ban":
                chosen = rem_bans.pop(0)
            elif step["side"] == "blue":
                chosen = rem_blue.pop(0)
            else:
                chosen = rem_red.pop(0)
            actor_ws.send_json({"action": "draft_pick_or_ban", "characterSlug": chosen})
            state = recv_all()["state"]

        assert state["status"] == "weapon_phase"

        # 5) Admin lùi tùy ý từ weapon_phase về drafting & lùi tiếp nhiều bước
        ws_admin.send_json({"action": "undo_draft_step"})
        state = recv_all()["state"]
        assert state["status"] == "drafting"
        assert state["currentStepIndex"] == 21
        ws_admin.send_json({"action": "undo_draft_step"})
        state = recv_all()["state"]
        assert state["currentStepIndex"] == 20

        # Hoàn tất lại weapon_phase rồi thử xin lùi từ weapon_phase
        for idx in (20, 21):
            step = state["ruleset"]["draftSteps"][idx]
            actor_ws = ws_a if step["side"] == "blue" else ws_b
            chosen = rem_blue.pop(0) if step["side"] == "blue" else rem_red.pop(0)
            actor_ws.send_json({"action": "draft_pick_or_ban", "characterSlug": chosen})
            state = recv_all()["state"]
        assert state["status"] == "weapon_phase"

        # Bên Xanh xin lùi ở weapon_phase, Đỏ đồng ý -> quay lại step 21 (lượt cuối của Xanh)
        ws_a.send_json({"action": "request_undo"})
        state = recv_all()["state"]
        assert state["undoRequest"]["targetStepIndex"] == 21
        ws_b.send_json({"action": "respond_undo", "accept": True})
        state = recv_all()["state"]
        assert state["status"] == "drafting"
        assert state["currentStepIndex"] == 21

        # Pick lại để chốt weapon_phase và khóa vũ khí bình thường
        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": rem_blue.pop(0)})
        state = recv_all()["state"]
        assert state["status"] == "weapon_phase"
        for side_key, actor_ws in (("blue", ws_a), ("red", ws_b)):
            for pick in state["sides"][side_key]["picks"]:
                char_obj = next(c for c in all_chars if c["slug"] == pick["characterSlug"])
                actor_ws.send_json(
                    {
                        "action": "set_weapon",
                        "slot": pick["slot"],
                        "weaponSlug": weapon_by_type[char_obj["weapon"]],
                        "refinement": 1,
                    }
                )
                state = recv_all()["state"]


def test_overtime_penalty_accumulation_and_scoring() -> None:
    all_chars, weapon_by_type, _ = _load_sample_catalog()
    ruleset = default_ruleset_config()
    ruleset.use_reserve_time = False
    state = draft_engine.create_initial_match_state(
        code="OVTIME",
        ruleset_id="rs-1",
        ruleset_name="Test Overtime",
        ruleset=ruleset,
        host_user_id="u-blue",
    )
    blue_inv = {
        c["slug"]: {"constellation": 0, "level": 90} for c in all_chars[:16]
    }
    red_inv = {
        c["slug"]: {"constellation": 0, "level": 90} for c in all_chars[16:32]
    }
    state = draft_engine.select_side(
        state, user_id="u-blue", uid="800000011", display_name="Blue", owned_characters=blue_inv, side="blue"
    )
    state = draft_engine.select_side(
        state, user_id="u-red", uid="800000012", display_name="Red", owned_characters=red_inv, side="red"
    )
    state = draft_engine.set_ready(state, user_id="u-blue", ready=True)
    state = draft_engine.set_ready(state, user_id="u-red", ready=True)
    assert state.status == "drafting"
    assert state.turn_deadline_at is not None

    # Vượt quá deadline < 1s (0.5s) -> chưa tính phạt (khớp đồng hồ hiển thị 0:00)
    d0 = datetime.fromisoformat(state.turn_deadline_at)
    state = draft_engine.apply_draft_action(
        state,
        user_id="u-blue",
        character_slug=all_chars[40]["slug"],
        now=d0 + timedelta(seconds=0.5),
    )
    assert state.sides["blue"].overtime_penalty_seconds == 0.0

    # Đội Đỏ vượt quá deadline 5.7s -> bị phạt +5s
    d1 = datetime.fromisoformat(state.turn_deadline_at or "")
    state = draft_engine.apply_draft_action(
        state,
        user_id="u-red",
        character_slug=all_chars[41]["slug"],
        now=d1 + timedelta(seconds=5.7),
    )
    assert state.sides["red"].overtime_penalty_seconds == 5.0

    # Đội Xanh đang ở bước 2, chần chừ quá hạn 3.4s rồi bấm lùi -> vẫn bị tính +3s phạt
    d2 = datetime.fromisoformat(state.turn_deadline_at or "")
    state = draft_engine.undo_draft_step(
        state,
        user_id="u-blue",
        user_role="player",
        now=d2 + timedelta(seconds=3.4),
    )
    assert state.sides["blue"].overtime_penalty_seconds == 3.0
    assert state.current_step_index == 1

    # Admin bấm lùi dù quá hạn 20s -> không phạt người chơi
    d_admin = datetime.fromisoformat(state.turn_deadline_at or "")
    state = draft_engine.undo_draft_step(
        state,
        user_id="admin-1",
        user_role="admin",
        now=d_admin + timedelta(seconds=20.0),
    )
    assert state.sides["red"].overtime_penalty_seconds == 5.0
    assert state.sides["blue"].overtime_penalty_seconds == 3.0
    assert state.current_step_index == 0

    # Chạy hết 22 lượt Ban/Pick đúng hạn
    blue_pool = [c["slug"] for c in all_chars[:16]]
    red_pool = [c["slug"] for c in all_chars[16:32]]
    ban_pool = [c["slug"] for c in all_chars[32:]]
    while state.status == "drafting":
        step = state.ruleset.draft_steps[state.current_step_index]
        uid = "u-blue" if step.side == "blue" else "u-red"
        if step.action == "ban":
            slug = ban_pool.pop(0)
        elif step.side == "blue":
            slug = blue_pool.pop(0)
        else:
            slug = red_pool.pop(0)
        dl = datetime.fromisoformat(state.turn_deadline_at or "")
        state = draft_engine.apply_draft_action(
            state, user_id=uid, character_slug=slug, now=dl - timedelta(seconds=10)
        )

    assert state.status == "weapon_phase"
    # Trang bị vũ khí
    for side_key, uid in (("blue", "u-blue"), ("red", "u-red")):
        for pick in state.sides[side_key].picks:
            char_obj = next(c for c in all_chars if c["slug"] == pick.character_slug)
            state = draft_engine.set_pick_weapon(
                state,
                user_id=uid,
                slot=pick.slot,
                weapon_slug=weapon_by_type[char_obj["weapon"]],
                refinement=1,
            )

    # Blue khóa trước deadline -> không phạt thêm; Red khóa sau deadline -> tự động khóa cả 2 bên, không phạt thêm (vẫn giữ 5s từ pha draft)
    wp_dl = datetime.fromisoformat(state.turn_deadline_at or "")
    state = draft_engine.lock_weapons(state, user_id="u-blue", now=wp_dl - timedelta(seconds=5))
    assert state.sides["blue"].overtime_penalty_seconds == 3.0
    state = draft_engine.lock_weapons(state, user_id="u-red", now=wp_dl + timedelta(seconds=12.1))
    assert state.sides["red"].overtime_penalty_seconds == 5.0
    assert state.sides["red"].weapons_locked is True
    assert state.turn_deadline_at is None
    assert state.status == "scoring"

    chambers = [{"minutes": 8, "seconds": 0}] * 3  # 180s
    state = draft_engine.submit_chamber_times(state, user_id="u-blue", chambers=chambers)
    state = draft_engine.submit_chamber_times(state, user_id="u-red", chambers=chambers)
    assert state.status == "finished"

    assert state.sides["blue"].final_score == round(
        state.sides["blue"].cost_penalty_seconds
        + state.sides["blue"].weapon_refinement_seconds
        + 3.0
        + 180,
        2,
    )
    assert state.sides["red"].final_score == round(
        state.sides["red"].cost_penalty_seconds
        + state.sides["red"].weapon_refinement_seconds
        + 5.0
        + 180,
        2,
    )

    # Admin chỉnh vũ khí ở scoring (tạo state scoring tạm để test recalculate giữ nguyên overtime)
    scoring_state = state.model_copy(deep=True)
    scoring_state.status = "scoring"
    first_red_pick = scoring_state.sides["red"].picks[0]
    first_red_char = next(c for c in all_chars if c["slug"] == first_red_pick.character_slug)
    updated_scoring = draft_engine.set_pick_weapon(
        scoring_state,
        user_id="admin-1",
        user_role="admin",
        target_side="red",
        slot=0,
        weapon_slug=weapon_by_type[first_red_char["weapon"]],
        refinement=3,
    )
    assert updated_scoring.sides["red"].final_score == round(
        updated_scoring.sides["red"].cost_penalty_seconds
        + updated_scoring.sides["red"].weapon_refinement_seconds
        + 5.0
        + 180,
        2,
    )


def test_reserve_time_and_per_step_ban_pick_timers() -> None:
    all_chars, _, _ = _load_sample_catalog()
    ruleset = default_ruleset_config()
    ruleset.ban_seconds = 20
    ruleset.pick_seconds = 50
    ruleset.draft_steps[0].seconds = 15
    ruleset.use_reserve_time = True
    ruleset.reserve_time_seconds = 120

    assert ruleset.use_reserve_time is True
    assert ruleset.reserve_time_seconds == 120

    state = draft_engine.create_initial_match_state(
        code="RSRV01",
        ruleset_id="rs-rsrv",
        ruleset_name="Reserve Time Test",
        ruleset=ruleset,
        host_user_id="u-blue",
    )
    blue_inv = {c["slug"]: {"constellation": 0, "level": 90} for c in all_chars[:16]}
    red_inv = {c["slug"]: {"constellation": 0, "level": 90} for c in all_chars[16:32]}
    state = draft_engine.select_side(
        state, user_id="u-blue", uid="800000101", display_name="Blue", owned_characters=blue_inv, side="blue"
    )
    state = draft_engine.select_side(
        state, user_id="u-red", uid="800000102", display_name="Red", owned_characters=red_inv, side="red"
    )
    state = draft_engine.set_ready(state, user_id="u-blue", ready=True)
    state = draft_engine.set_ready(state, user_id="u-red", ready=True)

    assert state.status == "drafting"
    assert state.sides["blue"].reserve_remaining_seconds == 120.0
    assert state.sides["red"].reserve_remaining_seconds == 120.0
    assert state.turn_deadline_at is not None

    # Bước 0 (blue ban override 15s): quá giờ 10s -> trừ thẳng vào thời gian gốc (120 -> 110), phạt 0s
    d0 = datetime.fromisoformat(state.turn_deadline_at)
    state = draft_engine.apply_draft_action(
        state,
        user_id="u-blue",
        character_slug=all_chars[40]["slug"],
        now=d0 + timedelta(seconds=10.4),
    )
    assert state.sides["blue"].reserve_remaining_seconds == 110.0
    assert state.sides["blue"].overtime_penalty_seconds == 0.0

    # Bước 1 (red ban mặc định 20s): kiểm tra thời hạn ~20s và quá giờ 130s -> hết 120s gốc, dư 10s phạt
    d1 = datetime.fromisoformat(state.turn_deadline_at or "")
    assert 18.0 <= (d1 - datetime.now(timezone.utc)).total_seconds() <= 21.0
    state = draft_engine.apply_draft_action(
        state,
        user_id="u-red",
        character_slug=all_chars[41]["slug"],
        now=d1 + timedelta(seconds=130.2),
    )
    assert state.sides["red"].reserve_remaining_seconds == 0.0
    assert state.sides["red"].overtime_penalty_seconds == 10.0

    # Bước 2 (blue ban mặc định 20s), rồi bước 4 (blue pick mặc định 50s)
    state = draft_engine.apply_draft_action(
        state, user_id="u-blue", character_slug=None
    )
    state = draft_engine.apply_draft_action(
        state, user_id="u-red", character_slug=None
    )
    assert state.ruleset.draft_steps[state.current_step_index].action == "pick"
    d4 = datetime.fromisoformat(state.turn_deadline_at or "")
    assert 48.0 <= (d4 - datetime.now(timezone.utc)).total_seconds() <= 51.0


def test_draft_hover_ws_sync_and_clears_on_lock(test_client: TestClient) -> None:
    all_chars, _, _ = _load_sample_catalog()
    blue_chars = all_chars[:20]
    red_chars = all_chars[20:40]

    token_a, _ = _register_and_seed_inventory(
        test_client, "877777701", "Hover Blue", blue_chars, constellation=1, level=90
    )
    token_b, _ = _register_and_seed_inventory(
        test_client, "877777702", "Hover Red", red_chars, constellation=0, level=90
    )

    rs_id = test_client.get("/api/rulesets").json()[0]["id"]
    code = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id},
    ).json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
    ):
        ws_a.receive_json()
        ws_b.receive_json()

        def recv_both() -> dict:
            m_a = ws_a.receive_json()
            ws_b.receive_json()
            return m_a

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_both()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_both()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        state = recv_both()["state"]
        assert state["hoverCharacterSlug"] is None
        assert state["sides"]["blue"]["reserveRemainingSeconds"] == 120.0

        # Blue ban hờ nhân vật -> cả 2 nhận được hoverCharacterSlug
        hover_slug = all_chars[45]["slug"]
        ws_a.send_json({"action": "draft_hover", "characterSlug": hover_slug})
        state = recv_both()["state"]
        assert state["hoverCharacterSlug"] == hover_slug

        # Red không phải lượt nên không được hover
        ws_b.send_json({"action": "draft_hover", "characterSlug": all_chars[46]["slug"]})
        err = ws_b.receive_json()
        assert err["type"] == "match:error"
        assert err["code"] == "FORBIDDEN"

        # Blue khóa Ban -> hoverCharacterSlug tự reset về None
        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": hover_slug})
        state = recv_both()["state"]
        assert state["hoverCharacterSlug"] is None
        assert state["sides"]["blue"]["bans"] == [hover_slug]


def test_custom_cost_activation_in_match_ws_and_admin_override(test_client: TestClient) -> None:
    all_chars, weapon4_by_type, _ = _load_sample_catalog()
    blue_chars = all_chars[:16]
    red_chars = all_chars[16:32]

    token_a, _ = _register_and_seed_inventory(
        test_client, "888888801", "Custom Blue", blue_chars, constellation=0, level=90
    )
    token_b, _ = _register_and_seed_inventory(
        test_client, "888888802", "Custom Red", red_chars, constellation=0, level=90
    )

    settings = get_settings()
    admin_token = test_client.post(
        "/api/auth/login",
        json={
            "uid": settings.SEED_ADMIN_UID,
            "password": settings.SEED_ADMIN_PASSWORD,
            "remember": True,
        },
    ).json()["token"]

    target_blue_char = blue_chars[0]
    target_blue_weapon = weapon4_by_type[target_blue_char["weapon"]]

    cfg = default_ruleset_config().model_dump(by_alias=True)
    # Gọn nhẹ 2 lượt pick để test nhanh luồng weapon_phase & scoring
    cfg["draftSteps"] = [
        {"step": 1, "side": "blue", "action": "pick"},
        {"step": 2, "side": "red", "action": "pick"},
    ]
    cfg["costRules"]["characterCustomCosts"] = {
        target_blue_char["slug"]: [
            {
                "id": "cc-special",
                "costs": [3.5, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
                "note": "Đi cùng đội hình đặc biệt",
            }
        ]
    }
    cfg["costRules"]["weaponCustomCosts"] = {
        target_blue_weapon: [
            {
                "id": "wc-special",
                "cost": 1.5,
                "refinementSeconds": [0.0, 5.0, 10.0, 15.0, 20.0],
                "note": "Kích hoạt hiệu ứng đặc biệt",
            }
        ]
    }

    rs_res = test_client.post(
        "/api/rulesets",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Luật Custom Cost Test",
            "description": "Test custom cost",
            "isActive": True,
            "isDefault": False,
            "config": cfg,
        },
    )
    assert rs_res.status_code == 200
    rs_id = rs_res.json()["id"]

    code = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id},
    ).json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
        test_client.websocket_connect(f"/ws/matches/{code}?token={admin_token}") as ws_admin,
    ):
        for ws in (ws_a, ws_b, ws_admin):
            ws.receive_json()

        def recv_all() -> dict:
            st = ws_a.receive_json()
            ws_b.receive_json()
            ws_admin.receive_json()
            return st

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_all()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_all()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_all()
        ws_b.send_json({"action": "set_ready", "ready": True})
        recv_all()

        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": target_blue_char["slug"]})
        recv_all()
        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": red_chars[0]["slug"]})
        state = recv_all()["state"]
        assert state["status"] == "weapon_phase"

        base_char_cost = state["sides"]["blue"]["picks"][0]["characterCost"]

        # Player Blue bật Custom Cost nhân vật
        ws_a.send_json({"action": "set_character_custom_cost", "slot": 0, "customCostId": "cc-special"})
        state = recv_all()["state"]
        blue_pick0 = state["sides"]["blue"]["picks"][0]
        assert blue_pick0["characterCustomCostId"] == "cc-special"
        assert blue_pick0["characterCustomCostNote"] == "Đi cùng đội hình đặc biệt"
        assert blue_pick0["characterCost"] == 3.5

        # Player Blue chọn vũ khí kèm Custom Cost vũ khí
        ws_a.send_json(
            {
                "action": "set_weapon",
                "slot": 0,
                "weaponSlug": target_blue_weapon,
                "refinement": 3,
                "weaponCustomCostId": "wc-special",
            }
        )
        state = recv_all()["state"]
        blue_pick0 = state["sides"]["blue"]["picks"][0]
        assert blue_pick0["weaponCustomCostId"] == "wc-special"
        assert blue_pick0["weaponCustomCostNote"] == "Kích hoạt hiệu ứng đặc biệt"
        assert blue_pick0["weaponCost"] == 1.5
        assert blue_pick0["weaponRefinementSeconds"] == 10.0
        assert blue_pick0["totalSlotCost"] == 5.0
        assert state["sides"]["blue"]["totalCost"] == 5.0

        # Red chọn vũ khí thường và cả 2 khóa
        red_weapon = weapon4_by_type[red_chars[0]["weapon"]]
        ws_b.send_json(
            {
                "action": "set_weapon",
                "slot": 0,
                "weaponSlug": red_weapon,
                "refinement": 1,
            }
        )
        recv_all()

        ws_a.send_json({"action": "lock_weapons"})
        recv_all()

        # Khi đã khóa vũ khí, Player Blue không thể đổi Custom Cost nữa
        ws_a.send_json({"action": "set_character_custom_cost", "slot": 0, "customCostId": None})
        err_locked = ws_a.receive_json()
        assert err_locked["type"] == "match:error"
        assert err_locked["code"] == "WEAPONS_LOCKED"

        ws_b.send_json({"action": "lock_weapons"})
        state = recv_all()["state"]
        assert state["status"] == "scoring"

        # Blue nộp điểm 3 ải (8:00 mỗi ải => 60*3 = 180s)
        ws_a.send_json({"action": "submit_scores", "chambers": [{"minutes": 8, "seconds": 0}] * 3})
        state = recv_all()["state"]
        score_before_admin = state["sides"]["blue"]["finalScore"]

        # Admin tắt Custom Cost nhân vật cho Blue ngay trong pha scoring -> điểm tự tính lại
        ws_admin.send_json(
            {
                "action": "set_character_custom_cost",
                "side": "blue",
                "slot": 0,
                "customCostId": None,
            }
        )
        state = recv_all()["state"]
        assert state["sides"]["blue"]["picks"][0]["characterCustomCostId"] is None
        assert state["sides"]["blue"]["picks"][0]["characterCost"] == base_char_cost
        assert state["sides"]["blue"]["finalScore"] < score_before_admin


def test_lock_weapons_without_filling_and_clear_weapon(test_client: TestClient) -> None:
    all_chars, _, weapon5_by_type = _load_sample_catalog()
    blue_chars = all_chars[:8]
    red_chars = all_chars[8:16]

    token_a, _ = _register_and_seed_inventory(
        test_client, "891111101", "Empty Wep Blue", blue_chars, constellation=0, level=90
    )
    token_b, _ = _register_and_seed_inventory(
        test_client, "891111102", "Empty Wep Red", red_chars, constellation=0, level=90
    )

    settings = get_settings()
    admin_token = test_client.post(
        "/api/auth/login",
        json={
            "uid": settings.SEED_ADMIN_UID,
            "password": settings.SEED_ADMIN_PASSWORD,
            "remember": True,
        },
    ).json()["token"]

    cfg = default_ruleset_config().model_dump(by_alias=True)
    cfg["draftSteps"] = [
        {"step": 1, "side": "blue", "action": "pick"},
        {"step": 2, "side": "red", "action": "pick"},
        {"step": 3, "side": "blue", "action": "pick"},
        {"step": 4, "side": "red", "action": "pick"},
    ]
    rs_id = test_client.post(
        "/api/rulesets",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Luật Khóa Vũ Khí Trống",
            "description": "Test empty weapon = 4 star",
            "isActive": True,
            "isDefault": False,
            "config": cfg,
        },
    ).json()["id"]

    code = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id},
    ).json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
    ):
        ws_a.receive_json()
        ws_b.receive_json()

        def recv_both() -> dict:
            m_a = ws_a.receive_json()
            ws_b.receive_json()
            return m_a

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_both()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_both()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        recv_both()

        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": blue_chars[0]["slug"]})
        recv_both()
        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": red_chars[0]["slug"]})
        recv_both()
        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": blue_chars[1]["slug"]})
        recv_both()
        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": red_chars[1]["slug"]})
        state = recv_both()["state"]
        assert state["status"] == "weapon_phase"

        # Blue chọn vũ khí 5★ cho slot 0 rồi xóa về mặc định 4★ (weaponSlug=None), slot 1 để trống
        blue_char0 = next(c for c in all_chars if c["slug"] == state["sides"]["blue"]["picks"][0]["characterSlug"])
        ws_a.send_json(
            {
                "action": "set_weapon",
                "slot": 0,
                "weaponSlug": weapon5_by_type[blue_char0["weapon"]],
                "refinement": 3,
            }
        )
        state = recv_both()["state"]
        assert state["sides"]["blue"]["picks"][0]["weaponCost"] == 1.0
        assert state["sides"]["blue"]["picks"][0]["weaponRefinementSeconds"] == 10.0

        ws_a.send_json(
            {
                "action": "set_weapon",
                "slot": 0,
                "weaponSlug": None,
                "refinement": 1,
            }
        )
        state = recv_both()["state"]
        assert state["sides"]["blue"]["picks"][0]["weaponSlug"] is None
        assert state["sides"]["blue"]["picks"][0]["weaponCost"] == 0.0
        assert state["sides"]["blue"]["picks"][0]["weaponRefinementSeconds"] == 0.0
        assert state["sides"]["blue"]["weaponRefinementSeconds"] == 0.0

        # Cả 2 bên không điền bất kỳ vũ khí nào vẫn khóa thành công -> sang scoring
        ws_a.send_json({"action": "lock_weapons"})
        state = recv_both()["state"]
        assert state["sides"]["blue"]["weaponsLocked"] is True

        ws_b.send_json({"action": "lock_weapons"})
        state = recv_both()["state"]
        assert state["status"] == "scoring"
        assert state["sides"]["red"]["weaponsLocked"] is True
        for s_key in ("blue", "red"):
            for p in state["sides"][s_key]["picks"]:
                assert p["weaponSlug"] is None
                assert p["weaponCost"] == 0.0
                assert p["weaponRefinementSeconds"] == 0.0


def test_weapon_phase_auto_lock_on_timeout_ws(test_client: TestClient) -> None:
    import time

    all_chars, _, _ = _load_sample_catalog()
    blue_chars = all_chars[:6]
    red_chars = all_chars[6:12]

    token_a, _ = _register_and_seed_inventory(
        test_client, "892222201", "Timeout Blue", blue_chars, constellation=0, level=90
    )
    token_b, _ = _register_and_seed_inventory(
        test_client, "892222202", "Timeout Red", red_chars, constellation=0, level=90
    )

    settings = get_settings()
    admin_token = test_client.post(
        "/api/auth/login",
        json={
            "uid": settings.SEED_ADMIN_UID,
            "password": settings.SEED_ADMIN_PASSWORD,
            "remember": True,
        },
    ).json()["token"]

    cfg = default_ruleset_config().model_dump(by_alias=True)
    cfg["draftSteps"] = [
        {"step": 1, "side": "blue", "action": "pick"},
        {"step": 2, "side": "red", "action": "pick"},
    ]
    cfg["weaponPhaseSeconds"] = 1
    cfg["costRules"]["draftBonusSecondsPerCost"] = 0

    rs_id = test_client.post(
        "/api/rulesets",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Luật Auto Lock Weapon 1s",
            "description": "Test weapon phase auto lock",
            "isActive": True,
            "isDefault": False,
            "config": cfg,
        },
    ).json()["id"]

    # 1) Kiểm tra Admin undo từ weapon_phase về drafting hủy timer cũ (không tự động nhảy sang scoring)
    code_undo = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id},
    ).json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code_undo}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code_undo}?token={token_b}") as ws_b,
        test_client.websocket_connect(f"/ws/matches/{code_undo}?token={admin_token}") as ws_admin,
    ):
        for ws in (ws_a, ws_b, ws_admin):
            ws.receive_json()

        def recv_all() -> dict:
            m = ws_a.receive_json()
            ws_b.receive_json()
            ws_admin.receive_json()
            return m

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_all()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_all()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_all()
        ws_b.send_json({"action": "set_ready", "ready": True})
        recv_all()

        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": blue_chars[0]["slug"]})
        recv_all()
        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": red_chars[0]["slug"]})
        state = recv_all()["state"]
        assert state["status"] == "weapon_phase"

        ws_admin.send_json({"action": "undo_draft_step"})
        state = recv_all()["state"]
        assert state["status"] == "drafting"

        time.sleep(1.2)
        fetched = test_client.get(f"/api/matches/{code_undo}").json()
        assert fetched["status"] == "drafting"

    # 2) Kiểm tra hết thời gian weapon_phase -> tự động khóa cả 2 bên và broadcast sang scoring
    code = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id},
    ).json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
    ):
        ws_a.receive_json()
        ws_b.receive_json()

        def recv_both() -> dict:
            m_a = ws_a.receive_json()
            ws_b.receive_json()
            return m_a

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_both()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_both()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        recv_both()

        ws_a.send_json({"action": "draft_pick_or_ban", "characterSlug": blue_chars[0]["slug"]})
        recv_both()
        ws_b.send_json({"action": "draft_pick_or_ban", "characterSlug": red_chars[0]["slug"]})
        state = recv_both()["state"]
        assert state["status"] == "weapon_phase"

        # Không điền vũ khí và không bấm lock_weapons -> chờ >1s để timer tự khóa và broadcast
        time.sleep(1.3)
        msg_a = ws_a.receive_json()
        msg_b = ws_b.receive_json()
        assert msg_a["type"] == "match:state"
        assert msg_b["type"] == "match:state"
        auto_state = msg_a["state"]
        assert auto_state["status"] == "scoring"
        assert auto_state["turnDeadlineAt"] is None
        assert auto_state["sides"]["blue"]["weaponsLocked"] is True
        assert auto_state["sides"]["red"]["weaponsLocked"] is True
        assert auto_state["sides"]["blue"]["overtimePenaltySeconds"] == 0.0
        assert auto_state["sides"]["red"]["overtimePenaltySeconds"] == 0.0
        assert auto_state["sides"]["blue"]["picks"][0]["weaponSlug"] is None
        assert auto_state["sides"]["blue"]["picks"][0]["weaponCost"] == 0.0
        assert auto_state["sides"]["red"]["picks"][0]["weaponSlug"] is None
        assert auto_state["sides"]["red"]["picks"][0]["weaponCost"] == 0.0


def test_draft_forfeit_timeout_engine_rules() -> None:
    all_chars, _, _ = _load_sample_catalog()
    blue_inv = {c["slug"]: {"constellation": 0, "level": 90} for c in all_chars[:16]}
    red_inv = {c["slug"]: {"constellation": 0, "level": 90} for c in all_chars[16:32]}

    def make_started_match(
        *,
        match_format: str = "bo1",
        use_reserve: bool = False,
        reserve_sec: int = 30,
        max_overtime: int = 600,
    ):
        rs = default_ruleset_config()
        rs.use_reserve_time = use_reserve
        rs.reserve_time_seconds = reserve_sec
        rs.max_overtime_seconds = max_overtime
        st = draft_engine.create_initial_match_state(
            code="FRFT01",
            ruleset_id="rs-1",
            ruleset_name="Forfeit Test",
            ruleset=rs,
            host_user_id="u-blue",
            match_format=match_format,  # type: ignore[arg-type]
        )
        st = draft_engine.select_side(
            st, user_id="u-blue", uid="800000101", display_name="Blue", owned_characters=blue_inv, side="blue"
        )
        st = draft_engine.select_side(
            st, user_id="u-red", uid="800000102", display_name="Red", owned_characters=red_inv, side="red"
        )
        st = draft_engine.set_ready(st, user_id="u-blue", ready=True)
        st = draft_engine.set_ready(st, user_id="u-red", ready=True)
        return st

    # 1) Tắt giới hạn âm (max_overtime_seconds=0) -> không xử thua
    st_unlimited = make_started_match(max_overtime=0)
    assert draft_engine.get_draft_forfeit_deadline(st_unlimited) is None
    assert draft_engine.is_draft_forfeit_expired(
        st_unlimited, now=datetime.now(timezone.utc) + timedelta(hours=5)
    ) is False

    # 2) BO1 có reserve time: chỉ hết hạn xử thua sau turn + reserve + max_overtime
    st_bo1 = make_started_match(match_format="bo1", use_reserve=True, reserve_sec=20, max_overtime=600)
    assert st_bo1.turn_deadline_at is not None
    dl = datetime.fromisoformat(st_bo1.turn_deadline_at)
    forfeit_at = draft_engine.get_draft_forfeit_deadline(st_bo1)
    assert forfeit_at == dl + timedelta(seconds=620)
    assert draft_engine.is_draft_forfeit_expired(st_bo1, now=dl + timedelta(seconds=619)) is False
    assert draft_engine.is_draft_forfeit_expired(st_bo1, now=dl + timedelta(seconds=620)) is True

    # Nếu quá hạn khi gọi apply_draft_action -> lập tức xử thua cho bên tới lượt (Blue thua, Red thắng)
    forfeited_bo1 = draft_engine.apply_draft_action(
        st_bo1,
        user_id="u-blue",
        character_slug=all_chars[40]["slug"],
        now=dl + timedelta(seconds=625),
    )
    assert forfeited_bo1.status == "finished"
    assert forfeited_bo1.winner_side == "red"
    assert forfeited_bo1.winner_user_id == "u-red"
    assert forfeited_bo1.last_game_win_reason == "forfeit_timeout"
    assert forfeited_bo1.turn_deadline_at is None
    assert forfeited_bo1.sides["blue"].reserve_remaining_seconds == 0.0
    assert forfeited_bo1.sides["blue"].overtime_penalty_seconds == 600.0

    # 3) BO3 ván 1 xử thua -> sang between_games, cộng 1 điểm cho bên thắng và bên thua được chọn bên ván 2
    st_bo3 = make_started_match(match_format="bo3", use_reserve=False, max_overtime=600)
    dl_bo3 = datetime.fromisoformat(st_bo3.turn_deadline_at or "")
    st_bo3 = draft_engine.apply_draft_action(
        st_bo3,
        user_id="u-blue",
        character_slug=None,
        now=dl_bo3 + timedelta(seconds=600),
    )
    assert st_bo3.status == "between_games"
    assert st_bo3.last_game_win_reason == "forfeit_timeout"
    assert st_bo3.series_scores == {"u-blue": 0, "u-red": 1}
    assert len(st_bo3.game_history) == 1
    assert st_bo3.game_history[0].winner_side == "red"
    assert st_bo3.game_history[0].win_reason == "forfeit_timeout"
    assert st_bo3.next_game_setup is not None
    assert st_bo3.next_game_setup.side_picker_user_id == "u-blue"


def test_draft_forfeit_auto_timeout_ws(test_client: TestClient) -> None:
    import time

    all_chars, _, _ = _load_sample_catalog()
    blue_chars = all_chars[:6]
    red_chars = all_chars[6:12]

    token_a, uid_a = _register_and_seed_inventory(
        test_client, "893333301", "Forfeit Blue", blue_chars, constellation=0, level=90
    )
    token_b, uid_b = _register_and_seed_inventory(
        test_client, "893333302", "Forfeit Red", red_chars, constellation=0, level=90
    )

    settings = get_settings()
    admin_token = test_client.post(
        "/api/auth/login",
        json={
            "uid": settings.SEED_ADMIN_UID,
            "password": settings.SEED_ADMIN_PASSWORD,
            "remember": True,
        },
    ).json()["token"]

    cfg = default_ruleset_config().model_dump(by_alias=True)
    cfg["draftSteps"] = [
        {"step": 1, "side": "blue", "action": "ban"},
        {"step": 2, "side": "blue", "action": "pick"},
        {"step": 3, "side": "red", "action": "pick"},
    ]
    cfg["banSeconds"] = 1
    cfg["pickSeconds"] = 1
    cfg["useReserveTime"] = False
    cfg["maxOvertimeSeconds"] = 1
    cfg["costRules"]["draftBonusSecondsPerCost"] = 0

    rs_id = test_client.post(
        "/api/rulesets",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Luật Xử Thua 1s",
            "description": "Test auto forfeit on max overtime",
            "isActive": True,
            "isDefault": False,
            "config": cfg,
        },
    ).json()["id"]

    code = test_client.post(
        "/api/matches",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"rulesetId": rs_id},
    ).json()["code"]

    with (
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_a}") as ws_a,
        test_client.websocket_connect(f"/ws/matches/{code}?token={token_b}") as ws_b,
    ):
        ws_a.receive_json()
        ws_b.receive_json()

        def recv_both() -> dict:
            m_a = ws_a.receive_json()
            ws_b.receive_json()
            return m_a

        ws_a.send_json({"action": "select_side", "side": "blue"})
        recv_both()
        ws_b.send_json({"action": "select_side", "side": "red"})
        recv_both()
        ws_a.send_json({"action": "set_ready", "ready": True})
        recv_both()
        ws_b.send_json({"action": "set_ready", "ready": True})
        started = recv_both()["state"]
        assert started["status"] == "drafting"

        # Blue không ban trong 1s + âm tối đa 1s -> sau ~2.3s tự động xử thua
        time.sleep(2.3)
        msg_a = ws_a.receive_json()
        msg_b = ws_b.receive_json()
        assert msg_a["type"] == "match:state"
        assert msg_b["type"] == "match:state"
        assert msg_a["notice"]["tone"] == "error"
        forfeit_state = msg_a["state"]
        assert forfeit_state["status"] == "finished"
        assert forfeit_state["winnerSide"] == "red"
        assert forfeit_state["winnerUserId"] == uid_b
        assert forfeit_state["lastGameWinReason"] == "forfeit_timeout"
        assert forfeit_state["turnDeadlineAt"] is None
        assert forfeit_state["sides"]["blue"]["overtimePenaltySeconds"] == 1.0
        assert forfeit_state["sides"]["blue"]["player"]["userId"] == uid_a



