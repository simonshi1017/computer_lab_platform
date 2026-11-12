"""v1 路由汇总。"""

from fastapi import APIRouter

from app.api.v1 import analytics, auth, builds, catalog, health, prices, progress, share

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(catalog.router)
api_router.include_router(builds.router)
api_router.include_router(share.router)
api_router.include_router(progress.router)
api_router.include_router(prices.router)
api_router.include_router(analytics.router)
