"""目录只读接口。

**这是全站唯一会被高频重复请求的接口**，所以做了两级缓存：

1. 服务端 ETag：内容不变就返回 304，body 一个字节都不传；
2. Cache-Control: public, max-age=300，让浏览器自己先扛住。

catalog 的读放大是「每个用户每次进站 1 次 × 3 个接口」，而内容一天最多
变一次。没有缓存的话，Postgres 会为一批完全相同的行反复做全表扫描。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse

from app.core.deps import SessionDep
from app.services import catalog as catalog_service

router = APIRouter(prefix="/catalog", tags=["catalog"])

CACHE_CONTROL = "public, max-age=300"


def cached(request: Request, payload: Any) -> Response:
    etag = catalog_service.compute_etag(payload)
    headers = {"ETag": etag, "Cache-Control": CACHE_CONTROL}
    if request.headers.get("if-none-match") == etag:
        # 304 必须仍然带 ETag，否则浏览器下一次就没法再协商
        return Response(status_code=304, headers=headers)
    return JSONResponse(payload, headers=headers)


@router.get("/models", summary="模型列表")
async def get_models(
    request: Request,
    session: SessionDep,
    size: float | None = Query(default=None, description="只返回参数量不超过 N B 的模型"),
    vendor: str | None = Query(default=None, description="按厂商过滤"),
) -> Response:
    items = await catalog_service.list_models(session)
    if size is not None:
        items = [item for item in items if float(item.get("paramsB") or 0) <= size]
    if vendor:
        items = [item for item in items if item.get("vendor") == vendor]
    return cached(request, items)


@router.get("/gpus", summary="显卡列表")
async def get_gpus(
    request: Request,
    session: SessionDep,
    min_vram: int | None = Query(default=None, description="最低显存 GB"),
    vendor: str | None = Query(default=None),
) -> Response:
    items = await catalog_service.list_gpus(session)
    if min_vram is not None:
        items = [item for item in items if int(item.get("vramGb") or 0) >= min_vram]
    if vendor:
        items = [item for item in items if item.get("vendor") == vendor]
    return cached(request, items)


@router.get("/parts", summary="部件列表（按类型分组）")
async def get_parts(request: Request, session: SessionDep) -> Response:
    return cached(request, await catalog_service.list_parts(session))


@router.get("/all", summary="完整目录（前端一次性替换内置数据用）")
async def get_all(request: Request, session: SessionDep) -> Response:
    payload = {
        "models": await catalog_service.list_models(session),
        "gpus": await catalog_service.list_gpus(session),
        "parts": await catalog_service.list_parts(session),
        "version": await catalog_service.catalog_version(session),
    }
    return cached(request, payload)


@router.get("/version", summary="数据集版本（用于前端失效缓存）")
async def get_version(request: Request, session: SessionDep) -> Response:
    return cached(request, await catalog_service.catalog_version(session))
