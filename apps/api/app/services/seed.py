"""把 packages/data 的快照灌进数据库。

为什么不直接在 Python 里重写一份数据：**单一数据源**。
`@clab/data` 有 zod 校验 + 跨记录交叉校验 + 「文案数字与内核口径对账」，
这些检查已经在前端构建时跑过了。Python 这边再抄一份，两份必然漂移，
而且漂移方向没人能察觉（前端改了参数量，后端还发着旧值）。

所以：JSON 是唯一事实来源，DB 只是它的可查询副本。
启动时先 upsert，再清理「已经不在目录里」的模型 —— 目录换代时
（例如 2026-11 把 Qwen2.5 一代换成 Qwen3.5/3.8），旧行如果留着，
接口会返回 21 条模型、后台下拉框里混着两代产品，用户看到的是
一份不存在于任何商店的清单。配置（builds）自己存了 model_id 与
model_name 快照，不依赖这张表，所以删目录行不会破坏用户数据。
清理范围仅限 models / gpus，部件表保持只增不减。
可用 CATALOG_PRUNE=false 关掉（管理后台手工加过条目时用）。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import GpuSpec, ModelSpec, PartSpec, PriceSnapshot

log = logging.getLogger("clab.seed")

PART_KINDS = ("cpus", "mobos", "rams", "psus", "storages", "coolings")


@dataclass
class SeedStats:
    models: int = 0
    gpus: int = 0
    parts: dict[str, int] = field(default_factory=dict)
    prices: int = 0
    pruned: int = 0
    skipped: bool = False
    source: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "models": self.models,
            "gpus": self.gpus,
            "parts": self.parts,
            "prices": self.prices,
            "pruned": self.pruned,
            "skipped": self.skipped,
            "source": self.source,
        }


def load_catalog_file() -> dict[str, Any] | None:
    path = settings.resolve_catalog_path()
    if not path:
        return None
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _catalog_timestamp(updated_at: Any) -> datetime:
    """把 '2026-11' 这样的月份精度时间戳落成月初。

    目录里只有年月，没有具体日期；用月初是为了「宁可显示得更旧」——
    价格陈旧一点只是提示，假装新鲜才是问题。
    """
    from datetime import datetime, timezone

    if isinstance(updated_at, str):
        try:
            year, month = updated_at.split("-")[:2]
            return datetime(int(year), int(month), 1, tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass
    return datetime.now(timezone.utc)


def _model_row(record: dict[str, Any]) -> ModelSpec:
    return ModelSpec(
        id=record["id"],
        name=record["name"],
        vendor=record["vendor"],
        arch=record.get("arch", "dense"),
        params_b=record["paramsB"],
        layers=record["layers"],
        hidden_dim=record["hiddenDim"],
        ctx_max=record["ctxMax"],
        license=record.get("license"),
        source=record.get("source"),
        # detail 存整条记录：还原时直接展开，再覆盖核心列。
        # 冗余几十字节，换来「以后前端加字段不用改后端」。
        detail=record,
        updated_at=record.get("updatedAt"),
    )


def _gpu_row(record: dict[str, Any]) -> GpuSpec:
    return GpuSpec(
        id=record["id"],
        name=record["name"],
        vendor=record["vendor"],
        gpu_class=record.get("gpuClass", "消费级"),
        vram_gb=record["vramGb"],
        bandwidth=record["bandwidth"],
        tdp_w=record["tdpW"],
        price_cny=record["priceCny"],
        condition=record.get("condition", "new"),
        source=record.get("source"),
        detail=record,
        updated_at=record.get("updatedAt"),
    )


async def _upsert(session: AsyncSession, model: type, rows: list[Any]) -> int:
    """按主键 upsert。用 merge 而不是「先查再插」：一次往返，且天然幂等。"""
    for row in rows:
        await session.merge(row)
    return len(rows)


async def _prune(session: AsyncSession, model: type, keep: set[str]) -> int:
    """删掉目录里已经不存在的行。返回删除条数。

    只删「目录镜像表」，不碰用户数据：builds / progress / events 都不引用这些主键。
    """
    existing = (await session.execute(select(model.id))).scalars().all()
    stale = [item for item in existing if item not in keep]
    for item in stale:
        row = await session.get(model, item)
        if row is not None:
            await session.delete(row)
    if stale:
        log.info("目录换代：清理 %s 条已下线的 %s 记录（%s）", len(stale), model.__name__, ", ".join(sorted(stale)[:6]))
    return len(stale)


async def seed_catalog(session: AsyncSession, *, force: bool = False) -> SeedStats:
    """导入目录数据。

    幂等：容器每次重启都会跑一遍，已存在则覆盖成 JSON 里的最新值。
    `force=False` 且库里已有数据时也照常 upsert——因为「容器重启后
    发的还是旧数据」是比「多一次写」严重得多的故障。
    """
    stats = SeedStats()
    data = load_catalog_file()
    if data is None:
        stats.skipped = True
        log.warning(
            "未找到 catalog.json（可用 CATALOG_PATH 指定）。跳过 seed —— "
            "catalog 接口会返回空列表，请先执行 pnpm --filter @clab/data build"
        )
        return stats

    stats.source = settings.resolve_catalog_path()

    models = [_model_row(item) for item in data.get("models", [])]
    gpus = [_gpu_row(item) for item in data.get("gpus", [])]
    stats.models = await _upsert(session, ModelSpec, models)
    stats.gpus = await _upsert(session, GpuSpec, gpus)

    if settings.catalog_prune:
        stats.pruned = await _prune(session, ModelSpec, {row.id for row in models})
        stats.pruned += await _prune(session, GpuSpec, {row.id for row in gpus})

    for kind in PART_KINDS:
        records = data.get("parts", {}).get(kind, [])
        rows = [
            PartSpec(
                kind=kind,
                id=record["id"],
                name=record["name"],
                price_cny=record.get("priceCny", 0),
                payload=record,
                updated_at=record.get("updatedAt"),
            )
            for record in records
        ]
        stats.parts[kind] = await _upsert(session, PartSpec, rows)

    # 首次 seed 时为每张卡补一条价格快照，让「参考价」从一开始就有时间戳。
    # 已有快照就不重复插，否则每天重启会堆出一堆同一价格的假历史。
    existing = await session.scalar(select(PriceSnapshot.id).limit(1))
    if existing is None:
        # 时间戳用目录的 updatedAt，而不是「现在」。
        # 用 now 会让一条手写的估算价看起来像今天刚采集过，直接违背
        # 「所有估算值可追溯」的承诺。
        captured_at = _catalog_timestamp(data.get("updatedAt"))
        for record in data.get("gpus", []):
            session.add(
                PriceSnapshot(
                    gpu_id=record["id"],
                    price_cny=record["priceCny"],
                    channel="catalog",
                    source="内置目录 catalog.json（估算价，非真实采集）",
                    note=f"目录数据版本 {data.get('updatedAt') or '未知'}",
                    captured_at=captured_at,
                )
            )
            stats.prices += 1

    await session.commit()
    log.info(
        "seed 完成：%d 模型 / %d 显卡 / %d 部件 / %d 价格快照（%s）",
        stats.models,
        stats.gpus,
        sum(stats.parts.values()),
        stats.prices,
        stats.source,
    )
    return stats
