"""分享链接。

两个端点，权限完全不同：
- POST /share 需要登录，且只能分享自己的配置；
- GET /share/{token} 完全匿名，因为它的用途就是「把链接发给没账号的人看」。
"""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.v1.builds import build_out
from app.core.config import settings
from app.core.deps import CurrentUser, SessionDep
from app.schemas import ShareCreate, ShareOut, SharePayloadOut
from app.services import builds as build_service

router = APIRouter(prefix="/share", tags=["share"])


def share_url(token: str) -> str:
    """分享链接指向前端落地页，不是 API。

    /s/:token 是前端路由，nginx 的 SPA 回退会把它交给 index.html。
    """
    return f"{settings.frontend_url.rstrip('/')}/s/{token}"


@router.post("", response_model=ShareOut, status_code=status.HTTP_201_CREATED, summary="生成分享链接")
async def create(payload: ShareCreate, session: SessionDep, user: CurrentUser) -> ShareOut:
    link = await build_service.create_share(
        session, user, payload.build_id, expires_in_days=payload.expires_in_days
    )
    return ShareOut(
        token=link.token,
        url=share_url(link.token),
        expires_at=link.expires_at,
        views=link.views or 0,
    )


@router.get("/{token}", response_model=SharePayloadOut, summary="落地页数据（免登录）")
async def resolve(token: str, session: SessionDep) -> SharePayloadOut:
    link, build, author = await build_service.resolve_share(session, token)
    return SharePayloadOut(
        token=link.token,
        build=build_out(build),
        # 只给昵称：分享出去的东西不该顺带泄露作者账号
        author=author.nickname if author else None,
        views=link.views or 0,
        created_at=link.created_at,
        expires_at=link.expires_at,
    )
