from __future__ import annotations

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
