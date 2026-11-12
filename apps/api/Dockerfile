# 构建上下文是仓库根（compose 里 context: ..），因为要拿到 packages/data 的 catalog.json
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 内网环境可通过 --build-arg PIP_INDEX_URL=https://mirrors.xxx/simple 换源
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PIP_INDEX_URL=${PIP_INDEX_URL}

WORKDIR /app

# 先装依赖再拷源码，改一行业务代码不会触发重装
COPY apps/api/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY apps/api/app ./app
COPY apps/api/migrations ./migrations
COPY apps/api/alembic.ini ./alembic.ini
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
# 目录快照：后端 seed 的唯一数据源
COPY packages/data/dist/catalog.json ./catalog.json

# 非 root 运行。容器里不需要写任何东西，只读权限就够。
RUN chmod +x ./docker-entrypoint.sh \
    && useradd --create-home --uid 10001 clab \
    && chown -R clab:clab /app
USER clab

EXPOSE 8000

# 用 python 探活而不是 curl：slim 镜像里没有 curl，装它只为健康检查不值
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3).status==200 else 1)"

# 默认单 worker：seed 在启动钩子里跑，多 worker 会并发抢同一批 upsert。
# 要扩进程时用 UVICORN_WORKERS 调大，并确保迁移已由 entrypoint 跑完。
CMD ["./docker-entrypoint.sh"]
