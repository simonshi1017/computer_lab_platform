"""价格管道。

产品的核心承诺是「所有估算值可追溯」，价格尤其如此——它是用户唯一
会拿去和电商页面比对的数字。所以这里只做三件事，但每件都做死：

1. **每次写入都留快照**，不覆盖历史。没有历史就无法回答「是不是涨了」。
2. **每条价格必须带 channel + source + captured_at**。缺来源的价格等于拍脑袋。
3. **异常变动直接拒绝**。+300% 通常是「少写一个 0」或错行，放进去会毁掉整份推荐。

为什么没有「京东自动抓取」：商品页有反爬（滑块/风控），且批量抓取价格用于
商业展示涉及平台条款。这里留 `PriceProvider` 协议作为扩展点，接团购/供应商
报价单/自建爬虫都只需要实现一个 `fetch()`。默认走人工 CSV——数据量是
16 张显卡，一周一次，导入一次 30 秒，比维护爬虫便宜一个数量级。
"""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Iterable, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import GpuSpec, PriceSnapshot

log = logging.getLogger("clab.pricing")

# 合理区间：低于 100 元不可能是能跑模型的卡，高于 100 万不是单卡零售场景
MIN_PRICE_CNY = 100
MAX_PRICE_CNY = 1_000_000
# 单次导入允许的最大波动。超过就当成录入错误挡下来，--force 可强行写入
MAX_JUMP_RATIO = 0.6

CSV_COLUMNS = ("gpu_id", "price_cny", "channel", "source", "captured_at", "note")


@dataclass
class PriceRow:
    gpu_id: str
    price_cny: int
    channel: str = "manual"
    source: str | None = None
    captured_at: datetime | None = None
    note: str | None = None


@dataclass
class PriceChange:
    gpu_id: str
    name: str
    old_price: int | None
    new_price: int
    channel: str
    source: str | None
    captured_at: datetime
    action: str  # insert | update | reject
    level: str  # ok | warn
    reason: str = ""

    @property
    def delta_pct(self) -> float | None:
        if not self.old_price:
            return None
        return (self.new_price - self.old_price) / self.old_price


@dataclass
class ImportReport:
    rows: list[PriceChange] = field(default_factory=list)
    dry_run: bool = False
    written: int = 0
    rejected: int = 0

    @property
    def changed(self) -> int:
        return sum(1 for row in self.rows if row.old_price != row.new_price and row.action != "reject")

    def as_dict(self) -> dict:
        return {
            "dryRun": self.dry_run,
            "total": len(self.rows),
            "written": self.written,
            "rejected": self.rejected,
            "changed": self.changed,
            "rows": [
                {
                    "gpuId": row.gpu_id,
                    "name": row.name,
                    "oldPrice": row.old_price,
                    "newPrice": row.new_price,
                    "deltaPct": None if row.delta_pct is None else round(row.delta_pct, 4),
                    "channel": row.channel,
                    "source": row.source,
                    "action": row.action,
                    "level": row.level,
                    "reason": row.reason,
                }
                for row in self.rows
            ],
        }


class PriceProvider(Protocol):
    """价格来源扩展点。

    接新来源只需要实现这个方法：返回标准化的 PriceRow 列表，
    校验、去重、快照、异常拦截全部由 `apply_prices` 统一下沉。
    """

    name: str

    async def fetch(self) -> list[PriceRow]: ...


class CsvPriceProvider:
    """人工维护的 CSV。列见 CSV_COLUMNS，只有 gpu_id 与 price_cny 必填。"""

    name = "csv"

    def __init__(self, text: str) -> None:
        self._text = text

    async def fetch(self) -> list[PriceRow]:
        return parse_csv(self._text)


class CsvPriceSource:
    """兼容旧命名（provider 概念引入前写的调用点）。"""

    def __init__(self, text: str) -> None:
        self._text = text

    def rows(self) -> list[PriceRow]:
        return parse_csv(self._text)


