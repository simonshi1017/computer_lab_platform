"""模型基类与跨库类型别名。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import JSONType

# SQLite 只有 INTEGER PRIMARY KEY 才自增，BIGINT 不行；测试跑 SQLite，
# 生产跑 PG，用 variant 让两边都拿到自增主键。
BigIntPK = BigInteger().with_variant(Integer, "sqlite")

__all__ = ["BigIntPK", "JSONType", "created_at_col", "updated_at_col", "utcnow"]


def utcnow() -> datetime:
    return datetime.now().astimezone()


def created_at_col() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def updated_at_col() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
