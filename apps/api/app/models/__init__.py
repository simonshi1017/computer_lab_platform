"""所有 ORM 模型的统一出口。

`Base.metadata.create_all` 与 Alembic 的 autogenerate 都依赖「模型已被导入」，
所以这里必须显式 re-export。
"""

from app.core.db import Base
from app.models.analytics import AnalyticsEvent
from app.models.build import Build, ShareLink
from app.models.catalog import GpuSpec, ModelSpec, PartSpec, PriceSnapshot
from app.models.user import AppUser, LessonProgress, LoginCode

__all__ = [
    "AnalyticsEvent",
    "AppUser",
    "Base",
    "Build",
    "GpuSpec",
    "LessonProgress",
    "LoginCode",
    "ModelSpec",
    "PartSpec",
    "PriceSnapshot",
    "ShareLink",
]
