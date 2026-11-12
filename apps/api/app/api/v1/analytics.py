"""埋点上报与看板数据。"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Header, Query
from pydantic import Field

from app.core.deps import AdminUser, OptionalUser, SessionDep
from app.schemas import CamelModel
from app.services import analytics as analytics_service

router = APIRouter(tags=["analytics"])


class EventIn(CamelModel):
    name: str = Field(max_length=64)
    path: str | None = Field(default=None, max_length=255)
    props: dict[str, Any] | None = None


class EventBatchIn(CamelModel):
    """批量上报。

    前端做批量而不是一条一发：离开页面时的 `sendBeacon` 只能发一次请求，
    而且 20 条一个包能把「一次连续操作」的上下文（打开 → 改了 3 次 → 保存）
    完整带上来。
    """

    session_id: str = Field(min_length=8, max_length=64)
    events: list[EventIn] = Field(default_factory=list, max_length=20)


@router.post("/events", summary="上报埋点事件")
async def post_events(
    payload: EventBatchIn,
    session: SessionDep,
    user: OptionalUser,
    user_agent: Annotated[str | None, Header()] = None,
) -> dict[str, int]:
    """公开接口：不登录也能上报（大部分流量是未登录用户）。

    永远返回 200：埋点失败不该影响任何用户操作，前端的调用点是
    `void track(...)`，不等待也不处理错误。
    """
    return await analytics_service.record_events(
        session,
        session_id=payload.session_id,
        events=[event.model_dump() for event in payload.events],
        user_id=user.id if user else None,
        ua=user_agent,
    )


@router.get("/stats/overview", summary="看板聚合（需管理员）")
async def stats_overview(
    session: SessionDep,
    _: AdminUser,
    days: int = Query(default=7, ge=1, le=90),
) -> dict[str, Any]:
    return await analytics_service.overview(session, days=days)
