"""用户、登录验证码、学习进度。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import BigIntPK, JSONType


class AppUser(Base):
    """登录用户。

    email 与 wecom_userid 都可为空，但至少要有一个——这个约束由服务层保证，
    因为 SQLite 与 PG 对「两列不能同时为空」的写法不同，放进 CHECK 反而
    增加迁移成本。
    """

    __tablename__ = "app_user"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    # 统一存小写，避免 A@x.com 与 a@x.com 变成两个账号
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    wecom_userid: Mapped[str | None] = mapped_column(String(128), unique=True)
    nickname: Mapped[str | None] = mapped_column(String(64))
    avatar: Mapped[str | None] = mapped_column(Text)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LoginCode(Base):
    """邮箱验证码。

    只存哈希不存明文：日志、数据库备份、误发的截图都不该泄露可登录的凭据。
    """

    __tablename__ = "login_code"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_login_code_email_time", "email", "created_at"),)


class LessonProgress(Base):
    """关卡进度。

    一个用户一关只有一行，重复上报视为覆盖——因为「这一关的输出物」
    本身是可改的，保留多份历史对用户没有意义。
    """

    __tablename__ = "lesson_progress"

    user_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("app_user.id", ondelete="CASCADE"), primary_key=True
    )
    lesson_id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="done")
    output: Mapped[dict | None] = mapped_column(JSONType)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
