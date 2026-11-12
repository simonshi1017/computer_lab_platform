"""安全相关：JWT 签发校验、验证码哈希、分享 token 生成。

不引入 passlib：它只为密码哈希服务，而这套系统没有密码（登录靠企业微信
或邮箱验证码）。验证码用 HMAC-SHA256 加盐哈希，够用且没有额外依赖。
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt

from app.core.config import settings

TokenType = Literal["access", "refresh"]

# 分享 token 长度：22 字符 base64url ≈ 132 bit 熵，暴力枚举不现实，
# 同时短到能贴进聊天窗口不换行。
SHARE_TOKEN_BYTES = 16
SHARE_TOKEN_LEN = 22


class TokenError(Exception):
    """JWT 无效、过期或类型不符。"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_token(user_id: int, token_type: TokenType) -> str:
    if token_type == "access":
        expires = _now() + timedelta(minutes=settings.access_ttl_minutes)
    else:
        expires = _now() + timedelta(days=settings.refresh_ttl_days)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "typ": token_type,
        # jti 保证同一秒内签发的两个 token 也不相同。
        # 少了它，「刷新后 token 应该变化」这件事在快速连续请求下不成立。
        "jti": secrets.token_urlsafe(9),
        "iat": int(_now().timestamp()),
        "exp": int(expires.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expect: TokenType) -> int:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token 已过期") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("token 无效") from exc

    # typ 必须校验：否则拿 refresh 当 access 用，15 分钟的有效期形同虚设
    if payload.get("typ") != expect:
        raise TokenError("token 类型不匹配")
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.isdigit():
        raise TokenError("token 缺少用户标识")
    return int(sub)


def hash_code(email: str, code: str) -> str:
    """加盐哈希。盐里带 email，避免两个用户拿到同一个码时哈希相同可对比。"""
    secret = f"{settings.jwt_secret}:{email.lower()}".encode()
    return hmac.new(secret, code.encode(), hashlib.sha256).hexdigest()


def verify_code(email: str, code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_code(email, code), code_hash)


def generate_code() -> str:
    """6 位数字。用 secrets 而非 random：random 是可预测的伪随机。"""
    return f"{secrets.randbelow(1_000_000):06d}"


def new_share_token() -> str:
    return secrets.token_urlsafe(SHARE_TOKEN_BYTES)[:SHARE_TOKEN_LEN]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_aware(value: datetime) -> datetime:
    """SQLite 读出来的 datetime 不带时区，比较前统一按 UTC 处理。

    这是一个真实的坑：`datetime.now(timezone.utc) > naive_datetime` 在
    Python 里会直接抛 TypeError，而测试跑 SQLite、生产跑 PG，只有一边会踩到。
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
