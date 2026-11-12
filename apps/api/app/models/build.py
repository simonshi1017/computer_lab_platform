"""用户配置与分享链接。

build 的 payload 是**快照**：保存时把整份配置连同评分一起冻住。
半年后用户回看，看到的应该是当时算出来的结果，而不是被新显卡规格
改写过的结论。这也是这套表不用「外键指向规格表」的原因。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import BigIntPK, JSONType


class Build(Base):
    __tablename__ = "build"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # 冗余一份模型名：列表页不该为了显示一行字去 join 规格表
    model_id: Mapped[str] = mapped_column(String(64), nullable=False)
    model_name: Mapped[str] = mapped_column(String(160), nullable=False)
    # {build: Build, quant, ctx, budget, customSpec?}
    payload: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)
    # 保存时刻的评估结果（六维、风险、建议、统计）
    evaluation: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    score: Mapped[int] = mapped_column(nullable=False, default=0)
    grade: Mapped[str] = mapped_column(String(2), nullable=False, default="—")
    price_cny: Mapped[int] = mapped_column(nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_build_user_time", "user_id", "updated_at"),)


class ShareLink(Base):
    """分享链接。

    token 是随机串而不是自增 id：可猜的链接等于把别人的配置暴露出去。
    build 删除时级联删除，避免落地页 404 之外还留一堆孤儿 token。
    """

    __tablename__ = "share_link"

    token: Mapped[str] = mapped_column(String(32), primary_key=True)
    build_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("build.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    views: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
