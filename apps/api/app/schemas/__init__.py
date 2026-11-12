"""出入参模型。

约定：
- Python 侧字段用 snake_case，序列化时统一转 camelCase（前端零转换成本）；
- **build 的 payload 用宽松校验**：前端把整份 BuilderState 传上来，
  字段会随界面迭代增加。后端只校验它真正要用的字段，其余原样存进 JSONB，
  否则每加一个前端字段都要改后端、发版、迁移，接口就成了迭代瓶颈。
- 响应对象一律由路由/service 显式构造，不依赖 ORM 属性自动映射：
  `build.state` 在库里叫 `payload`，硬套别名只会让两边都别扭。
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

Quant = Literal["fp16", "int8", "int4"]

# 刻意不用 pydantic 的 EmailStr（底层 email-validator）：它会拒绝 `.local`、
# `.internal` 这类保留域名和没有 MX 记录的地址，而内网 SMTP 恰恰天天在用
# `zhangsan@company.local`。校验太严的结果是「自己人永远登录不上」。
# 这里只挡明显不是邮箱的输入，真正的可达性由「验证码能收到」来证明。
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(value: str) -> str:
    value = value.strip()
    if len(value) > 254 or not _EMAIL_RE.match(value):
        raise ValueError("邮箱格式不正确，例如 name@company.com")
    # 统一小写：A@x.com 与 a@x.com 必须是同一个账号
    return value.lower()


EmailLike = Annotated[str, AfterValidator(_normalize_email)]

# pydantic 2.14 会对「Optional 字段 + Field()」这种写法报
# UnsupportedFieldAttributeWarning（说 alias 不生效）。这是误报：
# 已验证 ShareOut/BuildSummaryOut 的 model_dump(by_alias=True) 确实是 camelCase。
# 不静音的话，服务每次启动都会刷一屏没有信息量的告警，真问题反而被淹没。
import warnings as _warnings  # noqa: E402

from pydantic.warnings import UnsupportedFieldAttributeWarning as _UnsupportedAttr  # noqa: E402

_warnings.filterwarnings("ignore", category=_UnsupportedAttr)


def to_camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.capitalize() for part in rest)


class CamelModel(BaseModel):
    """对外契约的基类：snake_case 定义，camelCase 输出。"""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        extra="ignore",
    )


# ---------------------------------------------------------------- 鉴权


class CodeRequest(CamelModel):
    email: EmailLike


class CodeResponse(CamelModel):
    sent: bool
    ttl_seconds: int
    # 仅在 dev 且未配 SMTP 时返回：省掉「去翻容器日志」这一步
    debug_code: str | None = None
    hint: str | None = None


class LoginRequest(CamelModel):
    email: EmailLike
    code: str = Field(min_length=4, max_length=8)


class DevLoginRequest(CamelModel):
    email: EmailLike = "dev@clab.local"
    nickname: str | None = "开发者"


class UserOut(CamelModel):
    id: int
    email: str | None = None
    nickname: str | None = None
    avatar: str | None = None
    is_admin: bool = False


class TokenPair(CamelModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(CamelModel):
    refresh_token: str


class WecomUrlOut(CamelModel):
    url: str
    state: str
    configured: bool = True


# ---------------------------------------------------------------- 配置


class BuildPayload(CamelModel):
    """一套配置的物理构成。

    显卡上限 4、内存 4、硬盘 2 是机箱的物理约束，后端也要拦一道：
    界面上的限制可以被绕过（改 localStorage / 直接调接口），
    存进库里的数据必须自洽。
    """

    gpu_ids: list[str] = Field(default_factory=list, max_length=4)
    cpu_id: str | None = None
    mobo_id: str | None = None
    ram_ids: list[str] = Field(default_factory=list, max_length=4)
    psu_id: str | None = None
    storage_ids: list[str] = Field(default_factory=list, max_length=2)
    cooling_id: str | None = None

    @field_validator("gpu_ids", "ram_ids", "storage_ids")
    @classmethod
    def _clean(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if item and item.strip()]


class CustomSpec(CamelModel):
    """从推荐页带过来的自定义尺寸模型。不落 model_spec 表，只存在 payload 里。"""

    id: str = "custom"
    name: str
    params_b: float = Field(gt=0, le=2000)
    layers: int = Field(gt=0, le=200)
    hidden_dim: int = Field(gt=0, le=65536)
    ctx_max: int = Field(gt=0, le=4_000_000)


class BuildState(CamelModel):
    """前端 BuilderState 的服务端镜像。

    extra="allow" 是刻意的：后端只校验它用得上的字段，其余（比如以后的
    fanCurve、备注笔记）原样存进 JSONB。否则前端每加一个字段都要改后端。
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True, alias_generator=to_camel)

    build: BuildPayload
    model_id: str = Field(min_length=1, max_length=64)
    custom_spec: CustomSpec | None = None
    quant: Quant = "int4"
    ctx: int = Field(default=8192, gt=0, le=4_000_000)
    budget: int = Field(default=20000, ge=0, le=10_000_000)


class BuildCreate(CamelModel):
    name: str | None = Field(default=None, max_length=120)
    state: BuildState
    # 前端算好的评估结果。后端不重算——评分与推荐是纯函数，放前端才是 0 延迟；
    # 这里存快照，落库后不再变。
    evaluation: dict[str, Any] | None = None
    note: str | None = Field(default=None, max_length=2000)


class BuildUpdate(CamelModel):
    name: str | None = Field(default=None, max_length=120)
    state: BuildState | None = None
    evaluation: dict[str, Any] | None = None
    note: str | None = Field(default=None, max_length=2000)
    is_public: bool | None = None


class BuildSummaryOut(CamelModel):
    id: int
    name: str
    model_id: str
    model_name: str
    score: int
    grade: str
    price_cny: int
    created_at: datetime
    updated_at: datetime


class BuildOut(BuildSummaryOut):
    state: dict[str, Any]
    evaluation: dict[str, Any] | None = None
    note: str | None = None


class ShareCreate(CamelModel):
    build_id: int
    # 不填表示永久有效
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class ShareOut(CamelModel):
    token: str
    url: str
    expires_at: datetime | None = None
    views: int = 0


class SharePayloadOut(CamelModel):
    """落地页数据。

    不含 user_id / email——分享出去的东西不该顺带泄露作者账号。
    """

    token: str
    build: BuildOut
    author: str | None = None
    views: int
    created_at: datetime
    expires_at: datetime | None = None


# ---------------------------------------------------------------- 进度


class ProgressIn(CamelModel):
    status: Literal["done", "current"] = "done"
    output: dict[str, Any] | None = None


class ProgressOut(CamelModel):
    lesson_id: int
    status: str
    output: dict[str, Any] | None = None
    updated_at: datetime


class ProgressBundleOut(CamelModel):
    items: list[ProgressOut]
    done_count: int
    total: int
