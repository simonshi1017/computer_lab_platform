# Compute Lab 技术栈方案

> 面向「算力模型科普学习平台」v1.2 PRD 的落地方案
> 前提假设：内部平台、单团队维护、已有 Docker Compose + nginx 运维经验、前端团队以 React 为主

---

## 0. 结论先行

| 层 | 选型 | 一句话理由 | 什么时候才需要 |
|---|---|---|---|
| 前端框架 | **React 18 + TypeScript + Vite** | 无 SSR 需求，构建快，和现有团队一致 | 现在 |
| 样式 | **Tailwind CSS + CSS 变量令牌** | 设计系统已成型，令牌复用；不引组件库保品牌感 | 现在 |
| 无障碍组件 | **Radix UI（shadcn 模式）** | Dialog / Select / Slider / Tabs 直接可用，键盘可达 | 现在 |
| 拖拽 | **dnd-kit** | 唯一同时支持鼠标 + 触摸 + 键盘的 React 方案 | 现在 |
| 状态 | **Zustand + TanStack Query** | 配置态用 Zustand，服务端态用 Query，不上 Redux | 现在 |
| 计算内核 | **独立 TS 包 `@clab/engine`** | 纯函数、零 DOM 依赖、100% 单测 | 现在（最关键） |
| 图表 | **自绘 SVG（雷达）+ Recharts（趋势）** | 雷达只需 40 行，引库反而不好控 | 现在 |
| 后端 | **Python 3.11 + FastAPI + Pydantic v2** | 与现有项目一致，自动生成 OpenAPI | P1 |
| ORM | **SQLAlchemy 2.0 + Alembic** | 迁移可回溯，JSONB 存配置快照 | P1 |
| 数据库 | **PostgreSQL 15** | JSONB 正好装「一套配置」这种半结构化数据 | P1 |
| 缓存 | **Redis** | 会话、限流、热数据 | P1 可选，P2 再加 |
| 对象存储 | **MinIO（内网）/ 阿里云 OSS** | 分享卡片图、导出 PDF | P2 |
| 部署 | **Docker Compose + nginx** | 复用现有运维，单机够用 | P1 |
| CI | **GitLab CI** | 公司已有 GitLab | P1 |

**一句话总结**：前端重、后端轻。真正复杂的是「算力估算 + 推荐算法」这套规则，它应该是**独立可测试的纯 TS 包**，不是散落在组件里的 if-else。

---

## 1. 三个结构性决策

### 决策 A：把计算内核抽成独立包，而不是写在组件里

原型里 `app.js` 有 1600 行，其中约 300 行是算法（显存估算、KV Cache、功耗、六维评分、推荐求解）。上线后这套算法会被至少三处调用：

- 组装台实时计算（每拖一个部件算一次）
- 模型详情页的显存估算器
- 配置推荐页的三档求解

如果写在组件里，必然复制三份然后逐渐漂移。所以第一件事是把它们抽成 `@clab/engine`：

```ts
// packages/engine/src/index.ts
export function weightGB(paramsB: number, quant: Quant): number
export function kvCacheGB(spec: ModelSpec, ctx: number): number
export function vramNeed(spec: ModelSpec, quant: Quant, ctx: number): VramBreakdown
export function estimateTps(spec: ModelSpec, gpus: GpuSpec[], quant: Quant, ctx: number): number
export function evaluate(build: Build, spec: ModelSpec, budget: number): Evaluation
export function recommend(spec: ModelSpec, opts: RecommendOptions): Tier[]
```

约束：**不 import React、不读 window、不碰 localStorage**。入参出参全用普通对象，这样它能在 Node 里跑单测，将来也能被后端或脚本复用。

### 决策 B：MVP 不写后端

原型已经能完整跑通「选模型 → 组装 → 评估 → 说明书」闭环，数据全是静态的。这意味着：

