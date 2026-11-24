from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from .config import get_settings

PBKDF2_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return (
        f"pbkdf2_sha256${PBKDF2_ITERATIONS}$"
        f"{base64.b64encode(salt).decode('ascii')}$"
        f"{base64.b64encode(dk).decode('ascii')}"
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algo, iters_str, salt_b64, dk_b64 = stored_hash.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iters_str)
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(dk_b64.encode("ascii"))
    except Exception:
        return False

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def create_access_token(user_id: str, role: str, remember: bool = True) -> str:
    settings = get_settings()
    hours = settings.JWT_EXPIRE_HOURS_REMEMBER if remember else settings.JWT_EXPIRE_HOURS_SHORT
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=hours)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        data = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if not isinstance(data, dict) or not data.get("sub"):
            return None
        return data
    except jwt.PyJWTError:
        return None
