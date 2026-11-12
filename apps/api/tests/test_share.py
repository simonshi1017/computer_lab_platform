"""分享链接。

验收标准就是 PRD 里那句话：**链能在无痕窗口打开**。
所以这里全部用「不带 Authorization 头」的请求验证。
"""

from __future__ import annotations

import httpx

from tests.test_builds import sample_evaluation, sample_state


async def _create_build(client: httpx.AsyncClient, auth: dict[str, str]) -> int:
    created = await client.post(
        "/api/v1/builds", headers=auth, json={"state": sample_state(), "evaluation": sample_evaluation()}
    )
    assert created.status_code == 201
    return created.json()["id"]


async def test_share_then_open_anonymously(
    client: httpx.AsyncClient, auth: dict[str, str]
) -> None:
    build_id = await _create_build(client, auth)

    shared = await client.post("/api/v1/share", headers=auth, json={"buildId": build_id})
    assert shared.status_code == 201
    token = shared.json()["token"]
    assert shared.json()["url"].endswith(f"/s/{token}")

    # 关键一步：不带任何凭据
    public = await client.get(f"/api/v1/share/{token}")
    assert public.status_code == 200
    body = public.json()
    assert body["build"]["id"] == build_id
    assert body["build"]["score"] == 82
    assert body["author"]
    # 不能泄露作者账号
    assert "email" not in body
    assert "userId" not in body["build"]


async def test_repeat_share_reuses_token(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    """同一套配置重复点分享，应该拿到同一个链接。

    否则用户会攒出一堆指向同一台机器的链接，自己都分不清发的是哪个。
    """
    build_id = await _create_build(client, auth)
    first = (await client.post("/api/v1/share", headers=auth, json={"buildId": build_id})).json()
    second = (await client.post("/api/v1/share", headers=auth, json={"buildId": build_id})).json()
    assert first["token"] == second["token"]


async def test_views_increment(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    build_id = await _create_build(client, auth)
    token = (await client.post("/api/v1/share", headers=auth, json={"buildId": build_id})).json()["token"]

    for expected in range(1, 4):
        body = (await client.get(f"/api/v1/share/{token}")).json()
        assert body["views"] == expected


async def test_expired_link_is_gone(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    build_id = await _create_build(client, auth)
    token = (
        await client.post("/api/v1/share", headers=auth, json={"buildId": build_id, "expiresInDays": 1})
    ).json()["token"]

    # 直接把过期时间调到过去，比 sleep 一天现实
    from datetime import timedelta

    from app.core.db import SessionLocal
    from app.core.security import utcnow
    from app.models import ShareLink

    async with SessionLocal() as session:
        link = await session.get(ShareLink, token)
        assert link is not None
        link.expires_at = utcnow() - timedelta(minutes=1)
        await session.commit()

    response = await client.get(f"/api/v1/share/{token}")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "share_expired"


async def test_unknown_token(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/share/doesnotexist123456")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "share_not_found"


async def test_cannot_share_someone_elses_build(
    client: httpx.AsyncClient, auth: dict[str, str]
) -> None:
    build_id = await _create_build(client, auth)
    other = await client.post("/api/v1/auth/dev-login", json={"email": "thief@clab.local"})
    other_auth = {"Authorization": f"Bearer {other.json()['accessToken']}"}

    response = await client.post("/api/v1/share", headers=other_auth, json={"buildId": build_id})
    assert response.status_code == 403


async def test_deleting_build_kills_share(
    client: httpx.AsyncClient, auth: dict[str, str]
) -> None:
    build_id = await _create_build(client, auth)
    token = (await client.post("/api/v1/share", headers=auth, json={"buildId": build_id})).json()["token"]
    assert (await client.get(f"/api/v1/share/{token}")).status_code == 200

    await client.delete(f"/api/v1/builds/{build_id}", headers=auth)
    assert (await client.get(f"/api/v1/share/{token}")).status_code == 404
