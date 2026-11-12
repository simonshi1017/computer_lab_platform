"""目录类模型：模型规格、显卡规格、部件、价格快照。

设计要点：
- **核心列 + detail JSONB**。核心列（参数量、显存、带宽）参与查询与排序，
  必须独立成列；展示用的富字段（比喻、擅长、误区）整块塞进 detail，
  接口再把两者拼回前端已有的 ModelRecord 结构，前端不需要改类型。
- detail 里保留原始记录，所以「规格变更后历史配置被改写」的问题不会发生：
  保存的 build 是快照，不 join 规格表。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import BigIntPK, JSONType


class ModelSpec(Base):
    __tablename__ = "model_spec"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    vendor: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    arch: Mapped[str] = mapped_column(String(32), nullable=False)
    params_b: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    layers: Mapped[int] = mapped_column(nullable=False)
    hidden_dim: Mapped[int] = mapped_column(nullable=False)
    ctx_max: Mapped[int] = mapped_column(nullable=False)
    license: Mapped[str | None] = mapped_column(String(64))
    source: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    updated_at: Mapped[str | None] = mapped_column(String(16))
    # synced_at 同时兼作「目录版本」的一部分：管理后台改过哪一行，
    # 这里的 onupdate 会让 /catalog/version 变号，前端缓存随之失效。
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class GpuSpec(Base):
    __tablename__ = "gpu_spec"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    vendor: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    gpu_class: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    vram_gb: Mapped[int] = mapped_column(nullable=False)
    bandwidth: Mapped[int] = mapped_column(nullable=False)
    tdp_w: Mapped[int] = mapped_column(nullable=False)
    price_cny: Mapped[int] = mapped_column(nullable=False)
    # 当前有效价对应的采集时间。没有它，界面上只能说「参考价 ¥12,499」，
    # 说不出「这是哪天的价」——而这恰恰是用户判断能不能照着买的关键。
    price_captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    condition: Mapped[str] = mapped_column(String(16), nullable=False, default="new")
    source: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    updated_at: Mapped[str | None] = mapped_column(String(16))
    # synced_at 同时兼作「目录版本」的一部分：管理后台改过哪一行，
    # 这里的 onupdate 会让 /catalog/version 变号，前端缓存随之失效。
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PartSpec(Base):
    """主板 / CPU / 内存 / 电源 / 硬盘 / 散热。

    六类部件字段差异大（电源只有瓦数，主板有插槽），拆六张表在 M6 阶段
    只会增加迁移成本。用一张 kind + payload 的表，接口按 kind 分组返回，
    前端拿到的结构和 catalog.json 完全一致。
    """

    __tablename__ = "part_spec"

    kind: Mapped[str] = mapped_column(String(16), primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    price_cny: Mapped[int] = mapped_column(nullable=False, default=0)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    updated_at: Mapped[str | None] = mapped_column(String(16))


class PriceSnapshot(Base):
    """价格历史。

    没有这张表，「参考价」就会变成拍脑袋的数字：任何人都不知道它是
    哪天的价、哪来的。有了它，前端可以显示「¥12,499（京东，2 天前）」。
    """

    __tablename__ = "price_snapshot"

    # SQLite 只有 INTEGER PRIMARY KEY 才自增，BIGINT 不会（测试跑 SQLite）
    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    gpu_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("gpu_spec.id", ondelete="CASCADE"), nullable=False
    )
    price_cny: Mapped[int] = mapped_column(nullable=False)
    # 渠道：jd / tmall / offline / quote（询价）/ catalog（初始目录数据）
    channel: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    # 具体来源：商品页 URL、供应商名、报价单文件名。可追溯到「哪来的这个数」
    source: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(String(255))
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_price_snapshot_gpu_time", "gpu_id", "captured_at"),)
