"""管理后台（sqladmin）。

为什么用 sqladmin 而不是自己写前端：M6 的 12 人日里，后台只值 1 人日。
维护模型/显卡/价格是个纯 CRUD 场景，自建页面要写表格、表单、鉴权、分页，
成本是 sqladmin 的十倍，收益是「好看一点」——而这个后台的使用者只有运维。

安全上只做两件事，但必须做：
1. 独立口令（不是用户体系的 JWT），关掉默认弱口令时会打日志警告；
2. 所有写操作记到操作日志（sqladmin 自带 audit 需要额外配置，这里先靠 DB 层）。
"""

from __future__ import annotations

import logging

from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request

from app.core.config import settings
from app.core.db import engine
from app.models import AppUser, Build, GpuSpec, ModelSpec, PartSpec, PriceSnapshot, ShareLink

log = logging.getLogger("clab.admin")


class AdminAuth(AuthenticationBackend):
    def __init__(self, secret_key: str) -> None:
        super().__init__(secret_key=secret_key)

    async def login(self, request: Request) -> bool:
        form = await request.form()
        username = str(form.get("username", ""))
        password = str(form.get("password", ""))
        # 用常数时间比较没有意义（这里没有可被时序攻击逐步猜出的长密钥），
        # 但口令长度与来源应该由运维控制，所以只做等值判断 + 失败计数留给网关。
        if username == settings.admin_username and password == settings.admin_password:
            request.session.update({"admin_user": username})
            return True
        log.warning("管理后台登录失败：username=%s ip=%s", username, request.client.host if request.client else "?")
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return bool(request.session.get("admin_user"))


class ModelSpecAdmin(ModelView, model=ModelSpec):
    name = "模型"
    name_plural = "模型规格"
    icon = "fa-solid fa-cube"
    column_list = [
        ModelSpec.id,
        ModelSpec.name,
        ModelSpec.vendor,
        ModelSpec.params_b,
        ModelSpec.layers,
        ModelSpec.hidden_dim,
        ModelSpec.ctx_max,
        ModelSpec.updated_at,
    ]
    column_searchable_list = [ModelSpec.id, ModelSpec.name, ModelSpec.vendor]
    column_sortable_list = [ModelSpec.params_b, ModelSpec.vendor]
    column_default_sort = (ModelSpec.params_b, False)
    # detail 里放着展示文案，允许直接改——运营改文案不该等一个发版
    form_columns = [
        ModelSpec.id,
        ModelSpec.name,
        ModelSpec.vendor,
        ModelSpec.arch,
        ModelSpec.params_b,
        ModelSpec.layers,
        ModelSpec.hidden_dim,
        ModelSpec.ctx_max,
        ModelSpec.license,
        ModelSpec.source,
        ModelSpec.detail,
        ModelSpec.updated_at,
    ]
    # 主键是业务 id，不允许编辑（改了会打断所有已保存配置的引用）
    form_args = {"id": {"render_kw": {"readonly": True}}}


class GpuSpecAdmin(ModelView, model=GpuSpec):
    name = "显卡"
    name_plural = "显卡规格"
    icon = "fa-solid fa-microchip"
    column_list = [
        GpuSpec.id,
        GpuSpec.name,
        GpuSpec.vendor,
        GpuSpec.gpu_class,
        GpuSpec.vram_gb,
        GpuSpec.bandwidth,
        GpuSpec.tdp_w,
        GpuSpec.price_cny,
        GpuSpec.condition,
    ]
    column_searchable_list = [GpuSpec.id, GpuSpec.name, GpuSpec.vendor]
    column_sortable_list = [GpuSpec.vram_gb, GpuSpec.price_cny, GpuSpec.tdp_w]
    column_default_sort = (GpuSpec.vram_gb, False)
    form_columns = [
        GpuSpec.id,
        GpuSpec.name,
        GpuSpec.vendor,
        GpuSpec.gpu_class,
        GpuSpec.vram_gb,
        GpuSpec.bandwidth,
        GpuSpec.tdp_w,
        GpuSpec.price_cny,
        GpuSpec.condition,
        GpuSpec.source,
        GpuSpec.detail,
    ]


