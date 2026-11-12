"""埋点与看板。"""

from __future__ import annotations

import httpx

from app.services.analytics import clean_props, clean_ua


def test_clean_props_drops_nested_and_truncates() -> None:
    """嵌套结构不进 JSONB：埋点只要标量，一个深层对象能把行撑到几 KB。"""
    cleaned = clean_props(
        {
            "model": "qwen25-14b",
            "gpuCount": 2,
            "ok": True,
            "nested": {"a": {"b": 1}},
            "list": [1, 2, 3],
            "long": "x" * 500,
            "huge": 1.5,
        }
    )
    assert cleaned["model"] == "qwen25-14b"
    assert cleaned["gpuCount"] == 2
    assert cleaned["ok"] is True
    assert cleaned["huge"] == 1.5
    assert "nested" not in cleaned
    assert "list" not in cleaned
    assert len(cleaned["long"]) == 200


def test_clean_props_caps_key_count() -> None:
    cleaned = clean_props({f"k{i}": i for i in range(50)})
    assert len(cleaned) == 20


def test_clean_ua() -> None:
    assert clean_ua(None) is None
    assert len(clean_ua("M" * 300) or "") == 80


async def test_accepts_known_events(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/events",
        json={
            "sessionId": "sess-abcdefgh",
            "events": [
                {"name": "page_view", "path": "/models", "props": {"tab": "all"}},
                {"name": "recommend_view", "path": "/recommend"},
            ],
        },
    )
    assert response.status_code == 200
    assert response.json() == {"accepted": 2, "dropped": 0}


async def test_drops_unknown_events_without_error(client: httpx.AsyncClient) -> None:
    """未登记的事件静默丢弃：埋点不该让前端因为多打一个点就报错。"""
    response = await client.post(
        "/api/v1/events",
        json={
            "sessionId": "sess-abcdefgh",
            "events": [{"name": "made_up_event"}, {"name": "page_view"}],
        },
    )
    assert response.status_code == 200
    assert response.json() == {"accepted": 1, "dropped": 1}


async def test_works_without_login(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/events",
        json={"sessionId": "anon-session-1", "events": [{"name": "page_view"}]},
    )
    assert response.status_code == 200
    assert response.json()["accepted"] == 1


async def test_empty_batch_is_fine(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/events", json={"sessionId": "empty-batch-1", "events": []})
    assert response.status_code == 200
    assert response.json()["accepted"] == 0


async def test_stats_requires_admin(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/stats/overview")).status_code == 401


async def test_overview_shape(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    await client.post(
        "/api/v1/events",
        json={
            "sessionId": "stats-session-1",
            "events": [
                {"name": "recommend_view"},
                {"name": "recommend_view"},
                {"name": "recommend_apply"},
                {"name": "share_create"},
                {"name": "share_open"},
            ],
        },
    )

    response = await client.get("/api/v1/stats/overview", headers=auth, params={"days": 7})
    assert response.status_code == 200
    body = response.json()

    assert body["rangeDays"] == 7
    # 补齐 7 天，缺的日期补 0，折线图才不会断
    assert len(body["trend"]) == 7
    assert all({"date", "pv", "uv"} <= set(point) for point in body["trend"])

    recommend = body["recommend"]
    assert recommend["views"] >= 2
    assert recommend["applies"] >= 1
    assert recommend["applyRate"] is not None

    share = body["share"]
    assert share["created"] >= 1
    assert share["opens"] >= 1
    assert share["openPerShare"] is not None

    assert body["lessons"]["totalLessons"] == 5
    assert 0.0 <= (body["lessons"]["completionRate"] or 0) <= 1.0
    assert body["totals"]["pv"] >= 5


async def test_overview_rejects_silly_ranges(
    client: httpx.AsyncClient, auth: dict[str, str]
) -> None:
    assert (await client.get("/api/v1/stats/overview", headers=auth, params={"days": 0})).status_code == 422
    assert (await client.get("/api/v1/stats/overview", headers=auth, params={"days": 999})).status_code == 422
