from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..core.errors import AppError
from ..models.inventory import UserCharacter
from ..models.match import Match
from ..models.user import User
from ..schemas.match import MatchState, SideName
from . import draft_engine


class RoomManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._timers: dict[str, asyncio.Task[None]] = {}
        self._session_factory: async_sessionmaker[AsyncSession] | None = None

    def bind_session_factory(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = factory

    def _get_lock(self, code: str) -> asyncio.Lock:
        code = code.upper()
        if code not in self._locks:
            self._locks[code] = asyncio.Lock()
        return self._locks[code]

    async def connect(self, code: str, ws: WebSocket) -> None:
        code = code.upper()
        await ws.accept()
        self._connections.setdefault(code, set()).add(ws)

    def disconnect(self, code: str, ws: WebSocket) -> None:
        code = code.upper()
        conns = self._connections.get(code)
        if conns:
            conns.discard(ws)
            if not conns:
                self._connections.pop(code, None)

    async def broadcast_state(self, code: str, state: MatchState) -> None:
        code = code.upper()
        conns = list(self._connections.get(code, set()))
        if not conns:
            return
        payload = {"type": "match:state", "state": state.model_dump(by_alias=True)}
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(code, ws)

    def _schedule_timer(self, code: str, deadline_iso: str | None) -> None:
        code = code.upper()
        existing = self._timers.pop(code, None)
        if existing and not existing.done():
            existing.cancel()

        if not deadline_iso or not self._session_factory:
            return

        try:
            deadline = datetime.fromisoformat(deadline_iso)
            delay = (deadline - datetime.now(timezone.utc)).total_seconds()
        except Exception:
            return

        if delay <= 0:
            delay = 0.05

        async def _timeout_task() -> None:
            try:
                await asyncio.sleep(delay + 0.2)
                await self.handle_timeout(code, deadline_iso)
            except asyncio.CancelledError:
                return

        self._timers[code] = asyncio.create_task(_timeout_task())

    async def handle_timeout(self, code: str, expected_deadline: str) -> None:
        if not self._session_factory:
            return
        lock = self._get_lock(code)
        new_state: MatchState | None = None
        async with lock:
            async with self._session_factory() as db:
                match = await self._load_match_model(db, code)
                if not match:
                    return
                state = MatchState.model_validate(match.state_json)
                if state.turn_deadline_at != expected_deadline:
                    return
                updated = draft_engine.auto_handle_timeout(state)
                if not updated:
                    return
                await self._save_match_state(db, match, updated)
                new_state = updated

        if new_state:
            self._schedule_timer(code, new_state.turn_deadline_at)
            await self.broadcast_state(code, new_state)

    async def _load_match_model(self, db: AsyncSession, code: str) -> Match | None:
        res = await db.execute(select(Match).where(Match.code == code.upper()))
        return res.scalar_one_or_none()

    async def _load_user_inventory(self, db: AsyncSession, user_id: str) -> dict[str, dict[str, Any]]:
        res = await db.execute(select(UserCharacter).where(UserCharacter.user_id == user_id))
        rows = res.scalars().all()
        return {
            row.character_slug: {"constellation": row.constellation, "level": row.level}
            for row in rows
        }

    async def _save_match_state(self, db: AsyncSession, match: Match, state: MatchState) -> None:
        match.status = state.status
        match.blue_user_id = state.sides["blue"].player.user_id if state.sides["blue"].player else None
        match.red_user_id = state.sides["red"].player.user_id if state.sides["red"].player else None
        match.winner_side = state.winner_side
        match.state_json = state.model_dump(by_alias=True)
        if state.finished_at and not match.finished_at:
            match.finished_at = datetime.fromisoformat(state.finished_at)
        await db.commit()

    async def get_state(self, db: AsyncSession, code: str) -> MatchState | None:
        match = await self._load_match_model(db, code)
        if not match:
            return None
        return MatchState.model_validate(match.state_json)

    async def handle_action(
        self,
        code: str,
        user: User,
        payload: dict[str, Any],
    ) -> MatchState:
        if not self._session_factory:
            raise RuntimeError("RoomManager session factory not bound.")

        code = code.upper()
        lock = self._get_lock(code)
        action = payload.get("action")

        async with lock:
            async with self._session_factory() as db:
                match = await self._load_match_model(db, code)
                if not match:
                    raise AppError(404, "MATCH_NOT_FOUND", "Không tìm thấy phòng đấu.")

                state = MatchState.model_validate(match.state_json)

                if action == "select_side":
                    raw_side = payload.get("side")
                    side: SideName | None = raw_side if raw_side in ("blue", "red") else None
                    if raw_side is not None and raw_side not in ("blue", "red"):
                        raise AppError(400, "INVALID_SIDE", "Bên chọn phải là Xanh (blue) hoặc Đỏ (red).")
                    inv = await self._load_user_inventory(db, user.id)
                    next_state = draft_engine.select_side(
                        state,
                        user_id=user.id,
                        uid=user.uid,
                        display_name=user.display_name,
                        owned_characters=inv,
                        side=side,
                    )
                elif action == "refresh_inventory":
                    inv = await self._load_user_inventory(db, user.id)
                    next_state = draft_engine.refresh_side_inventory(
                        state,
                        user_id=user.id,
                        owned_characters=inv,
                    )
                elif action == "set_ready":
                    # Tải lại kho mới nhất trước khi sẵn sàng
                    inv = await self._load_user_inventory(db, user.id)
                    synced = draft_engine.refresh_side_inventory(
                        state, user_id=user.id, owned_characters=inv
                    )
                    next_state = draft_engine.set_ready(
                        synced, user_id=user.id, ready=bool(payload.get("ready"))
                    )
                elif action == "draft_pick_or_ban":
                    next_state = draft_engine.apply_draft_action(
                        state,
                        user_id=user.id,
                        character_slug=payload.get("characterSlug"),
                    )
                elif action == "set_weapon":
                    slot = int(payload.get("slot", -1))
                    weapon_slug = str(payload.get("weaponSlug") or "")
                    refinement = int(payload.get("refinement", 1))
                    next_state = draft_engine.set_pick_weapon(
                        state,
                        user_id=user.id,
                        slot=slot,
                        weapon_slug=weapon_slug,
                        refinement=refinement,
                    )
                elif action == "lock_weapons":
                    next_state = draft_engine.lock_weapons(state, user_id=user.id)
                elif action == "submit_scores":
                    chambers = payload.get("chambers")
                    if not isinstance(chambers, list):
                        raise AppError(400, "INVALID_CHAMBER_TIMES", "Dữ liệu thời gian 3 ải không hợp lệ.")
                    next_state = draft_engine.submit_chamber_times(
                        state,
                        user_id=user.id,
                        chambers=chambers,
                    )
                else:
                    raise AppError(400, "UNKNOWN_ACTION", f"Hành động không hợp lệ: {action}")

                await self._save_match_state(db, match, next_state)

        if (
            next_state.turn_deadline_at != state.turn_deadline_at
            or next_state.status != state.status
        ):
            self._schedule_timer(code, next_state.turn_deadline_at)

        await self.broadcast_state(code, next_state)
        return next_state


room_manager = RoomManager()
