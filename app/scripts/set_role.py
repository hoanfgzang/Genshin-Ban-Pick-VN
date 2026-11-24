from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
import os
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Literal

import httpx
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.database import create_engine_and_session  # noqa: E402
from app.models.user import User  # noqa: E402

Role = Literal["admin", "player"]


def _configure_stdio_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        if stream.isatty() and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.scripts.set_role",
        description="Phân quyền admin / player hoặc liệt kê tài khoản trong cơ sở dữ liệu.",
    )
    parser.add_argument(
        "uid",
        nargs="?",
        help="UID Genshin của tài khoản cần phân quyền.",
    )
    parser.add_argument(
        "--email",
        help="Tìm tài khoản theo email thay cho UID.",
    )
    parser.add_argument(
        "--role",
        choices=("admin", "player"),
        default=None,
        help="Quyền muốn gán (mặc định: admin) hoặc bộ lọc quyền khi dùng --list.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="Liệt kê các tài khoản hiện có trong hệ thống.",
    )
    parser.add_argument(
        "--db",
        default=None,
        help="Chuỗi kết nối DATABASE_URL tùy chọn (mặc định lấy từ cấu hình app).",
    )
    parser.add_argument(
        "--api-url",
        default=None,
        help="URL máy chủ Backend để phân quyền từ xa qua API (vd: https://your-domain.com).",
    )
    parser.add_argument(
        "--secret",
        default=None,
        help="Mã khóa ADMIN_SECRET_KEY khi gọi --api-url (mặc định đọc biến môi trường ADMIN_SECRET_KEY).",
    )
    return parser


async def list_users(
    database_url: str | None = None,
    role_filter: Role | None = None,
) -> list[User]:
    """Truy vấn danh sách tài khoản, có thể lọc theo quyền."""
    db_engine, session_factory = create_engine_and_session(database_url)
    try:
        async with session_factory() as session:
            stmt = select(User).order_by(User.created_at.asc())
            if role_filter is not None:
                stmt = stmt.where(User.role == role_filter)
            res = await session.execute(stmt)
            return list(res.scalars().all())
    finally:
        await db_engine.dispose()


async def update_user_role(
    *,
    uid: str | None = None,
    email: str | None = None,
    role: Role = "admin",
    database_url: str | None = None,
) -> tuple[User, str] | None:
    """Cập nhật quyền của tài khoản theo UID hoặc email; trả về (user, old_role) hoặc None."""
    db_engine, session_factory = create_engine_and_session(database_url)
    try:
        async with session_factory() as session:
            if uid is not None:
                stmt = select(User).where(User.uid == uid.strip())
            elif email is not None:
                stmt = select(User).where(User.email == email.strip().lower())
            else:
                raise ValueError("Cần cung cấp uid hoặc email.")

            res = await session.execute(stmt)
            user = res.scalar_one_or_none()
            if not user:
                return None

            old_role = user.role
            if old_role != role:
                user.role = role
                await session.commit()
            return user, old_role
    finally:
        await db_engine.dispose()


@dataclass
class _RemoteUserRow:
    id: str
    uid: str
    role: str
    display_name: str
    email: str | None


def _build_http_client(base_url: str) -> httpx.Client:
    return httpx.Client(base_url=base_url.rstrip("/"), timeout=15.0)


def _extract_api_error(resp: httpx.Response) -> str:
    try:
        data = resp.json()
        if isinstance(data, dict):
            if isinstance(data.get("message"), str) and data["message"]:
                return data["message"]
            detail = data.get("detail")
            if isinstance(detail, str) and detail:
                return detail
    except Exception:
        pass
    return f"HTTP {resp.status_code}"


def _format_users_table(users: Sequence[User | _RemoteUserRow]) -> str:
    rows = [
        (u.uid, u.role, u.display_name, u.email or "-")
        for u in users
    ]
    headers = ("UID", "Role", "Tên hiển thị", "Email")
    widths = [
        max(len(headers[i]), *(len(row[i]) for row in rows))
        for i in range(4)
    ]

    def fmt_row(cols: tuple[str, str, str, str]) -> str:
        return "  ".join(cols[i].ljust(widths[i]) for i in range(4)).rstrip()

    lines = [
        fmt_row(headers),
        "  ".join("-" * widths[i] for i in range(4)),
        *(fmt_row(row) for row in rows),
    ]
    return "\n".join(lines)


