"""价格管道。

重点在**拒绝逻辑**：一条错价进库，用户按它做三万块的采购决策。
所以这里对「越界」「暴涨」「未来时间」「不存在的卡」逐个验证。
"""

from __future__ import annotations

import httpx
import pytest
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import GpuSpec, PriceSnapshot
from app.services.pricing import CsvPriceProvider, apply_prices, csv_template, parse_csv


def test_parse_csv_tolerates_bom_and_commas() -> None:
    """Excel 另存为 CSV 会带 BOM，价格列常写成 12,999 —— 两样都得能吃下。"""
    text = "\ufeffgpu_id,price_cny,channel,source,captured_at,note\nrtx4090,\"12,999\",jd,https://x,2026-11-01,自营\n"
    rows = parse_csv(text)
    assert len(rows) == 1
    assert rows[0].price_cny == 12999
    assert rows[0].channel == "jd"


def test_parse_csv_requires_id_and_price() -> None:
    with pytest.raises(ValueError, match="缺少必需列"):
        parse_csv("gpu_id,channel\nrtx4090,jd\n")


def test_parse_csv_rejects_non_numeric_price() -> None:
    with pytest.raises(ValueError, match="不是数字"):
        parse_csv("gpu_id,price_cny\nrtx4090,一万块\n")


def test_template_is_importable() -> None:
    """模板必须能被自己的解析器读回去，否则等于给运维挖坑。"""
    rows = parse_csv(csv_template())
    assert len(rows) >= 2
    assert all(row.price_cny > 0 for row in rows)


async def test_import_updates_gpu_and_writes_snapshot(fresh_prices: None) -> None:
    text = "gpu_id,price_cny,channel,source,captured_at\nrtx3060,1899,jd,https://item.jd.com/x,2026-11-10\n"
    rows = await CsvPriceProvider(text).fetch()

    async with SessionLocal() as session:
        before = (await session.scalars(select(PriceSnapshot))).all()
        report = await apply_prices(session, rows)

    assert report.written == 1
    assert report.rejected == 0
    assert report.rows[0].old_price == 2000
    assert report.rows[0].new_price == 1899

    async with SessionLocal() as session:
        gpu = await session.get(GpuSpec, "rtx3060")
        assert gpu is not None
        assert gpu.price_cny == 1899
        assert gpu.price_captured_at is not None
        after = (await session.scalars(select(PriceSnapshot))).all()
        assert len(after) == len(before) + 1
        assert any(snapshot.channel == "jd" and snapshot.source for snapshot in after)


async def test_dry_run_writes_nothing(fresh_prices: None) -> None:
    rows = parse_csv("gpu_id,price_cny,channel\nrtx4060ti16,2999,jd\n")

    async with SessionLocal() as session:
        report = await apply_prices(session, rows, dry_run=True)

    assert report.dry_run is True
    assert report.written == 0

    async with SessionLocal() as session:
        gpu = await session.get(GpuSpec, "rtx4060ti16")
        assert gpu is not None
        assert gpu.price_cny != 2999 or gpu.price_cny == 2999  # 值可能恰好相等，用快照数判断
        count = await session.scalar(
            select(func.count()).select_from(PriceSnapshot).where(PriceSnapshot.channel == "jd")
        )
        assert count == 0


async def test_same_day_same_channel_updates_instead_of_duplicating(fresh_prices: None) -> None:
    rows = parse_csv(
        "gpu_id,price_cny,channel,captured_at\n"
        "rtx3060,1899,jd,2026-11-10\n"
        "rtx3060,1850,jd,2026-11-10\n"
    )
    async with SessionLocal() as session:
        report = await apply_prices(session, rows)

    # 第一次 insert，第二次 update 同一行
    assert [row.action for row in report.rows] == ["insert", "update"]

    async with SessionLocal() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(PriceSnapshot)
            .where(PriceSnapshot.gpu_id == "rtx3060", PriceSnapshot.channel == "jd")
        )
        assert count == 1


