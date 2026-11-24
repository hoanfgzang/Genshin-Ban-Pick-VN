from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# D:\project\Genshin-Ban-Pick-VN
ROOT_DIR = Path(__file__).resolve().parents[2]
APP_DIR = ROOT_DIR / "app"
DATA_DIR = APP_DIR / "data"
WEB_DATA_DIR = ROOT_DIR / "web" / "src" / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(APP_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = f"sqlite+aiosqlite:///{(DATA_DIR / 'gbp.db').as_posix()}"
    JWT_SECRET: str = "dev-secret-change-in-production-genshin-ban-pick-vn-2026"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS_SHORT: int = 12
    JWT_EXPIRE_HOURS_REMEMBER: int = 24 * 14

    REQUIRE_EMAIL: bool = False
    COOKIE_NAME: str = "gbp_token"
    COOKIE_SECURE: bool = False

    SEED_ADMIN_UID: str = "100000000"
    SEED_ADMIN_PASSWORD: str = "admin12345"
    SEED_ADMIN_NAME: str = "Admin"

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def resolved_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("sqlite+aiosqlite:///./"):
            rel = url.removeprefix("sqlite+aiosqlite:///./")
            abs_path = (ROOT_DIR / rel).resolve()
            abs_path.parent.mkdir(parents=True, exist_ok=True)
            return f"sqlite+aiosqlite:///{abs_path.as_posix()}"
        if url.startswith("sqlite+aiosqlite:///"):
            raw_path = url.removeprefix("sqlite+aiosqlite:///")
            if raw_path != ":memory:":
                Path(raw_path).parent.mkdir(parents=True, exist_ok=True)
        return url


@lru_cache
def get_settings() -> Settings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return Settings()
