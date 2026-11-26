from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .core.config import get_settings
from .core.database import Base, async_session_maker, engine
from .core.errors import AppError
from .core.security import hash_password
from .models import Match, RuleSet, User, UserCharacter  # noqa: F401
from .routers import admin_users, auth, catalog, inventory, matches, rulesets, ws_match
from .schemas.ruleset import default_ruleset_config
from .services.room_manager import room_manager


async def seed_initial_data(session_factory: async_sessionmaker[AsyncSession]) -> None:
    settings = get_settings()
    async with session_factory() as db:
        admin_res = await db.execute(select(User).where(User.uid == settings.SEED_ADMIN_UID))
        admin = admin_res.scalar_one_or_none()
        if not admin:
            admin = User(
                uid=settings.SEED_ADMIN_UID,
                display_name=settings.SEED_ADMIN_NAME,
                email=None,
                password_hash=hash_password(settings.SEED_ADMIN_PASSWORD),
                role="admin",
            )
            db.add(admin)
            await db.flush()
        elif admin.role != "admin":
            admin.role = "admin"
            await db.flush()

        rs_res = await db.execute(select(RuleSet).limit(1))
        if not rs_res.scalar_one_or_none():
            default_cfg = default_ruleset_config()
            db.add(
                RuleSet(
                    name="Luật Chuẩn Giải Đấu (3 Ban · 8 Pick)",
                    description=(
                        "Bộ luật mặc định: mỗi bên 3 lượt Ban và 8 lượt Pick (đội Xanh Dương bên trái Ban trước & Pick trước). "
                        "Nhân vật 5★ C0 = 1 cost (+1 mỗi cung mệnh), vũ khí 5★ = 1 cost (tinh luyện R2–R5 cộng thẳng +5s/bậc vào tổng điểm). "
                        "Điểm cuối trận = Điểm cộng từ Cost + thời gian tinh luyện vũ khí + tổng (09:00 - thời gian hoàn thành) của 3 ải; ít điểm hơn thắng."
                    ),
                    is_active=True,
                    is_default=True,
                    config_json=default_cfg.model_dump(by_alias=True),
                    updated_by=admin.id,
                )
            )
        await db.commit()


def create_app(
    *,
    db_engine=engine,
    session_factory: async_sessionmaker[AsyncSession] = async_session_maker,
) -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        room_manager.bind_session_factory(session_factory)
        async with db_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await seed_initial_data(session_factory)
        try:
            yield
        finally:
            room_manager.cancel_all_timers()

    application = FastAPI(
        title="Genshin Ban/Pick VN API",
        version="1.0.0",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.exception_handler(AppError)
    async def app_error_handler(_req: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _req: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = exc.errors()
        first_msg = "Dữ liệu không hợp lệ."
        if errors:
            raw_msg = str(errors[0].get("msg", first_msg))
            first_msg = raw_msg.removeprefix("Value error, ")
        return JSONResponse(
            status_code=422,
            content={"code": "VALIDATION_ERROR", "message": first_msg},
        )

    @application.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    application.include_router(auth.router)
    application.include_router(catalog.router)
    application.include_router(inventory.router)
    application.include_router(rulesets.router)
    application.include_router(admin_users.router)
    application.include_router(matches.router)
    application.include_router(ws_match.router)

    return application


app = create_app()
