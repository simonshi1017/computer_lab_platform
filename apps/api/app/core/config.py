"""配置。

原则：**所有外部依赖都必须有「没配也能跑」的降级路径**。
内网部署时最怕的是「少一个环境变量就整个服务起不来」——所以企业微信、
SMTP、管理后台口令都允许缺省，缺省时对应功能关闭而不是崩溃。
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

Env = Literal["dev", "prod", "test"]


def _fix_pg_url(url: str) -> str:
    """把常见的 postgres:// 写法归一成 SQLAlchemy + psycopg3 的驱动形式。

    docker-compose 里 DATABASE_URL 常被写成 postgres://user:pass@db:5432/x，
    SQLAlchemy 2 不再认这个前缀，直接抛 NoSuchModuleError。在入口处修一次，
    比在部署文档里提醒十次有用。
    """
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- 基础 ----
    env: Env = Field(default="dev", alias="APP_ENV")
    app_name: str = "clab-api"
    log_level: str = "INFO"
    # 前端构建产物里调用的是同域 /api，所以默认前缀保持 /api/v1
    api_prefix: str = "/api/v1"

    # ---- 数据库 ----
    database_url: str = "postgresql+psycopg://clab:clab@localhost:5432/clab"
    db_echo: bool = False
    # 启动时自动建表 + seed。生产建议关掉，改用 alembic upgrade head。
    auto_migrate: bool = True

    # ---- 鉴权 ----
    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_ttl_minutes: int = 15
    refresh_ttl_days: int = 7

    # 企业微信扫码登录。三项缺一即视为未开通，接口返回 501 而不是 500。
    wecom_corp_id: str = ""
    wecom_agent_id: str = ""
    wecom_secret: str = ""
    wecom_redirect_uri: str = ""

    # 邮箱验证码。没配 SMTP 时验证码只写日志 + 在 dev 下回传给前端。
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    code_ttl_minutes: int = 10
    code_resend_seconds: int = 60

    # 开发登录：仅 dev 环境且显式开启。生产环境即使打开也会被 env 判断拦住。
    allow_dev_login: bool = True

    # ---- 管理后台 ----
    admin_username: str = "admin"
    # 占位值：真实口令通过 deploy/.env 注入，仓库内不保存任何可用凭据
    admin_password: str = "CHANGE_ME_IN_DEPLOY_ENV"
    admin_session_secret: str = "dev-session-secret-change-me"

    # ---- 跨域 ----
    # 生产是同域反代，不需要 CORS；开发时 Vite 在 5173，需要显式放行。
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # 企业微信扫码成功后的落地页（前端地址）。回调接口 302 到这里并带上 token。
    frontend_url: str = "http://localhost:8080"

    # ---- 数据 ----
    # packages/data 构建时导出的目录快照。多个候选路径按顺序探测，
    # 兼容「本地 pnpm build 后跑」和「容器里只拷了 dist」两种形态。
    catalog_path: str = ""
    # 关卡总数。真正的定义在 packages/data/src/lessons.ts，M6 只做进度，
    # 所以留一个可覆盖的常量而不是把 lessons 也搬进数据库。
    lesson_total: int = 5
    # 价格超过多少天没更新就标为陈旧（界面上标黄 + 每日告警）
    price_stale_days: int = 45

    # ---- 定时任务 ----
    scheduler_enabled: bool = True
    # 每日检查价格新鲜度。cron 五段式，默认 09:00
    price_check_cron: str = "0 9 * * *"
    # 企业微信群机器人 webhook；留空则只写日志
    alert_webhook: str = ""

    # ---- 埋点 ----
    # 单个会话每分钟最多上报多少条，防脚本刷爆表
    event_rate_limit: int = 120

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def wecom_enabled(self) -> bool:
        return bool(self.wecom_corp_id and self.wecom_agent_id and self.wecom_secret)

    @property
    def smtp_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

    @property
    def dev_login_enabled(self) -> bool:
        """开发登录开关。

        判据是 `env != "prod"` 而不是 `env == "dev"`：测试环境（test）同样需要
        跳过验证码，否则每条用例都要先拿到邮件。**生产环境关死**这一点不变。
        """
        return self.env != "prod" and self.allow_dev_login

    def resolve_catalog_path(self) -> str:
        """找到 catalog.json。

        容器里是 /app/catalog.json（Dockerfile 显式 COPY 到根目录），
        monorepo 本地是 packages/data/dist/catalog.json。
        两者都不在时返回空串，由 seed 决定「跳过」还是「报错」。
        """
        if self.catalog_path and os.path.exists(self.catalog_path):
            return self.catalog_path
        here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        candidates = [
            os.path.join(here, "catalog.json"),
            os.path.join(here, "..", "..", "packages", "data", "dist", "catalog.json"),
            os.path.join(os.getcwd(), "catalog.json"),
            os.path.join(os.getcwd(), "packages", "data", "dist", "catalog.json"),
        ]
        for path in candidates:
            if os.path.exists(path):
                return os.path.abspath(path)
        return ""

    @property
    def database_url_normalized(self) -> str:
        return _fix_pg_url(self.database_url)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def setup_logging(level: str) -> None:
    """结构化一点的日志：时间 | 级别 | 模块 | 消息。

    不上 JSON 是因为这套东西的读者主要是「上服务器 tail 日志的人」，
    一行一个事件比一坨 JSON 好扫。
    """
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-7s | %(name)-18s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


settings = get_settings()
