"""埋点事件。

设计取向：**能回答产品问题的最小结构**，不是通用分析平台。
所以只有一张表、一个 JSONB props、一个事件名，不为每种事件建表。

「关卡完成率」「推荐采纳率」这类指标不需要宽表：
- 关卡完成率 = lesson_progress 里 status='done' 的人数 / 有进度的人数
- 推荐采纳率 = recommend_apply 事件数 / recommend_view 事件数

刻意不做的事：
- 不存 IP、不存 UA 原文（只存一个截断的 ua 摘要）；
- 不建用户画像字段（内网工具，越少个人信息越好）。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import BigIntPK, JSONType


class AnalyticsEvent(Base):
    __tablename__ = "analytics_event"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    # 匿名会话 id：localStorage 里的随机串。用来算 UV，不关联任何身份
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # 已登录时补上用户 id，未登录为 NULL。不强制登录才上报
    user_id: Mapped[int | None] = mapped_column(
        BigIntPK, ForeignKey("app_user.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    path: Mapped[str | None] = mapped_column(String(255))
    props: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    # 只留 80 字符，够区分「移动端/桌面端」，不够做指纹
    ua: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_analytics_event_name_time", "name", "created_at"),
        Index("ix_analytics_event_time", "created_at"),
        Index("ix_analytics_event_session", "session_id"),
    )
