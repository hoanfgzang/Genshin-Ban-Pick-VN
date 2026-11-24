from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

CHARS_PATH = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "characters.json"
WEPS_PATH = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "weapons.json"


def _load_sample_catalog() -> tuple[list[dict], dict[str, str]]:
    chars = json.loads(CHARS_PATH.read_text(encoding="utf-8"))
    weps = json.loads(WEPS_PATH.read_text(encoding="utf-8"))
    # Chọn 1 vũ khí 4★ hoặc 5★ bất kỳ cho mỗi loại vũ khí
    weapon_by_type: dict[str, str] = {}
    for w in weps:
        if w["rarity"] == 4 and w["weaponType"] not in weapon_by_type:
            weapon_by_type[w["weaponType"]] = w["slug"]
    return chars, weapon_by_type


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
    all_chars, weapon_by_type = _load_sample_catalog()
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
                ws_a.send_json(
                    {
                        "action": "set_weapon",
                        "slot": 0,
                        "weaponSlug": weapon_by_type[char_obj["weapon"]],
                        "refinement": 3,
                    }
                )
                state = ws_a.receive_json()["state"]
                ws_b.receive_json()
                assert state["sides"]["blue"]["picks"][0]["refinement"] == 3

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


def test_match_validation_edge_cases(test_client: TestClient) -> None:
    all_chars, _ = _load_sample_catalog()
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

