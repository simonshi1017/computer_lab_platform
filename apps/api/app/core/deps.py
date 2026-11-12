"""FastAPI 依赖：取当前用户、取可选用户。"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import unauthorized
from app.core.security import TokenError, decode_token
from app.models import AppUser

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(maxsplit=1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def get_optional_user(
    session: SessionDep,
    authorization: Annotated[str | None, Header()] = None,
) -> AppUser | None:
    """有 token 就解析，没有就返回 None。

    公开接口（catalog、分享落地页）用它，好处是同一套依赖能顺便实现
    「作者本人看自己的私密配置」。
    """
    token = _extract_bearer(authorization)
    if not token:
        return None
    try:
        user_id = decode_token(token, "access")
    except TokenError:
        return None
    return await session.get(AppUser, user_id)


async def get_current_user(
    user: Annotated[AppUser | None, Depends(get_optional_user)],
) -> AppUser:
    if user is None:
        raise unauthorized()
    return user


async def get_admin_user(
    user: Annotated[AppUser, Depends(get_current_user)],
) -> AppUser:
    from app.core.errors import forbidden

    if not user.is_admin:
        raise forbidden("需要管理员权限")
    return user


CurrentUser = Annotated[AppUser, Depends(get_current_user)]
OptionalUser = Annotated[AppUser | None, Depends(get_optional_user)]
AdminUser = Annotated[AppUser, Depends(get_admin_user)]

__all__ = [
    "AdminUser",
    "CurrentUser",
    "OptionalUser",
    "SessionDep",
    "get_admin_user",
    "get_current_user",
    "get_optional_user",
]