def _run_remote_api(
    *,
    api_url: str,
    secret: str,
    is_list: bool,
    uid: str | None,
    email: str | None,
    role_arg: Role | None,
    http_client: httpx.Client | None = None,
) -> int:
    headers = {"X-Admin-Secret": secret}
    client = http_client or _build_http_client(api_url)
    should_close = http_client is None
    try:
        if is_list:
            params: dict[str, str] = {}
            if role_arg is not None:
                params["role"] = role_arg
            resp = client.get("/api/admin/users", params=params, headers=headers)
            if resp.status_code >= 400:
                print(f"Lỗi API: {_extract_api_error(resp)}", file=sys.stderr)
                return 1
            items = resp.json()
            if not items:
                print("Không có tài khoản nào.")
                return 0
            rows = [
                _RemoteUserRow(
                    id=str(item["id"]),
                    uid=str(item["uid"]),
                    role=str(item["role"]),
                    display_name=str(item["displayName"]),
                    email=item.get("email"),
                )
                for item in items
            ]
            print(_format_users_table(rows))
            return 0

        target_role: Role = role_arg or "admin"
        if uid is not None:
            resp = client.post(
                "/api/admin/users/by-uid",
                json={"uid": uid, "role": target_role},
                headers=headers,
            )
            if resp.status_code >= 400:
                print(f"Lỗi API: {_extract_api_error(resp)}", file=sys.stderr)
                return 1
            item = resp.json()
        else:
            assert email is not None
            norm_email = email.strip().lower()
            list_resp = client.get(
                "/api/admin/users",
                params={"q": norm_email},
                headers=headers,
            )
            if list_resp.status_code >= 400:
                print(f"Lỗi API: {_extract_api_error(list_resp)}", file=sys.stderr)
                return 1
            matched = next(
                (
                    u
                    for u in list_resp.json()
                    if (u.get("email") or "").strip().lower() == norm_email
                ),
                None,
            )
            if not matched:
                print(f"Không tìm thấy tài khoản có email '{email}'.", file=sys.stderr)
                return 1
            resp = client.patch(
                f"/api/admin/users/{matched['id']}/role",
                json={"role": target_role},
                headers=headers,
            )
            if resp.status_code >= 400:
                print(f"Lỗi API: {_extract_api_error(resp)}", file=sys.stderr)
                return 1
            item = resp.json()

        print(
            f"Đã cập nhật quyền cho '{item['displayName']}' (UID: {item['uid']}): "
            f"-> {item['role']}."
        )
        print("Người dùng chỉ cần tải lại trang (F5) để áp dụng quyền mới.")
        return 0
    except httpx.HTTPError as exc:
        print(f"Không thể kết nối tới máy chủ {api_url}: {exc}", file=sys.stderr)
        return 1
    finally:
        if should_close:
            client.close()


def main(
    argv: Sequence[str] | None = None,
    *,
    http_client: httpx.Client | None = None,
) -> int:
    _configure_stdio_utf8()
    args = build_parser().parse_args(argv)

    uid = args.uid.strip() if args.uid is not None else None
    email = args.email.strip() if args.email is not None else None
    uid = uid or None
    email = email or None
    api_url = args.api_url.strip() if args.api_url is not None else None
    api_url = api_url or None

    if args.list and (uid or email):
        print("Lỗi: Không thể truyền UID hoặc --email cùng với --list.", file=sys.stderr)
        return 2

    if not args.list and bool(uid) == bool(email):
        print("Lỗi: Vui lòng cung cấp đúng 1 trong 2 tham số: <uid> hoặc --email.", file=sys.stderr)
        return 2

    if api_url:
        raw_secret = args.secret if args.secret is not None else os.environ.get("ADMIN_SECRET_KEY", "")
        secret = raw_secret.strip()
        if not secret:
            print(
                "Lỗi: Khi dùng --api-url cần truyền --secret hoặc đặt biến môi trường ADMIN_SECRET_KEY.",
                file=sys.stderr,
            )
            return 2
        return _run_remote_api(
            api_url=api_url,
            secret=secret,
            is_list=args.list,
            uid=uid,
            email=email,
            role_arg=args.role,
            http_client=http_client,
        )

    if args.list:
        try:
            users = asyncio.run(list_users(args.db, args.role))
        except OperationalError as exc:
            print(
                f"Lỗi cơ sở dữ liệu (hãy chắc chắn backend đã khởi tạo bảng users): {exc}",
                file=sys.stderr,
            )
            return 1
        if not users:
            print("Không có tài khoản nào.")
            return 0
        print(_format_users_table(users))
        return 0

    target_role: Role = args.role or "admin"
    try:
        result = asyncio.run(
            update_user_role(uid=uid, email=email, role=target_role, database_url=args.db)
        )
    except OperationalError as exc:
        print(
            f"Lỗi cơ sở dữ liệu (hãy chắc chắn backend đã khởi tạo bảng users): {exc}",
            file=sys.stderr,
        )
        return 1

    if result is None:
        target_desc = f"UID '{uid}'" if uid else f"email '{email}'"
        print(f"Không tìm thấy tài khoản có {target_desc}.", file=sys.stderr)
        return 1

    user, old_role = result
    if old_role == target_role:
        print(f"Tài khoản '{user.display_name}' (UID: {user.uid}) đã có quyền '{target_role}'.")
        return 0

    print(
        f"Đã cập nhật quyền cho '{user.display_name}' (UID: {user.uid}): "
        f"{old_role} -> {target_role}."
    )
    print("Người dùng chỉ cần tải lại trang (F5) để áp dụng quyền mới.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
