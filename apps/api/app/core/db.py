"""数据库会话与引擎。

一个刻意的取舍：**测试跑 SQLite，生产跑 PostgreSQL**。
所以所有「只有 PG 才有」的类型都通过 with_variant 降级，
而不是在测试里 mock 掉整个仓储层——那样测出来的东西等于没测。
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# PG 上用 JSONB（可索引、可查询），SQLite 上退化为 TEXT 存 JSON
JSONType = JSON().with_variant(JSONB, "postgresql")


class Base(DeclarativeBase):
    """所有模型的基类。类型标注统一在子类里做，不在基类里做。"""


def _engine_kwargs() -> dict[str, Any]:
    url = settings.database_url_normalized
    kwargs: dict[str, Any] = {"echo": settings.db_echo, "future": True}
    if url.startswith("sqlite"):
        # SQLite 不需要连接池参数；内存库还必须关掉 pool 才能共享同一份数据
        kwargs.pop("pool_size", None)
    else:
        kwargs.update({"pool_pre_ping": True, "pool_size": 10, "max_overflow": 10})
    return kwargs


engine = create_async_engine(settings.database_url_normalized, **_engine_kwargs())

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI 依赖：一个请求一个会话，出错自动回滚。"""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_models() -> None:
    """建表。

    只给「没有迁移工具的小规模场景」用：本地起服务、容器首次启动。
    生产应执行 `alembic upgrade head`，这里同时兼容两种路径——
    容器里如果忘了跑迁移，服务仍然可用，只是表结构停在 create_all 的结果。
    """
    from app import models  # noqa: F401  确保所有模型都已注册到 Base.metadata

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
