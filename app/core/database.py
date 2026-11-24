from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings


class Base(DeclarativeBase):
    pass


def create_engine_and_session(database_url: str | None = None) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    url = database_url or get_settings().resolved_database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_async_engine(url, echo=False, future=True, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return engine, session_factory


engine, async_session_maker = create_engine_and_session()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
