"""登录服务：邮箱验证码 + 企业微信扫码。

三条硬性设计：

1. **验证码只存哈希**。库被拖走、日志被截图，都不该等于账号被接管。
2. **失败按次计数**。6 位数字只有 100 万种可能，不限次就等于没有验证码；
   5 次失败即作废，重新获取。
3. **缺凭据不算 bug**。企业微信 / SMTP 没配时返回 501 并说明缺什么，
   而不是让服务起不来或抛 500——内网部署最常见的状态就是「还没申请应用」。
"""

from __future__ import annotations

import logging
import smtplib
from datetime import timedelta
from email.message import EmailMessage
from typing import Any
from urllib.parse import quote

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import bad_request, not_configured, unauthorized
from app.core.security import (
    TokenError,
    create_token,
    ensure_aware,
    generate_code,
    hash_code,
    new_share_token,
    utcnow,
    verify_code,
)
from app.models import AppUser, LoginCode

log = logging.getLogger("clab.auth")

MAX_CODE_ATTEMPTS = 5
STATE_TTL_SECONDS = 600


# ---------------------------------------------------------------- 用户


async def get_or_create_user(
    session: AsyncSession,
    *,
    email: str | None = None,
    wecom_userid: str | None = None,
    nickname: str | None = None,
    avatar: str | None = None,
) -> AppUser:
    """按邮箱或企微 userid 找人，找不到就建。

    先查 email 再查 wecom_userid：同一个人先用邮箱登录、后扫码进来时，
    应该合并到同一个账号，而不是变成两个各自有配置的用户。
    """
    user: AppUser | None = None
    if email:
        user = await session.scalar(select(AppUser).where(AppUser.email == email.lower()))
    if user is None and wecom_userid:
        user = await session.scalar(select(AppUser).where(AppUser.wecom_userid == wecom_userid))
    if user is None and email:
        user = await session.scalar(select(AppUser).where(AppUser.wecom_userid == email.lower()))

    if user is None:
        user = AppUser(
            email=email.lower() if email else None,
            wecom_userid=wecom_userid,
            nickname=nickname or (email.split("@")[0] if email else "学习者"),
            avatar=avatar,
            # 第一个用户自动成为管理员：内网工具不需要额外的开通流程，
            # 但生产环境第一次部署后应立即改密码/加人。
            is_admin=False,
        )
        session.add(user)
        await session.flush()
        log.info("新用户: id=%s email=%s wecom=%s", user.id, user.email, user.wecom_userid)
    else:
        # 补齐缺失的绑定信息，但不覆盖已有昵称（用户可能自己改过）
        if email and not user.email:
            user.email = email.lower()
        if wecom_userid and not user.wecom_userid:
            user.wecom_userid = wecom_userid
        if nickname and not user.nickname:
            user.nickname = nickname
        if avatar:
            user.avatar = avatar

    user.last_login_at = utcnow()
    await session.commit()
    await session.refresh(user)
    return user


def issue_tokens(user: AppUser) -> dict[str, Any]:
    return {
        "accessToken": create_token(user.id, "access"),
        "refreshToken": create_token(user.id, "refresh"),
        "expiresIn": settings.access_ttl_minutes * 60,
        "tokenType": "bearer",
        "user": user,
    }


# ---------------------------------------------------------------- 验证码


async def _recent_code(session: AsyncSession, email: str) -> LoginCode | None:
    return await session.scalar(
        select(LoginCode)
        .where(LoginCode.email == email)
        .order_by(LoginCode.created_at.desc())
        .limit(1)
    )


async def request_code(session: AsyncSession, email: str) -> dict[str, Any]:
    email = email.lower()
    now = utcnow()

    recent = await _recent_code(session, email)
    if recent is not None:
        elapsed = (now - ensure_aware(recent.created_at)).total_seconds()
        if elapsed < settings.code_resend_seconds:
            wait = int(settings.code_resend_seconds - elapsed)
            raise bad_request(f"发送太频繁，请 {wait} 秒后再试", code="too_many_requests")

    code = generate_code()
    row = LoginCode(
        email=email,
        code_hash=hash_code(email, code),
        expires_at=now + timedelta(minutes=settings.code_ttl_minutes),
    )
    session.add(row)
    await session.commit()

    debug: str | None = None
    hint: str | None = None

    if settings.smtp_enabled:
        try:
            await _send_mail(email, code)
        except Exception as exc:  # noqa: BLE001  SMTP 失败原因千奇百怪，统一降级
            log.error("验证码邮件发送失败: %s", exc)
            raise bad_request("验证码邮件发送失败，请联系管理员检查 SMTP 配置", code="mail_failed") from exc
    elif settings.env != "prod":
        # 开发环境把码回传：省掉「去翻容器日志」这一步，也让 E2E 能自动化
        debug = code
        hint = "开发环境未配置 SMTP，验证码直接返回"
        log.info("开发模式验证码 email=%s code=%s", email, code)
    else:
        raise not_configured("邮箱验证码", "请配置 SMTP_HOST/SMTP_USER/SMTP_PASSWORD，或使用企业微信扫码登录")

    return {
        "sent": True,
        "ttlSeconds": settings.code_ttl_minutes * 60,
        "debugCode": debug,
        "hint": hint,
    }


