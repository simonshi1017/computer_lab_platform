"""Alembic 环境。

用**同步** psycopg3 连接跑迁移：迁移是一次性、串行、要有确定顺序的操作，
上异步只会让它更难调试。应用运行时走异步连接池，两条通道互不影响。
"""

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# 让 `alembic` 在 apps/api 下执行时能 import 到 app 包
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.core.db import Base  # noqa: E402
from app import models  # noqa: E402,F401  导入以注册所有表

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 迁移永远连同步驱动：把 +psycopg 的 URL 直接交给 create_engine 即可
config.set_main_option("sqlalchemy.url", settings.database_url_normalized)

target_metadata = Base.metadata


def _include_object(obj, name, type_, reflected, compare_to) -> bool:
    """只管理自己定义的表。

    PG 里可能还有别人建的表（同一实例复用时很常见），autogenerate 不该
    去 DROP 它们。这一行过滤能挡掉一次「迁移把隔壁系统的表删了」的事故。
    """
    if type_ == "table":
        return name in target_metadata.tables
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=_include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