class PartSpecAdmin(ModelView, model=PartSpec):
    name = "部件"
    name_plural = "部件（CPU/主板/内存/电源/硬盘/散热）"
    icon = "fa-solid fa-screwdriver-wrench"
    column_list = [PartSpec.kind, PartSpec.id, PartSpec.name, PartSpec.price_cny, PartSpec.updated_at]
    column_searchable_list = [PartSpec.id, PartSpec.name]
    column_sortable_list = [PartSpec.kind, PartSpec.price_cny]
    form_columns = [PartSpec.kind, PartSpec.id, PartSpec.name, PartSpec.price_cny, PartSpec.payload, PartSpec.updated_at]


class PriceSnapshotAdmin(ModelView, model=PriceSnapshot):
    name = "价格"
    name_plural = "价格快照"
    icon = "fa-solid fa-tags"
    column_list = [
        PriceSnapshot.gpu_id,
        PriceSnapshot.price_cny,
        PriceSnapshot.channel,
        PriceSnapshot.captured_at,
        PriceSnapshot.note,
    ]
    column_sortable_list = [PriceSnapshot.captured_at, PriceSnapshot.price_cny]
    column_default_sort = (PriceSnapshot.captured_at, True)
    form_columns = [
        PriceSnapshot.gpu_id,
        PriceSnapshot.price_cny,
        PriceSnapshot.channel,
        PriceSnapshot.note,
    ]


class BuildAdmin(ModelView, model=Build):
    name = "配置"
    name_plural = "用户配置"
    icon = "fa-solid fa-desktop"
    # payload 不上列表，只让它在详情里可查：一列 JSON 会把表格撑爆
    column_list = [
        Build.id,
        Build.user_id,
        Build.name,
        Build.model_name,
        Build.score,
        Build.grade,
        Build.price_cny,
        Build.updated_at,
    ]
    column_searchable_list = [Build.name, Build.model_name]
    column_sortable_list = [Build.updated_at, Build.score]
    column_default_sort = (Build.updated_at, True)
    can_create = False
    form_columns = [Build.name, Build.note]


class UserAdmin(ModelView, model=AppUser):
    name = "用户"
    name_plural = "用户"
    icon = "fa-solid fa-user"
    column_list = [
        AppUser.id,
        AppUser.email,
        AppUser.wecom_userid,
        AppUser.nickname,
        AppUser.is_admin,
        AppUser.last_login_at,
    ]
    column_searchable_list = [AppUser.email, AppUser.wecom_userid, AppUser.nickname]
    can_create = False
    can_delete = False


class ShareLinkAdmin(ModelView, model=ShareLink):
    name = "分享"
    name_plural = "分享链接"
    icon = "fa-solid fa-link"
    column_list = [
        ShareLink.token,
        ShareLink.build_id,
        ShareLink.views,
        ShareLink.created_at,
        ShareLink.expires_at,
    ]
    column_default_sort = (ShareLink.created_at, True)
    can_create = False
    can_edit = False


def setup_admin(app) -> Admin | None:
    if settings.admin_password in {"CHANGE_ME_IN_DEPLOY_ENV", "changeme", ""}:
        log.warning(
            "⚠️  管理后台仍在使用默认口令，请在生产环境设置 ADMIN_PASSWORD。"
            " 后台路径 /admin 未被关闭——因为内网首次部署需要一个入口，"
            "但上线检查清单里必须勾掉这一项。"
        )

    admin = Admin(
        app,
        engine,
        title="算力科普 · 数据后台",
        base_url="/admin",
        authentication_backend=AdminAuth(secret_key=settings.admin_session_secret),
    )
    for view in (
        ModelSpecAdmin,
        GpuSpecAdmin,
        PartSpecAdmin,
        PriceSnapshotAdmin,
        BuildAdmin,
        UserAdmin,
        ShareLinkAdmin,
    ):
        admin.add_view(view)
    return admin
