"""catalog 接口。

核心断言不是「返回了 200」，而是「字段与前端内置数据同构」——
只要有一个字段改名，前端会因为 undefined 而静默降级成空列表，
这种 bug 在浏览器里极难定位，所以在接口层就钉死。
"""

from __future__ import annotations

import httpx


async def test_models_are_structurally_compatible(
    client: httpx.AsyncClient, catalog_json: dict
) -> None:
    response = await client.get("/api/v1/catalog/models")
    assert response.status_code == 200
    items = response.json()

    assert len(items) == len(catalog_json["models"])
    by_id = {item["id"]: item for item in items}
    for expected in catalog_json["models"]:
        actual = by_id[expected["id"]]
        # 计算必需字段逐个对：少一个，显存估算就会算出 NaN
        for key in ("id", "name", "vendor", "paramsB", "layers", "hiddenDim", "ctxMax"):
            assert actual[key] == expected[key], f"{expected['id']}.{key} 不一致"
        # 展示字段（模型科普的主体）也必须带上，否则接口版本比 JSON 还穷
        for key in ("cn", "scenes", "strengths", "weaknesses", "metaphor", "real"):
            assert actual.get(key), f"{expected['id']} 缺少 {key}"


async def test_gpus_carry_condition_flag(client: httpx.AsyncClient) -> None:
    items = (await client.get("/api/v1/catalog/gpus")).json()
    used = [item for item in items if item["condition"] == "used"]
    # 二手卡必须能从接口层就区分出来：界面上「二手」角标依赖这个字段
    assert used, "目录里应当至少有一张二手卡，否则条件字段没被验证到"
    for item in items:
        assert item["condition"] in {"new", "used", "channel"}


async def test_parts_grouped_by_kind(client: httpx.AsyncClient) -> None:
    parts = (await client.get("/api/v1/catalog/parts")).json()
    assert set(parts) == {"cpus", "mobos", "rams", "psus", "storages", "coolings"}
    for kind, items in parts.items():
        assert items, f"{kind} 为空，组装台会缺一整类零件"
        assert all("priceCny" in item for item in items)


async def test_filters(client: httpx.AsyncClient) -> None:
    small = (await client.get("/api/v1/catalog/models", params={"size": 8})).json()
    assert small and all(item["paramsB"] <= 8 for item in small)

    big_vram = (await client.get("/api/v1/catalog/gpus", params={"min_vram": 48})).json()
    assert big_vram and all(item["vramGb"] >= 48 for item in big_vram)

    nv = (await client.get("/api/v1/catalog/gpus", params={"vendor": "NVIDIA"})).json()
    assert all(item["vendor"] == "NVIDIA" for item in nv)


async def test_etag_returns_304(client: httpx.AsyncClient) -> None:
    first = await client.get("/api/v1/catalog/models")
    etag = first.headers["etag"]
    assert etag

    second = await client.get("/api/v1/catalog/models", headers={"If-None-Match": etag})
    # 304 不带 body，但必须仍然带 ETag，否则下一次协商就断了
    assert second.status_code == 304
    assert second.headers["etag"] == etag
    assert second.content == b""


async def test_etag_differs_between_resources(client: httpx.AsyncClient) -> None:
    models = await client.get("/api/v1/catalog/models")
    gpus = await client.get("/api/v1/catalog/gpus")
    # 如果两个接口返回同一个 ETag，浏览器会把模型列表当成显卡列表缓存
    assert models.headers["etag"] != gpus.headers["etag"]


async def test_bundle_contains_everything(client: httpx.AsyncClient) -> None:
    body = (await client.get("/api/v1/catalog/all")).json()
    assert {"models", "gpus", "parts", "version"} <= set(body)
    assert body["version"]["counts"]["models"] == len(body["models"])
