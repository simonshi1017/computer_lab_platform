"""配置的增删改查。"""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.core.deps import CurrentUser, SessionDep
from app.models import Build
from app.schemas import BuildCreate, BuildOut, BuildSummaryOut, BuildUpdate
from app.services import builds as build_service

router = APIRouter(prefix="/builds", tags=["builds"])


def summary_out(build: Build) -> BuildSummaryOut:
    return BuildSummaryOut(
        id=build.id,
        name=build.name,
        model_id=build.model_id,
        model_name=build.model_name,
        score=build.score,
        grade=build.grade,
        price_cny=build.price_cny,
        created_at=build.created_at,
        updated_at=build.updated_at,
    )


def build_out(build: Build) -> BuildOut:
    return BuildOut(
        **summary_out(build).model_dump(),
        state=build.payload,
        evaluation=build.evaluation,
        note=build.note,
    )


@router.post("", response_model=BuildOut, status_code=status.HTTP_201_CREATED, summary="保存配置")
async def create(payload: BuildCreate, session: SessionDep, user: CurrentUser) -> BuildOut:
    # model_dump(by_alias=True) 落库：库里存的是前端结构（camelCase），
    # 将来被别的客户端读出来时不需要知道 Python 的命名习惯。
    state = payload.state.model_dump(by_alias=True)
    build = await build_service.create_build(
        session,
        user,
        state=state,
        evaluation=payload.evaluation,
        name=payload.name,
        note=payload.note,
    )
    return build_out(build)


@router.get("", response_model=list[BuildSummaryOut], summary="我的配置列表")
async def list_mine(session: SessionDep, user: CurrentUser) -> list[BuildSummaryOut]:
    return [summary_out(build) for build in await build_service.list_builds(session, user.id)]


@router.get("/{build_id}", response_model=BuildOut, summary="配置详情")
async def detail(build_id: int, session: SessionDep, user: CurrentUser) -> BuildOut:
    return build_out(await build_service.get_build(session, user, build_id))


@router.patch("/{build_id}", response_model=BuildOut, summary="重命名 / 更新配置")
async def update(
    build_id: int, payload: BuildUpdate, session: SessionDep, user: CurrentUser
) -> BuildOut:
    state = (
        payload.state.model_dump(by_alias=True)
        if payload.state is not None
        else None
    )
    build = await build_service.update_build(
        session,
        user,
        build_id,
        name=payload.name,
        state=state,
        evaluation=payload.evaluation,
        note=payload.note,
        is_public=payload.is_public,
    )
    return build_out(build)


@router.delete(
    "/{build_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="删除配置",
)
async def remove(build_id: int, session: SessionDep, user: CurrentUser) -> Response:
    await build_service.delete_build(session, user, build_id)
    # 显式返回空 Response：204 不允许带 body，FastAPI 需要它把序列化器关掉
    return Response(status_code=status.HTTP_204_NO_CONTENT)
