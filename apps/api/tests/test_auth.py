"""登录与鉴权。

这里的重点是**失败路径**：验证码错误、过期、超次数、拿 refresh 当 access 用。
成功路径只要一次，失败路径才是真正会被打的地方。
"""

from __future__ import annotations

import httpx
import jwt

from app.core.config import settings


async def test_dev_login_issues_token_pair(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/auth/dev-login", json={"email": "a@clab.local"})
    assert response.status_code == 200
    body = response.json()
    assert body["accessToken"] and body["refreshToken"]
    assert body["expiresIn"] == settings.access_ttl_minutes * 60
    assert body["user"]["email"] == "a@clab.local"

    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {body['accessToken']}"}
    )
    assert me.status_code == 200
    assert me.json()["id"] == body["user"]["id"]


async def test_me_requires_token(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthenticated"


async def test_bad_token_is_rejected(client: httpx.AsyncClient) -> None:
    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401


async def test_refresh_token_cannot_be_used_as_access(client: httpx.AsyncClient) -> None:
    """最容易漏的一个洞：refresh 能当 access 用，15 分钟有效期就白设了。"""
    tokens = (await client.post("/api/v1/auth/dev-login", json={})).json()
    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['refreshToken']}"}
    )
    assert response.status_code == 401


async def test_expired_token_is_rejected(client: httpx.AsyncClient) -> None:
    expired = jwt.encode(
        {"sub": "1", "typ": "access", "exp": 1_000_000_000},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


async def test_refresh_flow(client: httpx.AsyncClient) -> None:
    tokens = (await client.post("/api/v1/auth/dev-login", json={"email": "r@clab.local"})).json()
    response = await client.post(
        "/api/v1/auth/refresh", json={"refreshToken": tokens["refreshToken"]}
    )
    assert response.status_code == 200
    assert response.json()["accessToken"] != tokens["accessToken"]


async def test_email_code_login(client: httpx.AsyncClient) -> None:
    """dev 环境未配 SMTP 时，验证码直接回传，省掉翻日志这一步。"""
    sent = await client.post("/api/v1/auth/code", json={"email": "code@clab.local"})
    assert sent.status_code == 200
    code = sent.json()["debugCode"]
    assert code and len(code) == 6

    ok = await client.post(
        "/api/v1/auth/login", json={"email": "code@clab.local", "code": code}
    )
    assert ok.status_code == 200
    assert ok.json()["user"]["email"] == "code@clab.local"

    # 同一个码不能用第二次
    again = await client.post(
        "/api/v1/auth/login", json={"email": "code@clab.local", "code": code}
    )
    assert again.status_code == 401


async def test_wrong_code_is_counted(client: httpx.AsyncClient) -> None:
    await client.post("/api/v1/auth/code", json={"email": "wrong@clab.local"})
    for attempt in range(4):
        response = await client.post(
            "/api/v1/auth/login", json={"email": "wrong@clab.local", "code": "000000"}
        )
        assert response.status_code == 401
        assert "还可尝试" in response.json()["detail"]["message"]

    # 第 5 次之后锁定，不再提示剩余次数
    locked = await client.post(
        "/api/v1/auth/login", json={"email": "wrong@clab.local", "code": "000000"}
    )
    assert "尝试次数过多" in locked.json()["detail"]["message"]


async def test_code_resend_is_throttled(client: httpx.AsyncClient) -> None:
    email = "throttle@clab.local"
    first = await client.post("/api/v1/auth/code", json={"email": email})
    assert first.status_code == 200
    second = await client.post("/api/v1/auth/code", json={"email": email})
    assert second.status_code == 400
    assert second.json()["detail"]["code"] == "too_many_requests"


async def test_wecom_reports_not_configured(client: httpx.AsyncClient) -> None:
    """没配企业微信时必须是 501 + 明确原因，而不是 500。"""
    response = await client.get("/api/v1/auth/wecom/url")
    assert response.status_code == 501
    body = response.json()["detail"]
    assert body["code"] == "not_configured"
    assert "WECOM_CORP_ID" in body["message"]
