from __future__ import annotations

from fastapi import HTTPException, status


class AppError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(status_code=status_code, detail={"code": code, "message": message})
        self.code = code
        self.message = message


def unauthorized(message: str = "Vui lòng đăng nhập để tiếp tục.") -> AppError:
    return AppError(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", message)


def forbidden(message: str = "Chỉ Admin mới có quyền thực hiện thao tác này.") -> AppError:
    return AppError(status.HTTP_403_FORBIDDEN, "FORBIDDEN", message)


def bad_request(code: str, message: str) -> AppError:
    return AppError(status.HTTP_400_BAD_REQUEST, code, message)


def not_found(code: str, message: str) -> AppError:
    return AppError(status.HTTP_404_NOT_FOUND, code, message)


def conflict(code: str, message: str) -> AppError:
    return AppError(status.HTTP_409_CONFLICT, code, message)
