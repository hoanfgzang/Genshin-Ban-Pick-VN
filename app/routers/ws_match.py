from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from ..core.config import get_settings
from ..core.database import async_session_maker
from ..core.errors import AppError
from ..core.security import decode_access_token
from ..models.user import User
from ..services.room_manager import room_manager

router = APIRouter(tags=["ws-match"])


async def _resolve_ws_user(websocket: WebSocket) -> User | None:
    settings = get_settings()
    token = websocket.query_params.get("token") or websocket.cookies.get(settings.COOKIE_NAME)
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    factory = room_manager._session_factory or async_session_maker
    async with factory() as db:
        res = await db.execute(select(User).where(User.id == user_id))
        return res.scalar_one_or_none()


@router.websocket("/ws/matches/{code}")
async def match_websocket(websocket: WebSocket, code: str) -> None:
    code = code.upper()
    factory = room_manager._session_factory or async_session_maker
    async with factory() as db:
        initial_state = await room_manager.get_state(db, code)

    if not initial_state:
        await websocket.close(code=4404, reason="Match not found")
        return

    user = await _resolve_ws_user(websocket)
    await room_manager.connect(code, websocket)

    try:
        await websocket.send_json(
            {"type": "match:state", "state": initial_state.model_dump(by_alias=True)}
        )

        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue

            if data.get("action") == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if not user:
                await websocket.send_json(
                    {
                        "type": "match:error",
                        "code": "UNAUTHORIZED",
                        "message": "Bạn đang xem với tư cách Khách. Hãy đăng nhập tài khoản Player để thao tác.",
                    }
                )
                continue

            try:
                await room_manager.handle_action(code, user, data)
            except AppError as err:
                await websocket.send_json(
                    {
                        "type": "match:error",
                        "code": err.code,
                        "message": err.message,
                    }
                )
            except Exception as exc:
                await websocket.send_json(
                    {
                        "type": "match:error",
                        "code": "SERVER_ERROR",
                        "message": f"Không thể xử lý thao tác: {exc}",
                    }
                )
    except WebSocketDisconnect:
        room_manager.disconnect(code, websocket)
    except Exception:
        room_manager.disconnect(code, websocket)