- P0 直接发静态站，`nginx` 托管 dist 即可，零后端成本、零运维
- 学习进度、配置草稿先用 localStorage，够用
- 只有「跨设备同步 / 分享链接 / 数据维护」才需要后端

**不要为了「架构完整」提前上数据库**。等真的有用户要求保存了再加，那时你已经知道该存什么。

> **P1 复盘（M6 落地后）**：这个判断基本成立，但有两处被现实修正。
>
> 1. 「等有需求再加」是对的——真正落地时，存什么变得非常清楚：`build.payload`
>    存整份配置快照 + `evaluation` 存评分快照，而不是把配置拆成六七张关联表。
>    如果 P0 就设计表结构，几乎必然会拆成 `build` + `build_gpu` 这种规范化形态，
>    而它恰好无法满足「半年后回看仍是当时结论」这个需求。
> 2. 但「P0 完全不需要后端」有一点疏漏：**分享**不是一个可以推迟的功能，
>    它是「让人相信这套推荐」的主要手段。所以 M6 的第一优先级给了分享链接，
>    而不是跨设备同步。
>
> 另外，前端至今**仍然用构建期内置的数据**（`@clab/data` 的 dist），
> catalog 接口只服务管理后台与后续客户端。理由没变：首屏 0 请求 + 离线可用
> 比「数据实时」更值钱，而数据一天最多改一次。

### 决策 C：数据与代码分离，且必须带来源与时间戳

模型参数、显卡规格、价格这三类数据会持续变。方案：

- 数据放 `data/*.json`（或 `seed/*.yaml`），带 `source` / `updatedAt` 字段
- 构建时校验 schema（zod），字段缺失直接 fail
- P1 后迁到 PostgreSQL，但**保留 JSON 作为 seed 源**，方便 review 与回滚

PRD 里明确要求「所有估算值必须标注来源与更新时间」——这不是文案问题，是数据结构问题，一开始就要留字段。

---

## 2. 前端技术栈

```
React 18 + TypeScript 5 + Vite 5
├─ 路由        React Router 6（或 TanStack Router）
├─ 状态        Zustand（build / ui）+ TanStack Query（server state）
├─ 样式        Tailwind 3 + CSS 变量（复用现有 DESIGN.md 令牌）
├─ 组件基座    Radix UI primitives（Dialog / Select / Slider / Tabs / Tooltip / Toast）
├─ 拖拽        dnd-kit（core + sortable）
├─ 动效        Framer Motion（仅页面切换与关键反馈，别滥用）
├─ 图标        lucide-react（线性单色，符合设计规范）
├─ 表单        react-hook-form + zod
├─ 图表        自绘 SVG（雷达）+ Recharts（成本/速度趋势）
└─ 测试        Vitest + Testing Library + Playwright（E2E 只测 3 条主链路）
```

### 为什么不用这些

| 候选 | 不用的原因 |
|---|---|
| Next.js | 无 SEO / SSR 需求，全部交互在客户端；多一层服务端渲染只会让部署与调试变复杂。真要分享页被爬，用 Vite 的预渲染插件生成静态 HTML 即可 |
| Ant Design / Element Plus | 品牌感是这个产品的卖点，组件库的默认视觉会把它拉回「后台管理系统」。Radix 只给行为不给样式，正好 |
| Redux Toolkit | 状态规模不大，Zustand 少一半样板代码 |
| react-dnd | 触摸支持弱，且维护活跃度不如 dnd-kit |
| 3D（three.js） | PRD 明确 MVP 只做 2D 槽位，3D 是成本黑洞 |

### 关键实现细节

1. **拖拽必须有点击兜底**
   移动端拖拽体验天然差。每个部件卡片同时支持「点一下加入机箱」，拖拽只是加分项。

2. **计算节流**
   拖动过程中 `evaluate()` 每帧都跑会掉帧。用 `requestAnimationFrame` 合并，或在拖拽结束才触发完整评估，中间只更新数值面板。