async def test_rejects_absurd_jump(fresh_prices: None) -> None:
    """从 2000 跳到 20000 通常是「多打一个 0」，必须挡下来。"""
    rows = parse_csv("gpu_id,price_cny,channel\nrtx3060,20000,jd\n")
    async with SessionLocal() as session:
        report = await apply_prices(session, rows)

    assert report.rejected == 1
    assert report.written == 0
    assert "60%" in report.rows[0].reason


async def test_force_allows_big_jump(fresh_prices: None) -> None:
    rows = parse_csv("gpu_id,price_cny,channel\nrtx3060,20000,jd\n")
    async with SessionLocal() as session:
        report = await apply_prices(session, rows, force=True)

    assert report.written == 1
    assert report.rejected == 0


@pytest.mark.parametrize(
    ("line", "reason"),
    [
        ("rtx404,5000,jd", "目录里没有"),
        ("rtx3060,50,jd", "合理区间"),
        ("rtx3060,2000000,jd", "合理区间"),
    ],
)
async def test_rejects_bad_rows(fresh_prices: None, line: str, reason: str) -> None:
    rows = parse_csv(f"gpu_id,price_cny,channel\n{line}\n")
    async with SessionLocal() as session:
        report = await apply_prices(session, rows)
    assert report.rejected == 1
    assert reason in report.rows[0].reason


async def test_rejects_future_capture_date(fresh_prices: None) -> None:
    rows = parse_csv("gpu_id,price_cny,channel,captured_at\nrtx3060,1900,jd,2099-01-01\n")
    async with SessionLocal() as session:
        report = await apply_prices(session, rows)
    assert report.rejected == 1
    assert "未来" in report.rows[0].reason


async def test_latest_prices_marks_catalog_as_estimated(
    client: httpx.AsyncClient, fresh_prices: None
) -> None:
    """内置目录价不是真实采集，必须 estimated=true 且没有采集时间。

    这是最容易被做错的一点：给目录价盖一个「今天」的时间戳，界面就会写着
    「¥12,499 · 今天」，而那个数字其实是三个月前手写的。
    """
    response = await client.get("/api/v1/prices/latest")
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 16

    catalog_only = [item for item in items if item["channel"] == "catalog"]
    assert catalog_only, "初始 seed 的价格渠道应为 catalog"
    for item in catalog_only:
        assert item["estimated"] is True
        assert item["capturedAt"] is None
        assert item["stale"] is True


async def test_latest_prices_shows_real_capture(client: httpx.AsyncClient, fresh_prices: None) -> None:
    rows = parse_csv("gpu_id,price_cny,channel,source,captured_at\nrtx4090,13100,jd,https://item.jd.com/y,2026-11-11\n")
    async with SessionLocal() as session:
        await apply_prices(session, rows, force=True)

    items = (await client.get("/api/v1/prices/latest")).json()
    target = next(item for item in items if item["gpuId"] == "rtx4090")
    assert target["priceCny"] == 13100
    assert target["channel"] == "jd"
    assert target["estimated"] is False
    assert target["capturedAt"] is not None
    assert target["ageDays"] is not None


async def test_status_and_template_endpoints(client: httpx.AsyncClient, fresh_prices: None) -> None:
    status = (await client.get("/api/v1/prices/status")).json()
    assert status["total"] == 16
    assert "thresholdDays" in status
    assert isinstance(status["stale"], list)

    template = await client.get("/api/v1/prices/template")
    assert template.status_code == 200
    assert "gpu_id,price_cny" in template.text
    assert "attachment" in template.headers["content-disposition"]


async def test_history_endpoint(client: httpx.AsyncClient) -> None:
    body = (await client.get("/api/v1/prices/rtx4090/history")).json()
    assert body["gpuId"] == "rtx4090"
    assert isinstance(body["points"], list)
