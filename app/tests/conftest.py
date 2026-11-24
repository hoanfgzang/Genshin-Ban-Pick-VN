from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.database import Base, create_engine_and_session, get_db
from app.main import create_app
from app.services.room_manager import room_manager


@pytest.fixture
def test_client(tmp_path: Path) -> Generator[TestClient, None, None]:
    db_file = tmp_path / "test_gbp.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    test_engine, test_session_factory = create_engine_and_session(db_url)
    test_app = create_app(db_engine=test_engine, session_factory=test_session_factory)

    async def override_get_db():
        async with test_session_factory() as session:
            yield session

    test_app.dependency_overrides[get_db] = override_get_db
    room_manager.bind_session_factory(test_session_factory)

    with TestClient(test_app) as client:
        yield client