3. **数字不滚动**
   设计规范里写了：数值变化直接刷新，不做数字滚动动画——组装台每秒可能变十几次，滚动会晕。

4. **首屏性能预算**
   目标：JS < 200KB gzip、LCP < 2s。做法：路由级 code splitting，组装台/推荐页懒加载，数据 JSON 按模块拆包。

---

## 3. 后端技术栈（P1 引入）

```
Python 3.11 + FastAPI + Pydantic v2
├─ ORM        SQLAlchemy 2.0（async）+ Alembic
├─ 鉴权       JWT（access 15min + refresh 7d），企业微信 OAuth 换绑
├─ 管理后台   sqladmin（挂在 /admin，省一个前端）
├─ 定时任务   APScheduler（价格同步、数据健康检查）
├─ 日志       结构化 JSON → Loki / 文件
└─ 测试       pytest + httpx
```

### 模块划分（单体，不拆微服务）

```
apps/api/app/
├─ core/          # 配置、安全、依赖注入
├─ models/        # SQLAlchemy 模型
├─ schemas/       # Pydantic 出入参
├─ api/v1/
│  ├─ auth.py     # 登录、刷新、企业微信回调
│  ├─ catalog.py  # 模型 / 显卡 / 部件（只读，可缓存）
│  ├─ builds.py   # 配置的增删改查
│  ├─ share.py    # 分享链接与落地页数据
│  └─ progress.py # 学习进度
├─ services/      # 业务逻辑（不写 SQL，不碰 HTTP）
└─ jobs/          # 定时任务
```

### API 契约（v1）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/code` | 发送邮箱验证码 |
| POST | `/api/v1/auth/login` | 登录换 token |
| GET | `/api/v1/auth/wecom/url` | 企业微信扫码地址 |
| GET | `/api/v1/catalog/models` | 模型列表（支持 `?size=` 过滤） |
| GET | `/api/v1/catalog/gpus` | 显卡列表（`?min_vram=&vendor=`） |
| GET | `/api/v1/catalog/parts` | 部件列表（按 6 类分组） |
| GET | `/api/v1/catalog/all` | 完整目录 + 版本号（一次拉全） |
| POST | `/api/v1/auth/dev-login` | 开发登录（仅 `APP_ENV != prod`） |
| GET | `/api/v1/health` | 依赖探测（DB / 特性开关） |
| GET | `/api/v1/catalog/version` | 数据集版本号 + 更新时间（前端据此失效缓存） |
| POST | `/api/v1/builds` | 保存一套配置 |
| GET | `/api/v1/builds` | 我的配置列表 |
| PATCH | `/api/v1/builds/{id}` | 重命名 / 更新 |
| POST | `/api/v1/share` | 生成分享 token |
| GET | `/api/v1/share/{token}` | 落地页数据（无需登录） |
| PUT | `/api/v1/progress/{lessonId}` | 上报关卡进度与输出物 |

**注意**：`recommend` 不放服务端。推荐求解是纯函数，放在前端才是 0 延迟；后端只在「生成分享卡片」时复算一次做校验。

**缓存策略**：catalog 四组接口都带 `ETag`（内容 sha256）+ `Cache-Control: max-age=300`。
目录一天最多变一次，而它是唯一会被高频重复请求的接口——没有协商缓存的话，
Postgres 会为一批完全相同的行反复全表扫描。304 响应里必须继续带 ETag，否则下一次协商就断了。

---

## 4. 数据模型