def parse_csv(text: str) -> list[PriceRow]:
    """解析 CSV。**不做业务校验**——校验放在 apply_prices 里，
    这样以后接 JSON / Excel / 接口，规则不用抄第二遍。
    """
    # utf-8-sig：Excel 另存为 CSV 时默认带 BOM，不处理的话第一列表头会变成 "\ufeffgpu_id"
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    if reader.fieldnames is None:
        return []

    missing = {"gpu_id", "price_cny"} - {name.strip() for name in reader.fieldnames}
    if missing:
        raise ValueError(f"CSV 缺少必需列：{', '.join(sorted(missing))}（需要 gpu_id, price_cny）")

    rows: list[PriceRow] = []
    for raw in reader:
        gpu_id = (raw.get("gpu_id") or "").strip()
        if not gpu_id:
            continue
        price_raw = (raw.get("price_cny") or "").strip().replace(",", "").replace("¥", "")
        try:
            price = int(float(price_raw))
        except ValueError as exc:
            raise ValueError(f"{gpu_id} 的价格不是数字：{price_raw!r}") from exc

        rows.append(
            PriceRow(
                gpu_id=gpu_id,
                price_cny=price,
                channel=(raw.get("channel") or "manual").strip() or "manual",
                source=(raw.get("source") or None) and raw["source"].strip(),
                captured_at=parse_date(raw.get("captured_at")),
                note=(raw.get("note") or None) and raw["note"].strip(),
            )
        )
    return rows


def parse_date(value: str | None) -> datetime | None:
    if not value or not value.strip():
        return None
    text = value.strip()
    # 允许 "2026-11-12" 和 "2026-11-12 15:30" 两种写法
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S"):
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise ValueError(f"无法识别的时间格式：{value!r}（用 YYYY-MM-DD）")


def parse_captured_at(value) -> datetime:
    return value or datetime.now(timezone.utc)


def _same_day(left: datetime, right: datetime) -> bool:
    """跨库安全地比较「同一天」。

    不用 SQL 的 date()：SQLite 与 PG 的行为不同（PG 的 date() 对 timestamptz
    会按会话时区截断），在测试和生产之间制造差异。拿回 Python 里比更可控。
    """
    left_utc = left if left.tzinfo else left.replace(tzinfo=timezone.utc)
    right_utc = right if right.tzinfo else right.replace(tzinfo=timezone.utc)
    return left_utc.date() == right_utc.date()


async def latest_snapshot(
    session: AsyncSession, gpu_id: str, channel: str | None = None
) -> PriceSnapshot | None:
    query = select(PriceSnapshot).where(PriceSnapshot.gpu_id == gpu_id)
    if channel:
        query = query.where(PriceSnapshot.channel == channel)
    query = query.order_by(PriceSnapshot.captured_at.desc()).limit(1)
    return await session.scalar(query)


