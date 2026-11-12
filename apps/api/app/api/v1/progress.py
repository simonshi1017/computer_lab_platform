"""学习进度。

M6 只做「进度能跟着账号走」：存 status + 输出物快照。
不做「同一关的历史版本」——这一关的输出物本身可改，留历史对用户没意义。
"""

from __future__ import annotations

from fastapi import APIRouter, Path

from app.core.config import settings
from app.core.deps import CurrentUser, SessionDep
from app.core.errors import bad_request
from app.core.security import utcnow
from app.models import LessonProgress
from app.schemas import ProgressBundleOut, ProgressIn, ProgressOut
from sqlalchemy import select

router = APIRouter(prefix="/progress", tags=["progress"])


def progress_out(row: LessonProgress) -> ProgressOut:
    return ProgressOut(
        lesson_id=row.lesson_id,
        status=row.status,
        output=row.output,
        updated_at=row.updated_at,
    )


@router.get("", response_model=ProgressBundleOut, summary="我的学习进度")
async def list_progress(session: SessionDep, user: CurrentUser) -> ProgressBundleOut:
    rows = await session.scalars(
        select(LessonProgress)
        .where(LessonProgress.user_id == user.id)
        .order_by(LessonProgress.lesson_id)
    )
    items = [progress_out(row) for row in rows.all()]
    return ProgressBundleOut(
        items=items,
        done_count=sum(1 for item in items if item.status == "done"),
        total=settings.lesson_total,
    )


@router.put("/{lesson_id}", response_model=ProgressOut, summary="上报关卡进度")
async def upsert(
    payload: ProgressIn,
    session: SessionDep,
    user: CurrentUser,
    lesson_id: int = Path(ge=1, le=99),
) -> ProgressOut:
    if lesson_id > settings.lesson_total:
        raise bad_request(f"关卡编号超出范围（共 {settings.lesson_total} 关）", code="invalid_lesson")

    row = await session.get(LessonProgress, (user.id, lesson_id))
    if row is None:
        row = LessonProgress(user_id=user.id, lesson_id=lesson_id)
        session.add(row)
    row.status = payload.status
    if payload.output is not None:
        row.output = payload.output
    row.updated_at = utcnow()
    await session.commit()
    await session.refresh(row)
    return progress_out(row)
