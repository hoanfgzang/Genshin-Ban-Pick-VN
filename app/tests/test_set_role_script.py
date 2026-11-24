from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.database import create_engine_and_session, get_db
from app.main import create_app
from app.scripts.set_role import main
from app.services.room_manager import room_manager


def _ruleset_payload(base_config: dict) -> dict:
    return {
        "name": "Luật Kiểm Tra Admin",
        "description": "Tạo sau khi cấp quyền admin",
        "isActive": True,
        "isDefault": False,
        "config": base_config,
    }


def test_set_role_promote_demote_list_and_rbac(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    db_file = tmp_path / "test_role.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    test_engine, test_session_factory = create_engine_and_session(db_url)
    test_app = create_app(db_engine=test_engine, session_factory=test_session_factory)

    async def override_get_db():
        async with test_session_factory() as session:
            yield session

    test_app.dependency_overrides[get_db] = override_get_db
    room_manager.bind_session_factory(test_session_factory)

    try:
        with TestClient(test_app) as client:
            reg_res = client.post(
                "/api/auth/register",
                json={
                    "uid": "809876543",
                    "displayName": "Người Chơi A",
                    "email": "player.a@example.com",
                    "password": "Password123",
                },
            )
            assert reg_res.status_code == 200
            token = reg_res.json()["token"]
            headers = {"Authorization": f"Bearer {token}"}

            rules_res = client.get("/api/rulesets")
            assert rules_res.status_code == 200
            base_config = rules_res.json()[0]["config"]

            # Player ban đầu chỉ có role player và bị chặn tạo bộ luật
            me_res = client.get("/api/auth/me", headers=headers)
            assert me_res.status_code == 200
            assert me_res.json()["role"] == "player"
            assert client.post("/api/rulesets", headers=headers, json=_ruleset_payload(base_config)).status_code == 403

            # 1. Nâng quyền admin theo UID (mặc định --role admin)
            capsys.readouterr()
            exit_code = main(["809876543", "--db", db_url])
            out = capsys.readouterr()
            assert exit_code == 0
            assert "player -> admin" in out.out

            me_res = client.get("/api/auth/me", headers=headers)
            assert me_res.status_code == 200
            assert me_res.json()["role"] == "admin"
            assert client.post("/api/rulesets", headers=headers, json=_ruleset_payload(base_config)).status_code == 200

            # 2. Chạy lại khi đã là admin (idempotent)
            exit_code = main(["809876543", "--db", db_url])
            out = capsys.readouterr()
            assert exit_code == 0
            assert "đã có quyền 'admin'" in out.out

            # 3. Hạ quyền về player theo email không phân biệt hoa thường
            exit_code = main(["--email", "Player.A@Example.com", "--role", "player", "--db", db_url])
            out = capsys.readouterr()
            assert exit_code == 0
            assert "admin -> player" in out.out

            me_res = client.get("/api/auth/me", headers=headers)
            assert me_res.status_code == 200
            assert me_res.json()["role"] == "player"
            assert client.post("/api/rulesets", headers=headers, json=_ruleset_payload(base_config)).status_code == 403

            # 4. Liệt kê toàn bộ và lọc theo role admin
            seed_uid = get_settings().SEED_ADMIN_UID
            exit_code = main(["--list", "--db", db_url])
            out = capsys.readouterr()
            assert exit_code == 0
            assert seed_uid in out.out
            assert "809876543" in out.out

            exit_code = main(["--list", "--role", "admin", "--db", db_url])
            out = capsys.readouterr()
            assert exit_code == 0
            assert seed_uid in out.out
            assert "809876543" not in out.out
    finally:
        asyncio.run(test_engine.dispose())


def test_set_role_errors(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    db_file = tmp_path / "test_errors.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    test_engine, test_session_factory = create_engine_and_session(db_url)
    test_app = create_app(db_engine=test_engine, session_factory=test_session_factory)

    async def override_get_db():
        async with test_session_factory() as session:
            yield session

    test_app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(test_app):
            capsys.readouterr()

            # Không tìm thấy UID
            assert main(["999999999", "--db", db_url]) == 1
            assert "Không tìm thấy tài khoản" in capsys.readouterr().err

            # Thiếu cả UID lẫn --email
            assert main(["--db", db_url]) == 2
            assert capsys.readouterr().err

            # Truyền cả UID lẫn --email
            assert main(["809876543", "--email", "a@b.com", "--db", db_url]) == 2
            assert capsys.readouterr().err

            # Truyền --list kèm UID
            assert main(["--list", "809876543", "--db", db_url]) == 2
            assert capsys.readouterr().err
    finally:
        asyncio.run(test_engine.dispose())

    # File SQLite trống chưa khởi tạo bảng users
    empty_db_file = tmp_path / "uninitialized.db"
    empty_db_file.touch()
    empty_db_url = f"sqlite+aiosqlite:///{empty_db_file.as_posix()}"

    assert main(["809876543", "--db", empty_db_url]) == 1
    err = capsys.readouterr().err
    assert "Lỗi cơ sở dữ liệu" in err
