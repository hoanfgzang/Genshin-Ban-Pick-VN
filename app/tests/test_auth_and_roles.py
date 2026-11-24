from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings


def test_register_login_uid_and_admin_rbac(test_client: TestClient) -> None:
    settings = get_settings()

    # 1. Đăng ký tài khoản Player bằng UID 9-10 chữ số
    reg_res = test_client.post(
        "/api/auth/register",
        json={
            "uid": "801234567",
            "displayName": "Nhà Lữ Hành A",
            "email": "",
            "password": "Password123",
        },
    )
    assert reg_res.status_code == 200
    player_data = reg_res.json()
    assert player_data["user"]["uid"] == "801234567"
    assert player_data["user"]["role"] == "player"
    player_token = player_data["token"]

    # 2. Player không được phép tạo hoặc chỉnh sửa Bộ luật (403)
    rules_res = test_client.get("/api/rulesets")
    assert rules_res.status_code == 200
    rulesets = rules_res.json()
    assert len(rulesets) == 1
    default_rs = rulesets[0]

    forbidden_res = test_client.post(
        "/api/rulesets",
        headers={"Authorization": f"Bearer {player_token}"},
        json={
            "name": "Luật Hack",
            "description": "",
            "isActive": True,
            "isDefault": False,
            "config": default_rs["config"],
        },
    )
    assert forbidden_res.status_code == 403
    assert forbidden_res.json()["code"] == "FORBIDDEN"

    # 3. Đăng nhập tài khoản Admin mặc định
    admin_res = test_client.post(
        "/api/auth/login",
        json={
            "uid": settings.SEED_ADMIN_UID,
            "password": settings.SEED_ADMIN_PASSWORD,
            "remember": True,
        },
    )
    assert admin_res.status_code == 200
    admin_data = admin_res.json()
    assert admin_data["user"]["role"] == "admin"
    admin_token = admin_data["token"]

    # 4. Admin tạo bộ luật mới thành công
    create_rs_res = test_client.post(
        "/api/rulesets",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Luật Giải Mùa 2",
            "description": "4★ Bennett C6 tính 0.5 cost",
            "isActive": True,
            "isDefault": False,
            "config": {
                **default_rs["config"],
                "costRules": {
                    **default_rs["config"]["costRules"],
                    "characterOverrides": {
                        "bennett": [0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.5],
                    },
                },
            },
        },
    )
    assert create_rs_res.status_code == 200
    created_rs = create_rs_res.json()
    assert created_rs["config"]["costRules"]["characterOverrides"]["bennett"][6] == 0.5


