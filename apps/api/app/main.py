"""应用入口。

启动顺序（每一步失败都必须说清楚原因，不能让容器静默 half-up）：
  1. 建表（auto_migrate）—— 生产建议改成 `alembic upgrade head`
  2. seed 目录 —— 找不到 catalog.json 只警告，不让服务起不来
  3. 挂管理后台 —— 缺 sqladmin 时跳过，API 仍然可用
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.api.router import api_router
from app.core.config import settings, setup_logging
from app.core.db import SessionLocal, init_models
from app.jobs.scheduler import start_scheduler, stop_scheduler
from app.services.seed import seed_catalog

log = logging.getLogger("clab.app")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    setup_logging(settings.log_level)
    log.info("启动 %s（env=%s）", settings.app_name, settings.env)

    if settings.env != "prod":
        # 这条必须显眼：dev 模式下任何人点一下「开发模式一键登录」就是管理员。
        # 内网试用期可以接受，但必须让人知道自己在哪个模式里。
        log.warning(
            "⚠️  当前为 %s 模式：验证码会直接回传前端，开发登录可一键取得管理员权限。"
            " 正式上线前请设置 APP_ENV=prod 并配好 SMTP 或企业微信。",
            settings.env,
        )

    if settings.auto_migrate:
        await init_models()
        log.info("表结构已就绪")

    async with SessionLocal() as session:
        try:
            stats = await seed_catalog(session)
            if not stats.skipped:
                log.info("目录数据: %s", stats.as_dict())
        except Exception as exc:  # noqa: BLE001
            # seed 失败不该阻止 API 起来：用户配置的读写与目录数据无关，
            # 让服务带病运行 + 日志里保留完整堆栈，比整个站点 502 好。
            log.exception("目录数据导入失败，catalog 接口可能为空: %s", exc)

    # 定时任务在 seed 之后启动：第一次体检要能看到刚导入的数据
    start_scheduler()

    log.info("就绪：http://0.0.0.0:8000%s", settings.api_prefix)
    yield
    stop_scheduler()
    log.info("已停止")


app = FastAPI(
    title="算力模型科普平台 · API",
    version="1.0.0",
    description="模型/硬件目录、配置保存、分享链接、学习进度。",
    lifespan=lifespan,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=None,
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

# sqladmin 的登录态靠 session cookie，必须挂这个中间件
app.add_middleware(SessionMiddleware, secret_key=settings.admin_session_secret, same_site="lax")

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # 让浏览器能读到 ETag，前端才能自己判断缓存是否命中
        expose_headers=["ETag"],
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    """把 pydantic 的报错压成一条人话。

    原始结构是 [{"loc": ["body","state","build","gpuIds"], "msg": "..."}]，
    直接甩给前端既没法展示也没法定位。这里取第一条，带上字段路径。
    """
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(part) for part in first.get("loc", []) if part != "body")
    message = f"{loc}: {first.get('msg', '参数不合法')}" if loc else str(first.get("msg", "参数不合法"))
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": {"code": "validation_error", "message": message}},
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception("未处理异常 %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": {"code": "internal_error", "message": "服务器内部错误，请联系管理员"}},
    )


@app.get("/healthz", include_in_schema=False)
async def healthz() -> JSONResponse:
    """容器健康检查专用：只证明进程还能响应，不查数据库。

    查库会让「数据库重启 5 秒」升级成「API 容器被判定不健康 → 整站 502」。
    """
    return JSONResponse({"ok": True})


app.include_router(api_router, prefix=settings.api_prefix)


try:
    from app.admin import setup_admin

    setup_admin(app)
except Exception as exc:  # noqa: BLE001
    log.warning("管理后台未启用: %s", exc)
