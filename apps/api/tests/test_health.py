"""健康检查与启动状态。"""

from __future__ import annotations

import httpx


async def test_healthz_does_not_touch_db(client: httpx.AsyncClient) -> None:
    """容器探针必须只证明进程活着——它连不连得上数据库是另一回事。"""
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


async def test_health_reports_dependencies(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "up"
    assert body["catalog"]["counts"]["models"] > 0


async def test_openapi_available(client: httpx.AsyncClient) -> None:
    """前端按 OpenAPI 生成类型，这份文档必须一直在。"""
    response = await client.get("/api/v1/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    for expected in ("/api/v1/builds", "/api/v1/share/{token}", "/api/v1/catalog/models"):
        assert expected in paths


async def test_unknown_route_returns_404(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/nope")
    assert response.status_code == 404
