"""健康检查。

两个粒度：
- `/healthz`：容器健康检查用，**只证明进程活着**，不查数据库。
  查库会让「数据库重启 5 秒」变成「容器被判定不健康并重启」，雪崩式恶化。
- `/api/v1/health`：给人和监控看，带依赖探测与版本信息。
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.core.db import SessionLocal
from app.services.catalog import catalog_version

log = logging.getLogger("clab.health")

router = APIRouter(tags=["health"])


@router.get("/health", summary="健康检查（含依赖探测）")
async def health() -> dict[str, Any]:
    db_ok = False
    version: dict[str, Any] | None = None
    try:
        async with SessionLocal() as session:
            await session.execute(text("select 1"))
            db_ok = True
            version = await catalog_version(session)
    except Exception as exc:  # noqa: BLE001  健康检查不能因为数据库挂了就自己抛 500
        log.warning("健康检查：数据库不可用 %s", exc)

    return {
        "status": "ok" if db_ok else "degraded",
        "env": settings.env,
        "database": "up" if db_ok else "down",
        "catalog": version,
        "features": {
            "wecomLogin": settings.wecom_enabled,
            "emailCode": settings.smtp_enabled,
            "devLogin": settings.dev_login_enabled,
        },
    }