```sql
-- 用户
create table app_user (
  id            bigserial primary key,
  email         citext unique,
  wecom_userid  text unique,
  nickname      text,
  created_at    timestamptz default now()
);

-- 模型规格（由 seed 同步，管理后台可改）
create table model_spec (
  id            text primary key,           -- 'qwen25-14b'
  name          text not null,
  vendor        text not null,              -- '阿里云'
  arch          text,                       -- 'Dense 稠密'
  params_b      numeric(6,2) not null,
  layers        int not null,
  hidden_dim    int not null,
  ctx_max       int not null,
  license       text,
  scenes        text[],                     -- 使用场景
  strong_at     text,
  weak_at       text,
  source        text,                       -- 数据来源链接
  updated_at    timestamptz default now()
);

-- 显卡规格
create table gpu_spec (
  id          text primary key,             -- 'rtx4090'
  name        text not null,
  vendor      text not null,                -- NVIDIA / AMD
  arch        text,
  vram_gb     int not null,
  bandwidth   int not null,                 -- GB/s
  tdp_w       int not null,
  msrp_cny    int,
  class       text,                         -- 消费级/专业卡/数据中心
  source      text,
  updated_at  timestamptz default now()
);

-- 价格快照：价格必须留历史，否则「参考价」会变成假数据
create table price_snapshot (
  id          bigserial primary key,
  gpu_id      text references gpu_spec(id),
  price_cny   int not null,
  channel     text,                         -- 'jd' / 'manual'
  captured_at timestamptz default now()
);
create index on price_snapshot (gpu_id, captured_at desc);

-- 用户配置（JSONB 存快照，避免规格变更后历史配置被改写）
create table build (
  id          bigserial primary key,
  user_id     bigint references app_user(id),
  name        text,
  payload     jsonb not null,               -- {gpus:[],cpu:...,modelId,quant,ctx}
  evaluation  jsonb,                        -- 保存时的评分快照
  is_public   boolean default false,
  created_at  timestamptz default now()
);

-- 分享链接
create table share_link (
  token       text primary key,
  build_id    bigint references build(id) on delete cascade,
  expires_at  timestamptz,
  views       int default 0
);

-- 学习进度
create table lesson_progress (
  user_id     bigint references app_user(id),
  lesson_id   int,
  status      text,                         -- 'done' / 'current'
  output      jsonb,                        -- 该关的输出物
  updated_at  timestamptz default now(),
  primary key (user_id, lesson_id)
);
```

**为什么配置用 JSONB 而不是拆表**：一套配置是一份「快照」，用户半年后回看应该看到当时算出来的结果，而不是被新规格改写过的结果。JSONB 天然适合。

---

## 5. 部署拓扑

```yaml
# deploy/docker-compose.yml（服务清单）
services:
  nginx:      # 80/443，静态资源 + 反代 /api，gzip + 强缓存
  web:        # 构建产物（也可直接塞进 nginx 的 volume，少一个容器）
  api:        # uvicorn 4 workers
  postgres:   # 数据卷持久化，每日 pg_dump 到 OSS
  redis:      # 可选，P2
  minio:      # 可选，内网对象存储
```

- **静态资源**：`index.html` no-cache，`assets/*` 强缓存（文件名带 hash）
- **反向代理**：`/api/*` → `api:8000`，超时 30s
- **灰度**：单机先不做，P2 若要多实例再上
- **备份**：postgres 每日 dump，保留 14 天

---

## 6. 目录结构（monorepo）

```
cm-learn-platform/
├─ apps/
│  ├─ web/                 # React + Vite
│  │  ├─ src/
│  │  │  ├─ pages/         # home / path / models / hardware / builder / recommend / glossary / manual
│  │  │  ├─ components/    # designer 级组件：TierCard / Slot / Radar / Metric
│  │  │  ├─ stores/        # zustand
│  │  │  ├─ lib/           # 数据适配、格式化
│  │  │  └─ styles/        # tokens.css + tailwind.css
│  │  └─ vite.config.ts
│  └─ api/                 # FastAPI
├─ packages/
│  ├─ engine/              # ★ 计算内核，纯 TS，无 React 依赖
│  │  ├─ src/{vram,kv,power,score,recommend}.ts
│  │  └─ test/golden/*.json  # 黄金用例
│  └─ tokens/              # 设计令牌（CSS 变量 + tailwind preset）
├─ data/
│  ├─ models.json
│  ├─ gpus.json
│  └─ schema.ts            # zod 校验
├─ deploy/
│  ├─ docker-compose.yml
│  └─ nginx.conf
└─ pnpm-workspace.yaml
```

