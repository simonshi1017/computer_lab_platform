
# ========== 1. 构建 ==========
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

# 先只拷贝清单，让依赖层能被缓存
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/tokens/package.json ./packages/tokens/
COPY packages/engine/package.json ./packages/engine/
COPY packages/data/package.json ./packages/data/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# 再拷源码
COPY packages ./packages
COPY apps ./apps

# 必须先产出 engine 与 data 的 d.ts，web 的 tsc 才能解析这两个 workspace 包
RUN pnpm --filter @clab/engine build \
 && pnpm --filter @clab/data build \
 && pnpm --filter @clab/web build

# ========== 2. 运行 ==========
FROM nginx:1.27-alpine AS runtime

RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
