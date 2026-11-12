"""目录读取。

输出结构与 `packages/data` 的 ModelRecord / GpuRecord **完全同构**：
DB 里的 detail 是整条原始记录，读出来展开、再用核心列覆盖一遍
（管理后台改了参数量，以列为准，避免 detail 里的旧值把它盖回去）。
前端因此不需要为「数据来自接口还是来自 JSON」写两套类型。
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GpuSpec, ModelSpec, PartSpec

PART_KINDS = ("cpus", "mobos", "rams", "psus", "storages", "coolings")


def _merge(detail: dict[str, Any] | None, overrides: dict[str, Any]) -> dict[str, Any]:
    return {**(detail or {}), **{k: v for k, v in overrides.items() if v is not None}}


def model_dict(row: ModelSpec) -> dict[str, Any]:
    return _merge(
        row.detail,
        {
            "id": row.id,
            "name": row.name,
            "vendor": row.vendor,
            "arch": row.arch,
            "paramsB": float(row.params_b),
            "layers": row.layers,
            "hiddenDim": row.hidden_dim,
            "ctxMax": row.ctx_max,
            "license": row.license,
            "source": row.source,
            "updatedAt": row.updated_at,
        },
    )


def gpu_dict(row: GpuSpec) -> dict[str, Any]:
    return _merge(
        row.detail,
        {
            "id": row.id,
            "name": row.name,
            "vendor": row.vendor,
            "gpuClass": row.gpu_class,
            "vramGb": row.vram_gb,
            "bandwidth": row.bandwidth,
            "tdpW": row.tdp_w,
            "priceCny": row.price_cny,
            "condition": row.condition,
            "source": row.source,
            "updatedAt": row.updated_at,
        },
    )


def part_dict(row: PartSpec) -> dict[str, Any]:
    return _merge(
        row.payload,
        {
            "id": row.id,
            "name": row.name,
            "priceCny": row.price_cny,
            "updatedAt": row.updated_at,
        },
    )


async def list_models(session: AsyncSession) -> list[dict[str, Any]]:
    rows = (await session.scalars(select(ModelSpec))).all()
    # 按参数量升序：和「从能跑的开始看」的阅读习惯一致
    return [model_dict(row) for row in sorted(rows, key=lambda r: float(r.params_b))]


async def list_gpus(session: AsyncSession) -> list[dict[str, Any]]:
    rows = (await session.scalars(select(GpuSpec))).all()
    return [gpu_dict(row) for row in sorted(rows, key=lambda r: (r.vram_gb, r.bandwidth))]


async def list_parts(session: AsyncSession) -> dict[str, list[dict[str, Any]]]:
    rows = (await session.scalars(select(PartSpec))).all()
    grouped: dict[str, list[dict[str, Any]]] = {kind: [] for kind in PART_KINDS}
    for row in rows:
        if row.kind in grouped:
            grouped[row.kind].append(part_dict(row))
    for items in grouped.values():
        items.sort(key=lambda item: item.get("priceCny", 0))
    return grouped


async def catalog_version(session: AsyncSession) -> dict[str, Any]:
    """数据集版本。

    组成：三张表的行数 + 最新 synced_at。管理后台改一行，synced_at 变，
    版本号就变，前端 ETag 随之失效。比「文件 hash」更贴近真实状态：
    文件没变但后台改过数据时，缓存也必须失效。
    """
    model_count = await session.scalar(select(func.count()).select_from(ModelSpec)) or 0
    gpu_count = await session.scalar(select(func.count()).select_from(GpuSpec)) or 0
    part_count = await session.scalar(select(func.count()).select_from(PartSpec)) or 0
    latest = (
        await session.scalar(select(func.max(ModelSpec.synced_at)))
        or await session.scalar(select(func.max(GpuSpec.synced_at)))
        or None
    )

    stamp = latest.isoformat() if isinstance(latest, datetime) else "empty"
    seed = f"{model_count}:{gpu_count}:{part_count}:{stamp}"
    version = hashlib.sha256(seed.encode()).hexdigest()[:16]

    return {
        "version": version,
        "updatedAt": _date_only(latest),
        "counts": {"models": model_count, "gpus": gpu_count, "parts": part_count},
    }


def _date_only(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    return None


def compute_etag(payload: Any) -> str:
    """内容强校验。带引号是 HTTP 规范要求。"""
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return '"' + hashlib.sha256(body.encode()).hexdigest()[:20] + '"'
