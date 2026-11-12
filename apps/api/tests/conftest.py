"""测试夹具。

两个刻意的选择：

1. **用真实 SQLite 文件而不是内存库**。`sqlite+aiosqlite:///:memory:` 每个连接
   都是独立库，异步连接池一换连接表就没了，症状是「偶尔查不到刚插入的行」。
   临时文件没有这个问题，且更接近真实部署。
2. **不启动 lifespan**，手动执行建表与 seed。测试要能精确控制「什么时候导数据」，
   否则验证空库行为时会被启动钩子干扰。
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="clab-test-")

# 必须在 import app.* 之前设好：config.settings 与 db.engine 都是模块级单例
os.environ.update(
    {
        "APP_ENV": "test",
        "DATABASE_URL": f"sqlite+aiosqlite:///{_TMP}/test.db",
        "JWT_SECRET": "test-secret-not-for-production",
        "ADMIN_PASSWORD": "test-admin-pass",
        "ALLOW_DEV_LOGIN": "true",
        "LOG_LEVEL": "WARNING",
        "FRONTEND_URL": "http://localhost:8080",
    }
)

import httpx  # noqa: E402
from sqlalchemy import delete  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.services.seed import seed_catalog  # noqa: E402


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
async def prepared_db() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        await seed_catalog(session)
    yield
    await engine.dispose()


@pytest.fixture
async def client(prepared_db: None) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as db:
        yield db


@pytest.fixture
async def auth(client: httpx.AsyncClient) -> dict[str, str]:
    """开发登录拿到的一对 token，包成 Authorization 头。"""
    response = await client.post("/api/v1/auth/dev-login", json={"email": "tester@clab.local"})
    assert response.status_code == 200, response.text
    token = response.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def fresh_prices(prepared_db: None) -> AsyncIterator[None]:
    """把价格恢复到目录初值。

    价格用例会改 `gpu_spec.price_cny`，不隔离的话后一条用例拿到的「原价」
    是前一条改过的数，于是「涨 900% 应该被拒绝」这种断言就随机翻车。
    这类失败最难查，因为它只在特定执行顺序下出现。
    """
    from app.models import GpuSpec, PriceSnapshot

    import json

    path = Path(__file__).resolve().parents[3] / "packages" / "data" / "dist" / "catalog.json"
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    async with SessionLocal() as session:
        for record in data["gpus"]:
            gpu = await session.get(GpuSpec, record["id"])
            if gpu is not None:
                gpu.price_cny = record["priceCny"]
                gpu.price_captured_at = None
        # 只删真实采集的快照，保留 seed 写的 catalog 快照
        await session.execute(delete(PriceSnapshot).where(PriceSnapshot.channel != "catalog"))
        await session.commit()

    yield


@pytest.fixture
def catalog_json() -> dict:
    """真实目录快照，用来断言接口字段与前端数据同构。"""
    import json

    path = Path(__file__).resolve().parents[3] / "packages" / "data" / "dist" / "catalog.json"
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)
