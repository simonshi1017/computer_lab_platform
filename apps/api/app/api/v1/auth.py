"""登录相关端点。"""

from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, Query
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.deps import CurrentUser, SessionDep
from app.core.errors import not_configured, unauthorized
from app.models import AppUser
from app.schemas import (
    CodeRequest,
    CodeResponse,
    DevLoginRequest,
    LoginRequest,
    RefreshRequest,
    TokenPair,
    UserOut,
    WecomUrlOut,
)
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def user_out(user: AppUser) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        nickname=user.nickname,
        avatar=user.avatar,
        is_admin=bool(user.is_admin),
    )


def token_pair(user: AppUser) -> TokenPair:
    tokens = auth_service.issue_tokens(user)
    return TokenPair(
        access_token=tokens["accessToken"],
        refresh_token=tokens["refreshToken"],
        expires_in=tokens["expiresIn"],
        user=user_out(user),
    )


@router.post("/code", response_model=CodeResponse, summary="发送邮箱验证码")
async def send_code(payload: CodeRequest, session: SessionDep) -> CodeResponse:
    result = await auth_service.request_code(session, payload.email)
    return CodeResponse(**result)


@router.post("/login", response_model=TokenPair, summary="验证码登录")
async def login(payload: LoginRequest, session: SessionDep) -> TokenPair:
    user = await auth_service.login_with_code(session, payload.email, payload.code)
    return token_pair(user)


@router.post("/dev-login", response_model=TokenPair, summary="开发登录（仅 dev 环境）")
async def dev_login(payload: DevLoginRequest, session: SessionDep) -> TokenPair:
    """跳过验证码直接登录。

    只在 APP_ENV=dev 且 ALLOW_DEV_LOGIN=true 时开放。生产环境即使误开
    这个开关也进不来——环境判断写死在服务端，不是靠前端隐藏按钮。
    """
    if not settings.dev_login_enabled:
        raise not_configured("开发登录", "仅在 APP_ENV=dev 且 ALLOW_DEV_LOGIN=true 时可用")

    # dev 用户默认给管理员权限：单机开发时没必要再手动 update 一行 is_admin
    user = await auth_service.get_or_create_user(
        session, email=payload.email, nickname=payload.nickname
    )
    if not user.is_admin:
        user.is_admin = True
        await session.commit()
        await session.refresh(user)
    return token_pair(user)


@router.post("/refresh", response_model=TokenPair, summary="刷新令牌")
async def refresh(payload: RefreshRequest, session: SessionDep) -> TokenPair:
    user_id = auth_service.decode_refresh(payload.refresh_token)
    user = await session.get(AppUser, user_id)
    if user is None:
        raise unauthorized("账号不存在，请重新登录", code="user_not_found")
    return token_pair(user)


@router.get("/me", response_model=UserOut, summary="当前用户")
async def me(user: CurrentUser) -> UserOut:
    return user_out(user)


@router.get("/wecom/url", response_model=WecomUrlOut, summary="企业微信扫码地址")
async def wecom_url() -> WecomUrlOut:
    result = auth_service.wecom_authorize_url()
    return WecomUrlOut(url=result["url"], state=result["state"], configured=True)


@router.get("/wecom/callback", summary="企业微信扫码回调")
async def wecom_callback(
    session: SessionDep,
    code: str = Query(...),
    state: str = Query(default=""),
) -> RedirectResponse:
    """回调后 302 回前端，token 放在 query 上。

    取舍说明：更严格的做法是把 token 塞进 httpOnly cookie，但那样前端在
    开发环境（Vite 5173 → API 8080 跨站）要多配一堆东西。这里选择
    「302 带上 token → 前端立刻存进 localStorage → history.replaceState 清掉 URL」。
    风险是 token 可能留在浏览器历史里；内网工具 + 15 分钟有效期，可接受。
    """
    info = await auth_service.wecom_exchange_code(code)
    user = await auth_service.get_or_create_user(
        session,
        wecom_userid=info["userid"],
        nickname=info["nickname"],
        avatar=info["avatar"] or None,
    )
    pair = token_pair(user)
    query = urlencode(
        {
            "sso_access": pair.access_token,
            "sso_refresh": pair.refresh_token,
            "state": state,
        }
    )
    return RedirectResponse(f"{settings.frontend_url.rstrip('/')}/?{query}", status_code=302)
