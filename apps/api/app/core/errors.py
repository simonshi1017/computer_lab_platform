"""统一错误结构。

前端要能区分「需要重新登录」和「这个配置不存在」，所以错误体里必须有
机器可读的 code，而不是只有一句中文。detail 保持 {"code","message"}，
HTTP 状态码仍然是主判据。
"""

from __future__ import annotations

from fastapi import HTTPException, status

ErrorCode = str


def api_error(
    status_code: int,
    code: ErrorCode,
    message: str,
    headers: dict[str, str] | None = None,
) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message}, headers=headers)


def unauthorized(message: str = "请先登录", code: str = "unauthenticated") -> HTTPException:
    return api_error(status.HTTP_401_UNAUTHORIZED, code, message, {"WWW-Authenticate": "Bearer"})


def forbidden(message: str = "无权访问") -> HTTPException:
    return api_error(status.HTTP_403_FORBIDDEN, "forbidden", message)


def not_found(message: str = "资源不存在", code: str = "not_found") -> HTTPException:
    return api_error(status.HTTP_404_NOT_FOUND, code, message)


def bad_request(message: str, code: str = "bad_request") -> HTTPException:
    return api_error(status.HTTP_400_BAD_REQUEST, code, message)


def conflict(message: str, code: str = "conflict") -> HTTPException:
    return api_error(status.HTTP_409_CONFLICT, code, message)


def not_configured(feature: str, hint: str) -> HTTPException:
    """功能未配置。

    用 501 而不是 500：这不是 bug，是「运维还没填凭据」，
    前端据此隐藏入口而不是弹「服务器错误」。
    """
    return api_error(
        status.HTTP_501_NOT_IMPLEMENTED,
        "not_configured",
        f"{feature}未配置：{hint}",
    )