---

## 7. 分阶段落地

### P0 · 静态可用（先上线）
- 现有原型直接部署为静态站，拿到第一批真实反馈
- 同时把 `app.js` 里的算法抽成 `@clab/engine` 并补单测
- 数据从硬编码迁到 `data/*.json` + zod 校验
- **产出**：能用的 URL，以及一套可信赖的算法包

### P1 · 账号与保存
- FastAPI + PostgreSQL，先只做：登录、保存配置、我的配置列表
- 分享链接（token → 落地页）
- sqladmin 后台，运营可以自己改模型/显卡参数
- **产出**：用户数据能沉淀，运营不用找开发改数据

### P2 · 数据自动化
- 价格快照表 + 定时抓取（或每周人工导入 CSV）
- 分享卡片图（前端 canvas 生成即可，不必上服务端渲染）
- 埋点：关卡完成率、推荐采纳率、说明书导出率
- **产出**：数据驱动迭代，价格不再是「拍脑袋估算」

### P3 · 可选增强
- 社区配置广场（他人配置可复制、可评分）
- 真实推理体验（接 vLLM / Ollama 网关，限量体验）
- 服务端渲染 OG 图（分享到微信时有缩略图）

---

## 8. 工程质量底线

| 项 | 要求 | 原因 |
|---|---|---|
| engine 单测 | 分支覆盖 ≥ 90%，含 20 条黄金用例 | 估算错误会直接误导用户买硬件，这是产品信任的根 |
| 数据校验 | 构建期 zod 校验，字段缺失即失败 | 数据是产品内容，不能靠人肉检查 |
| 数据带版本 | `catalog/version` 接口 + 前端缓存失效 | 用户看到的参数必须能对得上来源 |
| E2E | 只测 3 条：组装→评估、模型→推荐、生成说明书 | 覆盖最高价值链路，不做无谓的全量 |
| 性能 | 首屏 JS < 200KB，组装台拖拽 ≥ 50fps | 拖拽是核心体验 |
| 可访问性 | 所有交互可键盘操作，对比度 ≥ 4.5:1 | 教学产品，用户含学生群体 |

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 规格数据维护成本高 | 内容腐烂，用户失去信任 | 管理后台 + `source`/`updated_at` 必填 + 定期巡检 |
| 估算与实际偏差大 | 用户买错硬件，口碑崩 | 显著标注「估算」+ 免责声明 + 开放「实测反馈」入口 |
| AMD / 国产卡支持 | 推荐结果误导 | 单独标记生态折价，明确写清 ROCm 限制 |
| 移动端拖拽体验 | 核心功能不可用 | dnd-kit + 点击选择双通道，移动端默认点击 |
| 推荐算法黑箱感 | 用户不信任结论 | 每档都给「为什么这么配」的三句解释（原型已实现） |
| 团队只有一个人 | 进度风险 | P0 先上静态站，后端能拖就拖 |

---

## 10. 与现有原型的关系

原型不是废弃品，它是三样东西：

1. **可点击的设计稿**——所有视觉与交互已经验证过，React 重写时照着搬
2. **算法参考实现**——`app.js` 里的公式与阈值是这轮讨论的结论，重写时逐条对齐
3. **P0 的线上版本**——在 React 版完成前，它就是能用的产品

迁移顺序建议：`engine` 先抽（纯逻辑无 UI，风险最低）→ 静态页面 → 组装台（最复杂）→ 推荐页 → 其余。

---

*本文档随实现迭代，选型变更请同步更新版本号与理由。*
