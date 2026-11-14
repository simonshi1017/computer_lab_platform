"""埋点与统计。

原则：**能回答 4 个产品问题就够了**，不做通用分析平台。
1. 有多少人在用（PV / UV / 登录用户）
2. 学习路径走完没有（关卡完成率）
3. 推荐功能有没有被采纳（recommend_apply / recommend_view）
4. 分享有没有真的传播出去（share_open / share_create）

限流与清洗都在这一层做，路由层保持薄：
- 事件名走白名单，未登记的静默丢弃（前端迭代时不该因为多打一个点就 400）
- props 只留 20 个标量字段、字符串截 200 字，防止一个嵌套大对象把 JSONB 撑爆
- 单会话每分钟上限，防脚本刷表
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import AnalyticsEvent, AppUser, Build, LessonProgress, ShareLink

log = logging.getLogger("clab.analytics")

# 前端允许上报的事件。新增事件时**先加这里再加调用点**，
# 否则数据进不来，而且不会有任何报错——这是刻意选择的「静默失败」，
# 因为埋点不该影响主流程。
EVENT_NAMES: dict[str, str] = {
    "page_view": "页面访问",
    "model_view": "查看模型详情",
    "gpu_view": "查看显卡详情",
    "lesson_start": "开始一关",
    "lesson_done": "完成一关",
    "recommend_view": "打开推荐页",
    "recommend_apply": "采纳推荐方案",
    "build_save": "保存配置",
    "build_load": "载入配置",
    "share_create": "生成分享链接",
    "share_open": "打开分享链接",
    "card_download": "下载分享卡片",
    "manual_print": "打印说明书",
    "scenario_start": "开始场景实验",
    "scenario_complete": "完成场景实验",
}

MAX_PROPS_KEYS = 20
MAX_STRING_LEN = 200
MAX_BATCH = 20

# 进程内限流窗口。多 worker 时每个进程各算一份，会略微放宽——
# 这个接口的滥用成本是「多写几行表」，不值得为它引入 Redis。
_buckets: dict[str, deque[float]] = defaultdict(deque)


def _allow(session_id: str) -> bool:
    window = 60.0
    now = time.monotonic()
    bucket = _buckets[session_id]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= settings.event_rate_limit:
        return False
    bucket.append(now)
    # 顺手清掉空桶，避免长时间运行后 dict 无限增长
    if len(_buckets) > 5000:
        for key in [k for k, v in _buckets.items() if not v][:1000]:
            _buckets.pop(key, None)
    return True


def clean_props(props: Any) -> dict[str, Any]:
    if not isinstance(props, dict):
        return {}
    out: dict[str, Any] = {}
    for key, value in list(props.items())[:MAX_PROPS_KEYS]:
        if not isinstance(key, str):
            continue
        name = key[:40]
        if isinstance(value, bool) or isinstance(value, (int, float)):
            out[name] = value
        elif isinstance(value, str):
            out[name] = value[:MAX_STRING_LEN]
        # 嵌套对象/数组直接丢弃：埋点只需要标量，嵌套结构只会让 JSONB 变大
    return out


def clean_ua(ua: str | None) -> str | None:
    if not ua:
        return None
    return ua[:80]


async def record_events(
    session: AsyncSession,
    *,
    session_id: str,
    events: Iterable[dict[str, Any]],
    user_id: int | None,
    ua: str | None,
) -> dict[str, int]:
    """写入一批事件。返回接受/丢弃数量，便于测试与排查。"""
    accepted = 0
    dropped = 0
    short_ua = clean_ua(ua)

    for raw in list(events)[:MAX_BATCH]:
        name = str(raw.get("name") or "")
        if name not in EVENT_NAMES:
            dropped += 1
            continue
        if not _allow(session_id):
            dropped += 1
            continue
        session.add(
            AnalyticsEvent(
                session_id=session_id[:64],
                user_id=user_id,
                name=name,
                path=(str(raw.get("path"))[:255] if raw.get("path") else None),
                props=clean_props(raw.get("props")) or None,
                ua=short_ua,
            )
        )
        accepted += 1

    if accepted:
        await session.commit()
    return {"accepted": accepted, "dropped": dropped}


# ---------------------------------------------------------------- 聚合


def _day_key(value: datetime) -> str:
    """按东八区归日。

    用户在中国，凌晨 0:30 的操作应该算「今天」。SQL 的 date() 在 PG 上按 UTC
    截断会把它算到昨天，所以统一在 Python 里按 +8 处理，顺便绕开
    SQLite/PG 之间的函数差异。
    """
    aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return (aware.astimezone(timezone(timedelta(hours=8)))).strftime("%Y-%m-%d")


def _ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


async def overview(session: AsyncSession, days: int = 7) -> dict[str, Any]:
    days = max(1, min(days, 90))
    since = datetime.now(timezone.utc) - timedelta(days=days)

    events = (
        await session.scalars(
            select(AnalyticsEvent).where(AnalyticsEvent.created_at >= since)
        )
    ).all()

    # 趋势按天分桶；缺的日期补 0，否则折线图会把「没人来」画成「断线」
    today = datetime.now(timezone(timedelta(hours=8))).date()
    daily: dict[str, dict[str, Any]] = {}
    for offset in range(days - 1, -1, -1):
        key = (today - timedelta(days=offset)).isoformat()
        daily[key] = {"date": key, "pv": 0, "uv": 0, "_sessions": set()}

    counts: dict[str, int] = defaultdict(int)
    sessions: set[str] = set()
    authed: set[int] = set()
    for event in events:
        key = _day_key(event.created_at)
        bucket = daily.get(key)
        if bucket is not None:
            bucket["pv"] += 1
            bucket["_sessions"].add(event.session_id)
        counts[event.name] += 1
        sessions.add(event.session_id)
        if event.user_id:
            authed.add(event.user_id)

    trend = []
    for bucket in daily.values():
        bucket["uv"] = len(bucket.pop("_sessions"))
        trend.append(bucket)

    # 关卡完成率：以「有进度记录的人」为分母，而不是全部注册用户。
    # 用全部用户当分母会让完成率随注册数上升而莫名下降。
    progress_rows = (await session.scalars(select(LessonProgress))).all()
    learners = {row.user_id for row in progress_rows}
    finishers = {row.user_id for row in progress_rows if row.status == "done"}
    lesson_stats = {
        "learners": len(learners),
        "finishers": len(finishers),
        "completionRate": _ratio(len(finishers), len(learners)),
        "totalDone": sum(1 for row in progress_rows if row.status == "done"),
        "totalLessons": settings.lesson_total,
    }

    recommend_views = counts.get("recommend_view", 0)
    recommend_applies = counts.get("recommend_apply", 0)
    share_creates = counts.get("share_create", 0)
    share_opens = counts.get("share_open", 0)

    user_count = len((await session.scalars(select(AppUser.id))).all())
    builds = (await session.scalars(select(Build.id))).all()
    links = (await session.scalars(select(ShareLink.token))).all()

    return {
        "rangeDays": days,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "pv": len(events),
            "uv": len(sessions),
            "authedUsers": len(authed),
            "registeredUsers": user_count,
        },
        "trend": trend,
        "topEvents": [
            {"name": name, "label": EVENT_NAMES.get(name, name), "count": count}
            for name, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:10]
        ],
        "lessons": lesson_stats,
        "recommend": {
            "views": recommend_views,
            "applies": recommend_applies,
            "applyRate": _ratio(recommend_applies, recommend_views),
        },
        "share": {
            "created": share_creates,
            # 分母用「实际存在的分享链接数」，而不是 share_create 事件数：
            # 通过接口/脚本创建的链接不会打前端埋点，用事件数当分母会算出
            # 「0 个链接被打开 12 次」这种自相矛盾的数字。
            "opens": share_opens,
            "openPerShare": _ratio(share_opens, max(share_creates, len(links))),
            "liveLinks": len(links),
        },
        "builds": {"saved": len(builds)},
    }