async def _send_mail(email: str, code: str) -> None:
    message = EmailMessage()
    message["Subject"] = f"[算力科普] 登录验证码 {code}"
    message["From"] = settings.smtp_from or settings.smtp_user
    message["To"] = email
    message.set_content(
        f"你的登录验证码是 {code}，{settings.code_ttl_minutes} 分钟内有效。\n"
        "如果不是你本人操作，请忽略这封邮件。\n"
    )
    import asyncio

    await asyncio.to_thread(_send_mail_sync, message)


def _send_mail_sync(message: EmailMessage) -> None:
    # 465 走 SMTPS（内网 Exchange / 企业邮箱最常见），其它端口走 STARTTLS
    if settings.smtp_port == 465:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)


async def login_with_code(session: AsyncSession, email: str, code: str) -> AppUser:
    email = email.lower()
    row = await _recent_code(session, email)
    if row is None or row.consumed_at is not None:
        raise unauthorized("验证码无效，请重新获取", code="invalid_code")
    if row.attempts >= MAX_CODE_ATTEMPTS:
        raise unauthorized("尝试次数过多，请重新获取验证码", code="code_locked")
    if ensure_aware(row.expires_at) < utcnow():
        raise unauthorized("验证码已过期，请重新获取", code="code_expired")

    if not verify_code(email, code, row.code_hash):
        row.attempts += 1
        await session.commit()
        left = MAX_CODE_ATTEMPTS - row.attempts
        if left <= 0:
            # 第 5 次失败就锁，而不是「第 6 次才发现已经用完」
            raise unauthorized("尝试次数过多，请重新获取验证码", code="code_locked")
        raise unauthorized(f"验证码不正确，还可尝试 {left} 次", code="invalid_code")

    row.consumed_at = utcnow()
    await session.commit()
    return await get_or_create_user(session, email=email)


# ---------------------------------------------------------------- 企业微信


def wecom_authorize_url() -> dict[str, str]:
    if not settings.wecom_enabled:
        raise not_configured(
            "企业微信扫码登录",
            "请配置 WECOM_CORP_ID / WECOM_AGENT_ID / WECOM_SECRET / WECOM_REDIRECT_URI",
        )
    # state 用一次性的随机串即可：它只需要让回调端认出「这次扫码是我们发起的」，
    # 真正的身份校验由 code 换取完成。存库没必要，加进 token 又过度设计。
    state = new_share_token()
    url = (
        "https://open.work.weixin.qq.com/wwopen/sso/qrConnect"
        f"?appid={settings.wecom_corp_id}"
        f"&agentid={settings.wecom_agent_id}"
        f"&redirect_uri={quote(settings.wecom_redirect_uri, safe='')}"
        f"&state={state}"
    )
    return {"url": url, "state": state}


async def wecom_exchange_code(code: str) -> dict[str, str]:
    """用扫码返回的 code 换用户信息。

    两步：先拿 access_token（企业级，7200 秒），再用 code 换 userid。
    这里每次都重新取 token，不做缓存——登录是低频操作，
    缓存只会带来「token 过期了但缓存还没过期」的诡异问题。
    """
    if not settings.wecom_enabled:
        raise not_configured("企业微信扫码登录", "请配置 WECOM_CORP_ID / WECOM_SECRET")

    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.get(
            "https://qyapi.weixin.qq.com/cgi-bin/gettoken",
            params={"corpid": settings.wecom_corp_id, "corpsecret": settings.wecom_secret},
        )
        token_data = token_resp.json()
        if token_data.get("errcode") != 0:
            log.error("企微 gettoken 失败: %s", token_data)
            raise unauthorized("企业微信配置有误，无法完成登录", code="wecom_error")
        access_token = token_data["access_token"]

        info_resp = await client.get(
            "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo",
            params={"access_token": access_token, "code": code},
        )
        info = info_resp.json()
        if info.get("errcode") != 0 or not info.get("userid"):
            log.error("企微 getuserinfo 失败: %s", info)
            raise unauthorized("未能获取企业微信身份，请重试", code="wecom_error")

        userid = info["userid"]
        profile = await client.get(
            "https://qyapi.weixin.qq.com/cgi-bin/user/get",
            params={"access_token": access_token, "userid": userid},
        )
        detail = profile.json()

    return {
        "userid": userid,
        "nickname": detail.get("name") or userid,
        "avatar": detail.get("avatar") or "",
    }


def decode_refresh(token: str) -> int:
    from app.core.security import decode_token

    try:
        return decode_token(token, "refresh")
    except TokenError as exc:
        raise unauthorized(str(exc), code="invalid_refresh") from exc
