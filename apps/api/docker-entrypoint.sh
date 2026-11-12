#!/bin/sh
# 容器入口。
#
# 顺序很重要：
#   1. alembic upgrade head —— 表结构由迁移管理，可回溯、可复现
#   2. uvicorn —— 起来之后才可能接收流量
#
# 迁移失败时**不直接退出**：第一次部署时数据库里可能已经有表（早期用
# create_all 起的），此时 upgrade 会因为「表已存在」失败。这种情况下
# 打一条醒目的日志继续启动，由应用层的 create_all 兜底 —— 一个能用的旧
# 表结构，比一个 502 的站点好。
set -e

echo "[entrypoint] 执行数据库迁移…"
if alembic upgrade head; then
  echo "[entrypoint] 迁移完成"
  export AUTO_MIGRATE=false
else
  echo "[entrypoint] ⚠️  迁移失败：数据库可能已有表结构（早期 create_all 建的）。"
  echo "[entrypoint] ⚠️  回退到 create_all 兜底。请尽快人工核对 alembic_version 与表结构。"
  export AUTO_MIGRATE=true
fi

exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers "${UVICORN_WORKERS:-1}" \
  --proxy-headers \
  --forwarded-allow-ips '*'
