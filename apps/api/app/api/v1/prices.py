"""价格接口。

全部只读、全部可缓存：价格表的读放大远高于写（一次导入，天天被读）。
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse

from app.api.v1.catalog import cached
from app.core.deps import SessionDep
from app.services import pricing
from app.core.config import settings

router = APIRouter(prefix="/prices", tags=["prices"])


@router.get("/latest", summary="当前价格（含来源与采集时间）")
async def get_latest(request: Request, session: SessionDep) -> Response:
    """前端启动时拉一次，用来覆盖内置目录里的价格。

    payload 很小（16 张卡），所以直接整体返回、整体缓存，
    不做增量——增量协议的复杂度换不来什么。
    """
    return cached(request, await pricing.latest_prices(session))


@router.get("/status", summary="价格新鲜度汇总")
async def get_status(request: Request, session: SessionDep) -> Response:
    return cached(request, await pricing.stale_summary(session))


@router.get("/template", response_class=PlainTextResponse, summary="CSV 导入模板")
async def get_template() -> PlainTextResponse:
    # 直接给一份带示例的 CSV，比贴在文档里的代码块更容易被真正用起来
    return PlainTextResponse(
        pricing.csv_template(),
        headers={"Content-Disposition": 'attachment; filename="clab-prices-template.csv"'},
    )


@router.get("/{gpu_id}/history", summary="单卡价格历史")
async def get_history(
    gpu_id: str,
    session: SessionDep,
    days: int = Query(default=180, ge=1, le=3650),
) -> JSONResponse:
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from app.models import PriceSnapshot

    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        await session.scalars(
            select(PriceSnapshot)
            .where(PriceSnapshot.gpu_id == gpu_id, PriceSnapshot.captured_at >= since)
            .order_by(PriceSnapshot.captured_at)
        )
    ).all()
    return JSONResponse(
        {
            "gpuId": gpu_id,
            "thresholdDays": settings.price_stale_days,
            "points": [
                {
                    "priceCny": row.price_cny,
                    "channel": row.channel,
                    "source": row.source,
                    "capturedAt": row.captured_at.isoformat(),
                }
                for row in rows
            ],
        },
        headers={"Cache-Control": "public, max-age=60"},
    )