async def apply_prices(
    session: AsyncSession,
    rows: Iterable[PriceRow],
    *,
    dry_run: bool = False,
    force: bool = False,
) -> ImportReport:
    """校验 → 写快照 → 同步当前价。

    dry_run 只出报告不落库：运维要能先看一眼「这次导入会改哪几个价」，
    而不是导完发现错了再去翻历史。
    """
    gpus = {item.id: item for item in (await session.scalars(select(GpuSpec))).all()}
    report = ImportReport(dry_run=dry_run)
    now = datetime.now(timezone.utc)
    # 同一批里「同卡 + 同渠道 + 同一天」要能相互覆盖。
    # 不能只靠查库：SessionLocal 是 autoflush=False，刚 add 的行查不出来，
    # 结果同一个 CSV 里写两遍同一天的价格会插出两条快照。
    pending: dict[tuple[str, str, str], PriceSnapshot] = {}

    for row in rows:
        gpu = gpus.get(row.gpu_id)
        if gpu is None:
            report.rows.append(
                PriceChange(row.gpu_id, row.gpu_id, None, row.price_cny, row.channel, row.source,
                            parse_captured_at(row.captured_at), "reject", "warn", "目录里没有这个显卡 id")
            )
            report.rejected += 1
            continue

        provided_at = row.captured_at is not None
        captured = parse_captured_at(row.captured_at)
        old = gpu.price_cny

        if row.price_cny < MIN_PRICE_CNY or row.price_cny > MAX_PRICE_CNY:
            report.rows.append(
                PriceChange(gpu.id, gpu.name, old, row.price_cny, row.channel, row.source, captured,
                            "reject", "warn", f"价格超出合理区间 {MIN_PRICE_CNY}–{MAX_PRICE_CNY} 元")
            )
            report.rejected += 1
            continue

        # 只校验用户显式填的时间。「没填就用当前时间」的那条路径不能参与比较：
        # now 是在循环外取的，循环内再取一次必然晚几微秒，会被判成「未来」。
        if provided_at and captured > now:
            report.rows.append(
                PriceChange(gpu.id, gpu.name, old, row.price_cny, row.channel, row.source, captured,
                            "reject", "warn", "采集时间在未来")
            )
            report.rejected += 1
            continue

        ratio = (row.price_cny - old) / old if old else 0.0
        if old and abs(ratio) > MAX_JUMP_RATIO and not force:
            report.rows.append(
                PriceChange(gpu.id, gpu.name, old, row.price_cny, row.channel, row.source, captured,
                            "reject", "warn",
                            f"相对当前价变动 {ratio:+.0%}，超过 {MAX_JUMP_RATIO:.0%} 阈值；"
                            f"确认无误请加 --force")
            )
            report.rejected += 1
            continue

        # 同一天、同渠道视为修正同一条记录，而不是又采了一次
        key = (gpu.id, row.channel, captured.date().isoformat())
        existing: PriceSnapshot | None = pending.get(key)
        if existing is None:
            for candidate in (
                await session.scalars(
                    select(PriceSnapshot)
                    .where(PriceSnapshot.gpu_id == gpu.id, PriceSnapshot.channel == row.channel)
                    .order_by(PriceSnapshot.captured_at.desc())
                    .limit(5)
                )
            ).all():
                if _same_day(candidate.captured_at, captured):
                    existing = candidate
                    break
            if existing is not None:
                pending[key] = existing

        action = "update" if existing is not None else "insert"
        level = "warn" if old and abs(ratio) > 0.25 else "ok"

        report.rows.append(
            PriceChange(gpu.id, gpu.name, old, row.price_cny, row.channel, row.source, captured, action, level)
        )

        if dry_run:
            continue

        if existing is not None:
            existing.price_cny = row.price_cny
            existing.source = row.source
            existing.note = row.note
        else:
            snapshot = PriceSnapshot(
                gpu_id=gpu.id,
                price_cny=row.price_cny,
                channel=row.channel,
                source=row.source,
                note=row.note,
                captured_at=captured,
            )
            session.add(snapshot)
            pending[key] = snapshot

        # 当前有效价以「最新的一次采集」为准。这里直接覆盖，
        # 因为 gpu_spec.price_cny 的语义就是「现在多少钱」，历史在快照表里。
        gpu.price_cny = row.price_cny
        gpu.price_captured_at = captured
        report.written += 1

    if dry_run:
        await session.rollback()
    else:
        await session.commit()

    log.info(
        "价格导入完成 dry_run=%s 写入=%d 拒绝=%d 变动=%d",
        dry_run, report.written, report.rejected, report.changed,
    )
    return report


# ---------------------------------------------------------------- 读取


def age_days(captured: datetime | None) -> float | None:
    if captured is None:
        return None
    value = captured if captured.tzinfo else captured.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - value).total_seconds() / 86400


