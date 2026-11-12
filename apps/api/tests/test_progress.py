"""学习进度。"""

from __future__ import annotations

import httpx


async def test_progress_starts_empty(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    body = (await client.get("/api/v1/progress", headers=auth)).json()
    assert body["items"] == []
    assert body["doneCount"] == 0
    assert body["total"] == 5


async def test_upsert_and_repeat(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    first = await client.put(
        "/api/v1/progress/1",
        headers=auth,
        json={"status": "done", "output": {"pickedModel": "qwen25-7b"}},
    )
    assert first.status_code == 200
    assert first.json()["lessonId"] == 1

    # 重复上报 = 覆盖，不产生两条记录
    second = await client.put(
        "/api/v1/progress/1", headers=auth, json={"status": "done", "output": {"pickedModel": "qwen25-14b"}}
    )
    assert second.json()["output"]["pickedModel"] == "qwen25-14b"

    bundle = (await client.get("/api/v1/progress", headers=auth)).json()
    assert len(bundle["items"]) == 1
    assert bundle["doneCount"] == 1


async def test_out_of_range_lesson(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    response = await client.put("/api/v1/progress/9", headers=auth, json={"status": "done"})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_lesson"


async def test_requires_login(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/progress")).status_code == 401
