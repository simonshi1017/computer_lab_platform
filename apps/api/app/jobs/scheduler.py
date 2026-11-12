"""定时任务：每日价格新鲜度检查 + 告警。

为什么「抓取」变成了「检查」：没有可用的自动价格源（见 pricing.py 的说明），
所以这个任务做的不是抓取，而是**催办**——找出「超过 N 天没更新」和
「从来没有采集时间」的显卡，每天提醒一次，直到有人导入新的 CSV。

不做的两件事：
- 不自动改价（没有人确认的价格不该进库）；
- 不在多 worker 下跑（会重复告警）。容器默认单 worker，扩进程时用
  `SCHEDULER_ENABLED=false` 只让一个实例跑任务。
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings
from app.core.db import SessionLocal
from app.services.pricing import stale_summary

log = logging.getLogger("clab.jobs")

_scheduler: AsyncIOScheduler | None = None


async def send_alert(title: str, lines: list[str]) -> bool:
    """告警。

    两条通道：
    1. 结构化日志（永远有，运维能 grep）；
    2. 企业微信群机器人（配了 webhook 才有）。
    告警本身失败不能抛异常——它是在任务里调的，抛了会让调度器记一次
    「任务失败」，反而掩盖真正的问题。
    """
    for line in lines:
        log.warning("[告警] %s | %s", title, line)

    if not settings.alert_webhook:
        return False

    content = f"**{title}**\n" + "\n".join(f"- {line}" for line in lines)
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                settings.alert_webhook,
                json={"msgtype": "markdown", "markdown": {"content": content}},
            )
            if response.status_code >= 400:
                log.warning("告警 webhook 返回 %s: %s", response.status_code, response.text[:200])
                return False
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("告警 webhook 发送失败: %s", exc)
        return False


async def daily_price_health() -> dict[str, Any]:
    """每日价格体检。

    判定规则只有两条，但覆盖了绝大多数「数据烂掉」的情形：
    - 有卡从来没采过价（missing）→ 这些卡在界面上只能显示内置价，等于没有来源
    - 有卡超过阈值没更新（stale）→ 用户看到的可能是三个月前的行情
    """
    async with SessionLocal() as session:
        summary = await stale_summary(session)

    if summary["staleCount"] == 0 and summary["missingCount"] == 0:
        log.info(
            "价格体检通过：%d 张卡全部在 %d 天内更新过",
            summary["total"], summary["thresholdDays"],
        )
        return {"ok": True, **summary}

    lines = [
        f"共 {summary['total']} 张显卡："
        f"{summary['missingCount']} 张从未采集过价格，"
        f"{summary['agedCount']} 张超过 {summary['thresholdDays']} 天未更新",
    ]
    if summary["oldestDays"] is not None:
        lines.append(f"最旧的一条距今 {summary['oldestDays']} 天")
    worst = sorted(
        (item for item in summary["stale"] if item["ageDays"] is not None),
        key=lambda item: item["ageDays"],
        reverse=True,
    )[:5]
    if worst:
        lines.append("最陈旧的几张：" + "、".join(f"{item['gpuId']}({item['ageDays']}天)" for item in worst))
    if summary["missingCount"]:
        lines.append(f"其中 {summary['missingCount']} 张从未采集，界面上只能显示目录估算价")
    lines.append("处理方式：导出一份 CSV 后执行 `python -m app.cli prices import <file>`")

    await send_alert("价格数据需要更新", lines)
    return {"ok": False, **summary}


def start_scheduler() -> AsyncIOScheduler | None:
    global _scheduler
    if not settings.scheduler_enabled:
        log.info("定时任务已关闭（SCHEDULER_ENABLED=false）")
        return None
    if _scheduler is not None:
        return _scheduler

    scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")
    try:
        trigger = CronTrigger.from_crontab(settings.price_check_cron, timezone="Asia/Shanghai")
    except ValueError:
        log.error("PRICE_CHECK_CRON 格式不合法（%r），回退到每日 09:00", settings.price_check_cron)
        trigger = CronTrigger(hour=9, minute=0, timezone="Asia/Shanghai")

    scheduler.add_job(
        daily_price_health,
        trigger=trigger,
        id="daily_price_health",
        name="价格新鲜度检查",
        # 容器重启错过时间点时补跑一次，但不堆积多次
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
    )
    scheduler.start()
    _scheduler = scheduler
    log.info("定时任务已启动：价格体检 %s（时区 Asia/Shanghai）", settings.price_check_cron)
    return scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        log.info("定时任务已停止")