def test_super_admin_role_management_and_secret_key(
    test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()

    # Đăng ký 2 tài khoản Player
    p1_res = test_client.post(
        "/api/auth/register",
        json={"uid": "805555501", "displayName": "Player One", "password": "Password123"},
    )
    assert p1_res.status_code == 200
    p1_id = p1_res.json()["user"]["id"]
    p1_token = p1_res.json()["token"]

    p2_res = test_client.post(
        "/api/auth/register",
        json={"uid": "805555502", "displayName": "Player Two", "password": "Password123"},
    )
    assert p2_res.status_code == 200
    p2_id = p2_res.json()["user"]["id"]
    p2_token = p2_res.json()["token"]

    # Đăng nhập Chủ hệ thống (SEED_ADMIN_UID)
    super_res = test_client.post(
        "/api/auth/login",
        json={
            "uid": settings.SEED_ADMIN_UID,
            "password": settings.SEED_ADMIN_PASSWORD,
            "remember": True,
        },
    )
    assert super_res.status_code == 200
    super_data = super_res.json()
    assert super_data["user"]["isSuperAdmin"] is True
    super_id = super_data["user"]["id"]
    super_token = super_data["token"]

    # Player thường bị chặn khỏi /api/admin/users
    assert (
        test_client.get(
            "/api/admin/users",
            headers={"Authorization": f"Bearer {p1_token}"},
        ).status_code
        == 403
    )

    # Chủ hệ thống liệt kê & tìm kiếm tài khoản
    list_res = test_client.get(
        "/api/admin/users?q=805555501",
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert list_res.status_code == 200
    assert [u["uid"] for u in list_res.json()] == ["805555501"]

    # Chủ hệ thống nâng Player One lên Admin thường
    promote_res = test_client.patch(
        f"/api/admin/users/{p1_id}/role",
        headers={"Authorization": f"Bearer {super_token}"},
        json={"role": "admin"},
    )
    assert promote_res.status_code == 200
    assert promote_res.json()["role"] == "admin"

    # Player One lúc này là Admin thường (isSuperAdmin=False): tạo được Bộ luật,
    # nhưng KHÔNG được phép vào /api/admin/users hay phong/hạ quyền Admin khác
    p1_me = test_client.get("/api/auth/me", headers={"Authorization": f"Bearer {p1_token}"}).json()
    assert p1_me["role"] == "admin"
    assert p1_me["isSuperAdmin"] is False

    default_rs = test_client.get("/api/rulesets").json()[0]
    assert (
        test_client.post(
            "/api/rulesets",
            headers={"Authorization": f"Bearer {p1_token}"},
            json={
                "name": "Luật Admin Thường",
                "description": "",
                "isActive": True,
                "isDefault": False,
                "config": default_rs["config"],
            },
        ).status_code
        == 200
    )
    assert (
        test_client.get(
            "/api/admin/users",
            headers={"Authorization": f"Bearer {p1_token}"},
        ).status_code
        == 403
    )
    assert (
        test_client.patch(
            f"/api/admin/users/{super_id}/role",
            headers={"Authorization": f"Bearer {p1_token}"},
            json={"role": "player"},
        ).status_code
        == 403
    )
    assert (
        test_client.patch(
            f"/api/admin/users/{p2_id}/role",
            headers={"Authorization": f"Bearer {p1_token}"},
            json={"role": "admin"},
        ).status_code
        == 403
    )

    # Chủ hệ thống không thể tự hạ quyền chính mình
    self_demote = test_client.patch(
        f"/api/admin/users/{super_id}/role",
        headers={"Authorization": f"Bearer {super_token}"},
        json={"role": "player"},
    )
    assert self_demote.status_code == 400
    assert self_demote.json()["code"] == "CANNOT_DEMOTE_SELF"

    # Kiểm tra ADMIN_SECRET_KEY từ xa (không cần JWT)
    assert (
        test_client.get(
            "/api/admin/users",
            headers={"X-Admin-Secret": "wrong-key"},
        ).status_code
        == 403
    )

    monkeypatch.setenv("ADMIN_SECRET_KEY", "my-super-secret-2026")
    get_settings.cache_clear()
    try:
        assert (
            test_client.get(
                "/api/admin/users",
                headers={"X-Admin-Secret": "wrong-key"},
            ).status_code
            == 403
        )

        # Thăng Player Two lên Admin bằng X-Admin-Secret theo UID
        secret_promote = test_client.post(
            "/api/admin/users/by-uid",
            headers={"X-Admin-Secret": "my-super-secret-2026"},
            json={"uid": "805555502", "role": "admin"},
        )
        assert secret_promote.status_code == 200
        assert secret_promote.json()["role"] == "admin"

        p2_me = test_client.get("/api/auth/me", headers={"Authorization": f"Bearer {p2_token}"}).json()
        assert p2_me["role"] == "admin"
        assert p2_me["isSuperAdmin"] is False

        # Không được hạ quyền Seed Admin kể cả khi dùng Secret Key
        demote_seed = test_client.post(
            "/api/admin/users/by-uid",
            headers={"X-Admin-Secret": "my-super-secret-2026"},
            json={"uid": settings.SEED_ADMIN_UID, "role": "player"},
        )
        assert demote_seed.status_code == 400
        assert demote_seed.json()["code"] == "CANNOT_DEMOTE_SEED_ADMIN"

        # Hạ Player One xuống lại player
        demote_p1 = test_client.patch(
            f"/api/admin/users/{p1_id}/role",
            headers={"X-Admin-Secret": "my-super-secret-2026"},
            json={"role": "player"},
        )
        assert demote_p1.status_code == 200
        assert demote_p1.json()["role"] == "player"
    finally:
        monkeypatch.delenv("ADMIN_SECRET_KEY", raising=False)
        get_settings.cache_clear()

