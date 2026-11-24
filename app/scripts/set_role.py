from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Literal

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


def _format_users_table(users: Sequence[User]) -> str:
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


def main(argv: Sequence[str] | None = None) -> int:
    _configure_stdio_utf8()
    args = build_parser().parse_args(argv)

    uid = args.uid.strip() if args.uid is not None else None
    email = args.email.strip() if args.email is not None else None
    uid = uid or None
    email = email or None

    if args.list:
        if uid or email:
            print("Lỗi: Không thể truyền UID hoặc --email cùng với --list.", file=sys.stderr)
            return 2
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

    if bool(uid) == bool(email):
        print("Lỗi: Vui lòng cung cấp đúng 1 trong 2 tham số: <uid> hoặc --email.", file=sys.stderr)
        return 2

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
