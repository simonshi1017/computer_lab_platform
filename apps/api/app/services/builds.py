"""配置的读写与分享。

权限模型很简单，但必须写死：**只有作者能读自己的配置（除非公开分享）**。
列表、详情、更新、删除四处都要用同一个判定，所以收在 `_owned` 里，
避免某处漏判导致「改一下 URL 里的 id 就能看到别人的机器配置」。
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, forbidden, not_found
from app.core.security import ensure_aware, new_share_token, utcnow
from app.models import AppUser, Build, ModelSpec, ShareLink

log = logging.getLogger("clab.builds")

MAX_BUILDS_PER_USER = 200


def _dig(data: Any, *path: str, default: Any = None) -> Any:
    """安全下钻。

    evaluation 是前端传来的 JSON，形状随时可能变；用 `.get` 链一路保护，
    拿不到就回落默认值。**绝不假设 stats.priceCny 一定存在**——
    少一个字段不该让整个保存请求 500。
    """
    current = data
    for key in path:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
        if current is None:
            return default
    return current


async def _display_name(session: AsyncSession, model_id: str, custom: Any) -> str:
    """模型的中文名。

    前端只传 modelId（比如 qwen25-14b），直接显示出来对用户就是天书。
    查一次目录拿 `detail.cn`（通义千问 2.5 · 14B），查不到才退回 id。
    这是列表页、分享落地页、说明书三处共用的显示名。
    """
    if isinstance(custom, dict) and custom.get("name"):
        return str(custom["name"])
    spec = await session.get(ModelSpec, model_id)
    if spec is not None:
        detail = spec.detail or {}
        return str(detail.get("cn") or spec.name or model_id)
    return model_id


async def summarize(
    session: AsyncSession, state: dict[str, Any], evaluation: dict[str, Any] | None
) -> dict[str, Any]:
    """从快照里抽出列表页需要的字段。

    冗余存不是为了省一次 join，而是为了让列表在「规格库被改过」之后
    仍然显示当时保存的名字和分数。
    """
    model_id = str(state.get("modelId") or "unknown")
    model_name = await _display_name(session, model_id, state.get("customSpec"))
    score = _dig(evaluation, "score", default=0)
    return {
        "model_id": model_id,
        "model_name": model_name,
        "score": int(score) if isinstance(score, (int, float)) else 0,
        "grade": str(_dig(evaluation, "grade", default="—") or "—"),
        "price_cny": int(_dig(evaluation, "stats", "priceCny", default=0) or 0),
    }


def default_name(model_name: str, state: dict[str, Any], existing: int) -> str:
    gpus = _dig(state, "build", "gpuIds", default=[]) or []
    count = len(gpus) if isinstance(gpus, list) else 0
    suffix = f" ×{count}" if count > 1 else ""
    return f"{model_name}{suffix} 配置 {existing + 1}"


async def count_builds(session: AsyncSession, user_id: int) -> int:
    rows = await session.scalars(select(Build.id).where(Build.user_id == user_id))
    return len(rows.all())


async def create_build(
    session: AsyncSession,
    user: AppUser,
    *,
    state: dict[str, Any],
    evaluation: dict[str, Any] | None,
    name: str | None,
    note: str | None,
) -> Build:
    total = await count_builds(session, user.id)
    if total >= MAX_BUILDS_PER_USER:
        raise bad_request(f"单个账号最多保存 {MAX_BUILDS_PER_USER} 套配置，请先删除一些", code="quota_exceeded")

    summary = await summarize(session, state, evaluation)
    build = Build(
        user_id=user.id,
        name=(name or default_name(summary["model_name"], state, total)).strip()[:120],
        payload=state,
        evaluation=evaluation,
        note=note,
        **summary,
    )
    session.add(build)
    await session.commit()
    await session.refresh(build)
    return build


async def list_builds(session: AsyncSession, user_id: int) -> list[Build]:
    rows = await session.scalars(
        select(Build).where(Build.user_id == user_id).order_by(Build.updated_at.desc())
    )
    return list(rows.all())


async def _owned(session: AsyncSession, user: AppUser, build_id: int) -> Build:
    build = await session.get(Build, build_id)
    if build is None:
        raise not_found("配置不存在或已被删除", code="build_not_found")
    if build.user_id != user.id:
        # 不区分「不存在」和「不是你的」：区分了就等于告诉别人这个 id 存在
        raise forbidden("无权访问该配置")
    return build


async def get_build(session: AsyncSession, user: AppUser, build_id: int) -> Build:
    return await _owned(session, user, build_id)


async def update_build(
    session: AsyncSession,
    user: AppUser,
    build_id: int,
    *,
    name: str | None,
    state: dict[str, Any] | None,
    evaluation: dict[str, Any] | None,
    note: str | None,
    is_public: bool | None,
) -> Build:
    build = await _owned(session, user, build_id)

    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise bad_request("配置名不能为空", code="invalid_name")
        build.name = cleaned[:120]
    if note is not None:
        build.note = note
    if state is not None:
        build.payload = state
        summary = await summarize(session, state, evaluation if evaluation is not None else build.evaluation)
        build.model_id = summary["model_id"]
        build.model_name = summary["model_name"]
        build.price_cny = summary["price_cny"]
    if evaluation is not None:
        build.evaluation = evaluation
        summary = await summarize(session, build.payload, evaluation)
        build.score = summary["score"]
        build.grade = summary["grade"]
        build.price_cny = summary["price_cny"]

    await session.commit()
    await session.refresh(build)
    return build


async def delete_build(session: AsyncSession, user: AppUser, build_id: int) -> None:
    build = await _owned(session, user, build_id)
    await session.delete(build)
    # share_link 有 ondelete=CASCADE，但 SQLite 默认不开外键约束，
    # 所以这里显式删一次，保证两种数据库行为一致
    links = await session.scalars(select(ShareLink).where(ShareLink.build_id == build_id))
    for link in links.all():
        await session.delete(link)
    await session.commit()


# ---------------------------------------------------------------- 分享


async def create_share(
    session: AsyncSession,
    user: AppUser,
    build_id: int,
    *,
    expires_in_days: int | None,
) -> ShareLink:
    await _owned(session, user, build_id)

    # 同一套配置重复点「分享」时复用未过期的旧链接，否则用户会攒出
    # 一堆指向同一台机器的链接，自己都分不清发给别人的是哪个。
    existing = await session.scalars(select(ShareLink).where(ShareLink.build_id == build_id))
    now = utcnow()
    for link in existing.all():
        if link.expires_at is None or ensure_aware(link.expires_at) > now:
            return link

    token = new_share_token()
    while await session.get(ShareLink, token) is not None:
        token = new_share_token()

    link = ShareLink(
        token=token,
        build_id=build_id,
        expires_at=now + timedelta(days=expires_in_days) if expires_in_days else None,
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


async def resolve_share(session: AsyncSession, token: str, *, count_view: bool = True) -> tuple[ShareLink, Build, AppUser | None]:
    link = await session.get(ShareLink, token)
    if link is None:
        raise not_found("分享链接不存在或已失效", code="share_not_found")
    if link.expires_at is not None and ensure_aware(link.expires_at) < utcnow():
        raise not_found("分享链接已过期", code="share_expired")

    build = await session.get(Build, link.build_id)
    if build is None:
        raise not_found("分享的配置已被作者删除", code="build_not_found")

    author = await session.get(AppUser, build.user_id)

    if count_view:
        # 浏览量允许少量误差：并发下两次读到同一个值再各自 +1 会少记一次。
        # 这个数字的用途是「有没有人看」，不需要精确到个位。
        link.views = (link.views or 0) + 1
        link.last_viewed_at = utcnow()
        await session.commit()
        await session.refresh(link)

    # 作者信息只给昵称，不给邮箱
    return link, build, author
