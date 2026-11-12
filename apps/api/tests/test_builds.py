"""配置的增删改查。"""

from __future__ import annotations

from typing import Any

import httpx
import pytest


def sample_state(**overrides: Any) -> dict[str, Any]:
    state: dict[str, Any] = {
        "build": {
            "gpuIds": ["rtx4090", "rtx4090"],
            "cpuId": "r5-7600",
            "moboId": "b650",
            "ramIds": ["ram32"],
            "psuId": "psu1000",
            "storageIds": ["ssd1t"],
            "coolingId": "aio240",
        },
        "modelId": "qwen25-14b",
        "quant": "int4",
        "ctx": 8192,
        "budget": 30000,
    }
    state.update(overrides)
    return state


def sample_evaluation(score: int = 82) -> dict[str, Any]:
    return {
        "empty": False,
        "score": score,
        "grade": "A",
        "dimensions": [],
        "risks": [],
        "suggestions": [],
        "stats": {"priceCny": 26800, "vramGb": 48, "powerW": 900},
        "tps": 41.5,
    }


async def test_create_and_list(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    created = await client.post(
        "/api/v1/builds",
        headers=auth,
        json={"name": "双 4090 跑 14B", "state": sample_state(), "evaluation": sample_evaluation()},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "双 4090 跑 14B"
    assert body["score"] == 82
    assert body["grade"] == "A"
    assert body["priceCny"] == 26800
    assert body["modelId"] == "qwen25-14b"
    assert body["state"]["build"]["gpuIds"] == ["rtx4090", "rtx4090"]

    listed = await client.get("/api/v1/builds", headers=auth)
    assert listed.status_code == 200
    ids = [item["id"] for item in listed.json()]
    assert body["id"] in ids


async def test_default_name_when_omitted(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    created = await client.post(
        "/api/v1/builds", headers=auth, json={"state": sample_state(modelId="qwen25-7b")}
    )
    assert created.status_code == 201
    body = created.json()
    # 前端不传名字时也要有个能认出来的名字，不能是空串或 "未命名"
    assert "通义千问" in body["name"]
    # 列表和分享页显示的是中文名，不是 qwen25-7b 这种内部 id
    assert body["modelName"] == "通义千问 2.5 · 7B"


async def test_detail_patch_delete(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    created = await client.post("/api/v1/builds", headers=auth, json={"state": sample_state()})
    build_id = created.json()["id"]

    detail = await client.get(f"/api/v1/builds/{build_id}", headers=auth)
    assert detail.status_code == 200
    assert detail.json()["id"] == build_id

    patched = await client.patch(
        f"/api/v1/builds/{build_id}", headers=auth, json={"name": "改了名字"}
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "改了名字"

    # 换配置时评分快照要跟着更新，否则列表里显示的是旧分数
    patched2 = await client.patch(
        f"/api/v1/builds/{build_id}",
        headers=auth,
        json={"state": sample_state(modelId="qwen25-7b"), "evaluation": sample_evaluation(55)},
    )
    assert patched2.json()["score"] == 55
    assert patched2.json()["modelId"] == "qwen25-7b"

    deleted = await client.delete(f"/api/v1/builds/{build_id}", headers=auth)
    assert deleted.status_code == 204
    assert (await client.get(f"/api/v1/builds/{build_id}", headers=auth)).status_code == 404


async def test_requires_login(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/builds")).status_code == 401
    assert (
        await client.post("/api/v1/builds", json={"state": sample_state()})
    ).status_code == 401


async def test_other_users_build_is_forbidden(
    client: httpx.AsyncClient, auth: dict[str, str]
) -> None:
    """改 URL 里的 id 不能看到别人的机器配置。"""
    created = await client.post("/api/v1/builds", headers=auth, json={"state": sample_state()})
    build_id = created.json()["id"]

    other = await client.post("/api/v1/auth/dev-login", json={"email": "other@clab.local"})
    other_auth = {"Authorization": f"Bearer {other.json()['accessToken']}"}

    assert (await client.get(f"/api/v1/builds/{build_id}", headers=other_auth)).status_code == 403
    assert (await client.delete(f"/api/v1/builds/{build_id}", headers=other_auth)).status_code == 403
    # 列表里更不该出现
    listed = await client.get("/api/v1/builds", headers=other_auth)
    assert build_id not in [item["id"] for item in listed.json()]


@pytest.mark.parametrize(
    "patch",
    [
        {"gpuIds": ["a", "b", "c", "d", "e"]},  # 超过 4 个 PCIe 槽
        {"ramIds": ["1", "2", "3", "4", "5"]},
        {"storageIds": ["1", "2", "3"]},
    ],
)
async def test_physical_limits_enforced(
    client: httpx.AsyncClient, auth: dict[str, str], patch: dict
) -> None:
    """界面上的限制可以被绕过（改 localStorage / 直接调接口），后端必须自己拦。"""
    state = sample_state()
    state["build"].update(patch)
    response = await client.post("/api/v1/builds", headers=auth, json={"state": state})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "validation_error"


async def test_custom_spec_survives_roundtrip(
    client: httpx.AsyncClient, auth: dict[str, str]
) -> None:
    """从推荐页带来的自定义模型不在目录里，必须原样存回去，否则再打开就是空配置。"""
    state = sample_state(
        modelId="custom",
        customSpec={"id": "custom", "name": "Qwen3.8-27B", "paramsB": 27, "layers": 64, "hiddenDim": 5120, "ctxMax": 32768},
    )
    created = await client.post("/api/v1/builds", headers=auth, json={"state": state})
    assert created.status_code == 201

    fetched = await client.get(f"/api/v1/builds/{created.json()['id']}", headers=auth)
    spec = fetched.json()["state"]["customSpec"]
    assert spec["paramsB"] == 27
    assert spec["ctxMax"] == 32768


async def test_unknown_extra_fields_are_kept(
    client: httpx.AsyncClient, auth: dict[str, str]
) -> None:
    """前端以后加了 fanCurve 这类字段，后端不该把它丢掉，也不该因此 422。"""
    state = sample_state()
    state["fanCurve"] = [30, 50, 80]
    created = await client.post("/api/v1/builds", headers=auth, json={"state": state})
    assert created.status_code == 201
    fetched = await client.get(f"/api/v1/builds/{created.json()['id']}", headers=auth)
    assert fetched.json()["state"]["fanCurve"] == [30, 50, 80]