async def latest_prices(session: AsyncSession) -> list[dict]:
    """给前端用的当前价格表。

    刻意做得小：16 张卡 × 几十字节，一次请求足够，前端可以整体覆盖内置价。

    一次查出全部快照再在 Python 里去重，而不是每张卡查一次（16 次往返）。
    数据量小的时候两者都能跑，但前者在卡数涨到几百张时不用改。
    """
    gpus = {item.id: item for item in (await session.scalars(select(GpuSpec))).all()}
    snapshots = (
        await session.scalars(select(PriceSnapshot).order_by(PriceSnapshot.captured_at.desc()))
    ).all()

    # 先收真实采集，再收 catalog 兜底。不能只按 captured_at 排序取第一条：
    # seed 写 catalog 快照用的是「导入那一刻」，它会压过任何一条历史日期的人工报价，
    # 于是刚导完价的前端仍然显示「目录价」——排查起来极其反直觉。
    latest: dict[str, PriceSnapshot] = {}
    for snapshot in snapshots:
        if snapshot.channel != "catalog":
            latest.setdefault(snapshot.gpu_id, snapshot)
    for snapshot in snapshots:
        if snapshot.channel == "catalog":
            latest.setdefault(snapshot.gpu_id, snapshot)

    threshold = settings.price_stale_days
    result = []
    for gpu_id, gpu in gpus.items():
        snapshot = latest.get(gpu_id)
        # channel='catalog' 是内置目录的估算价，不是真实采集。
        # 给它一个「今天采集过」的时间戳是最容易犯的错：界面会显示
        # 「¥12,499 · 今天」，而那个数字其实是写死的文案。
        # 所以这里明确返回 capturedAt=None，让它按「无采集时间」处理。
        is_catalog = snapshot is None or snapshot.channel == "catalog"
        captured = None if is_catalog else (gpu.price_captured_at or (snapshot.captured_at if snapshot else None))
        days = age_days(captured)
        result.append(
            {
                "gpuId": gpu_id,
                # 以 gpu_spec.price_cny 为准：它就是「当前有效价」
                "priceCny": gpu.price_cny,
                "channel": snapshot.channel if snapshot else "catalog",
                "source": (snapshot.source if snapshot else None) or gpu.source,
                "capturedAt": captured.isoformat() if captured else None,
                "ageDays": None if days is None else round(days, 1),
                # 没采集时间的（内置目录价）也算陈旧：说得出「哪天的价」才叫可追溯
                "stale": days is None or days > threshold,
                # 前端据此区分「真实采集价」和「目录估算价」的文案
                "estimated": is_catalog,
            }
        )
    result.sort(key=lambda item: item["gpuId"])
    return result


async def stale_summary(session: AsyncSession) -> dict:
    """陈旧度报表，给定时任务和 /prices/status 共用。"""
    items = await latest_prices(session)
    # 「从未采集」和「采集过但过期」要分开数：
    # 合成一个数字会让告警文案变成「14 张超过 45 天未更新，最旧 0.6 天」这种自相矛盾的话。
    missing = [item for item in items if item["capturedAt"] is None]
    aged = [item for item in items if item["capturedAt"] is not None and item["stale"]]
    ages = [item["ageDays"] for item in items if item["ageDays"] is not None]
    return {
        "total": len(items),
        "staleCount": len(missing) + len(aged),
        "missingCount": len(missing),
        "agedCount": len(aged),
        "oldestDays": round(max(ages), 1) if ages else None,
        "thresholdDays": settings.price_stale_days,
        "stale": [
            {"gpuId": item["gpuId"], "ageDays": item["ageDays"], "reason": "never" if item["capturedAt"] is None else "aged"}
            for item in missing + aged
        ],
    }


def csv_template() -> str:
    """给运维的模板。带两行真实示例，比一句「列名见文档」有用得多。"""
    today = date.today().isoformat()
    return (
        "gpu_id,price_cny,channel,source,captured_at,note\n"
        f"rtx4090,13299,jd,https://item.jd.com/100000000001.html,{today},京东自营\n"
        f"rtx3060,1899,offline,中关村某店报价单,{today},含税\n"
    )
