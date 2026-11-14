# Compute Lab · 算力实验室

[English](./README.en.md) · **简体中文**

把「跑大模型」这件事拆开给你看的互动学习平台：先把概念讲明白，再让你亲手拖一台虚拟服务器出来，最后给出多维评估与部署说明书。

![DIY 组装台：实体机箱、实时显存功耗与六维评估](docs/screenshots/05-builder.png)

## 效果预览

截图取自默认浅色主题、1440 宽视口（一般 960 高，场景库 1200 高），由真实部署生成，可随时重跑（见文末）。

<table>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/01-home.png" width="420" alt="知识地图"/><br/><b>知识地图</b><br/>五关渐进式学习路径、今日推荐与继续学习</td>
    <td width="50%" align="center"><img src="docs/screenshots/02-models.png" width="420" alt="模型百科"/><br/><b>模型百科</b><br/>12 个 2026 主流模型：厂商、场景、擅长与短板、显存估算</td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/03-hardware.png" width="420" alt="硬件百科"/><br/><b>硬件百科</b><br/>16 张显卡与五大部件，价格标注来源与采集时间</td>
    <td width="50%" align="center"><img src="docs/screenshots/04-recommend.png" width="420" alt="配置推荐"/><br/><b>配置推荐</b><br/>省钱 / 均衡 / 性能三档 BOM，含电源与插槽硬校验</td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/09-topology.png" width="420" alt="硬件拓扑"/><br/><b>硬件拓扑</b><br/>GPU–PCIe–CPU–内存–硬盘的链路与带宽对照，多卡时直接标出瓶颈</td>
    <td width="50%" align="center"><img src="docs/screenshots/10-timeline.png" width="420" alt="推理时序"/><br/><b>推理时序</b><br/>预填充 / 解码两段时间与显存增长，看清首字延迟花在哪</td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/screenshots/06-manual.png" width="620" alt="我的说明书"/><br/><b>我的说明书</b><br/>把配置整理成能照着做的部署清单：目标、成本合计、性能预估、风险提示，可打印导出</td>
  </tr>
</table>

## 多语种

界面支持**简体中文 / English**：顶栏右侧的语言按钮切换，URL 也可用 `?lang=en` 直接指定。选择会记在 localStorage，并同步 `<html lang>` 与 `hreflang` 标签。

| 简体中文 | English |
|---|---|
| <img src="docs/screenshots/01-home.png" width="420" alt="中文首页"/> | <img src="docs/screenshots/en/01-home.png" width="420" alt="English home"/> |

实现刻意做轻：`apps/web/src/i18n/` 的字典**以中文原文为 key**，`t()` 在中文态原样返回，省掉一份重复字典。两套检查脚本各管一层：

```bash
node scripts/i18n-codemod.mjs check   # UI 文案：外置与翻译覆盖率
node scripts/i18n-codemod.mjs apply   # 把新增中文自动包成 t()（幂等）
node scripts/gen-content-dict.mjs     # 内容文案：生成字典并报告缺失
```

覆盖范围：**UI 696 条 + 内容数据 434 条静态 + 37 条动态模板**，全部双语。内容数据不改 `packages/data` 的 schema（会冲击 zod 校验与「文案数字对账」测试），改由 `apps/web/src/data/` 在模块加载时按 locale 一次性本地化；`gpuClass`、`category`、id 这类逻辑值保持原值，只在显示处翻译。计算内核返回的动态建议由 `dynamicKey()` 把数字与型号归一成占位符，说明书里的多变量长句用 `tf()` 命名占位模板。

切换语言会整页重载，让导航元信息、预设、筛选标签这些模块级常量按新 locale 重新初始化（和参考站按 `lang` 参数切换一致）。

> 验收：`e2e/i18n-content.spec.ts` 遍历 9 个主要页面，断言英文态 **0 处中文残留**（模型名、显卡点评、术语解释、关卡、评估建议、说明书都在内），中文态保持原文。

- 产品设计：[prototype/](prototype/)（可交互原型，作为视觉与交互基线）
- 设计规范：[DESIGN.md](DESIGN.md)
- 技术选型：[TECH-STACK.md](TECH-STACK.md)
- 开发计划：[DEV-PLAN.md](DEV-PLAN.md)

## 场景实验室

对标参考站的「实验库 + 实验指导」：先选一个真实使用场景，一键把目标模型、量化、上下文、预算与整机配置载入组装台；再由内嵌的任务卡接管步骤引导。

![场景库：6 个按难度组织的实验](docs/screenshots/07-scenarios.png)

6 个场景按学习顺序排列：本地聊天助手 → 长文档知识库 → 本地代码助手 → 小团队 API 服务 → LoRA 微调实验 → 极致预算挑战。每张卡片先给目标与代价（模型规模、上下文、预算、步骤数），再给前两步预览，可按难度筛选。

![组装台任务卡：5 步全部自动打勾](docs/screenshots/08-lab.png)

任务卡的打勾**不靠手点、也不存进度**：每一步都是一条可序列化的校验条件（`isStepDone()`），直接读 `useBuild` 的实时评估结果——选对模型、上下文达标、显卡数量、显存余量、电源冗余、散热能力、六维评分、整机报价。把卡拆掉或把上下文降回去，勾会立刻消失，所以它能当校验器用，而不是一个自我安慰的 checklist。全部达成只上报一次 `scenario_complete`，与 `scenario_start` 组成看板漏斗。

场景编排放在 `apps/web/src/lib/scenarios.ts`（应用侧，不污染 `packages/data` 的 schema 与后端 seed）；`apps/web/src/lib/scenarios.test.ts` 用真实计算内核跑过 6 套预置配置，锁住「一键载入后所有步骤都必须可达成」这条回归线。

## 当前进度

| 里程碑 | 状态 |
|---|---|
| M0 工程基建 | ✅ 已完成 |
| M1 计算内核 | ✅ 已完成 |
| M2 内容与数据 | ✅ 已完成 |
| M3 组装台 | ✅ 已完成 |
| M4 配置推荐 | ✅ 已完成 |
| M5 打磨上线 | ✅ 已完成 |
| M6 后端 P1 | ✅ 已完成 |
| M7 数据自动化 | ✅ 已完成 |
| M8 多语种与内容双语 | ✅ 已完成 |
| M9 场景实验室与步骤引导 | ✅ 已完成 |
| M10 模型库换代（2026 主流 + MoE 激活参数） | ✅ 已完成 |
| M11 硬件拓扑图 + 推理时序曲线 | ✅ 已完成 |

内容基线：12 个模型（2026-02 至 2026-08 发布）· 16 张显卡 · 7 类部件（共 31 项）· 16 条术语 · 5 关学习路径。

模型目录（2026-11 换代，全部开源权重）：

| 模型 | 厂商 | 总参 / 激活 | 上下文 | 许可 | INT4 · 8K 显存 | 一句话 |
|---|---|---|---|---|---|---|
| Qwen3.5-9B | 阿里云 | 9B / 9B | 262K | Apache-2.0 | 7.1GB | 这一代的入门线，12G 卡可跑 |
| Qwen3.5-35B-A3B | 阿里云 | 35B / 3B | 262K | Apache-2.0 | 22.8GB | 只激活 3B，单卡 200 tokens/s |
| Qwen3.8-27B | 阿里云 | 27B / 27B | 262K | Apache-2.0 | 20.5GB | 原生多模态稠密，单卡甜点 |
| Qwen3.8-Max | 阿里云 | 2.4T / 95B | 262K | Qwen3.8-Max | 1510GB | 首个开源 Max 级，8 张 MI300X |
| DeepSeek-V4-Flash | 深度求索 | 285B / 13B | 1M | MIT | 180.3GB | 百万上下文，3 张 H100 起步 |
| DeepSeek-V4.1-Flash | 深度求索 | 552B / 12B | 1M | MIT | 347.3GB | 非对称编解码 + 视觉 |
| GLM-5.2 | 智谱 AI | 744B / 40B | 1M | MIT | 470.9GB | 长程任务，许可最宽松的旗舰 |
| GLM-5.3 | 智谱 AI | 744B / 40B | 1M | GLM-5.3 | 470.9GB | 同基座，长程编程与漏洞挖掘 |
| GLM-5.3-Flash | 智谱 AI | 320B / 18B | 1M | MIT | 202.3GB | 原生多模态，门槛降到 3 张 H100 |
| Hy4 preview | 腾讯混元 | 770B / 49B | 1M | Apache-2.0 | 487.2GB | 生产力向，Apache-2.0 的 770B |
| Kimi K2.7 Code | 月之暗面 | 1T / 32B | 256K | Modified MIT | 630.7GB | 编程专精，强制思考 |
| Kimi K3 | 月之暗面 | 2.78T / 104B | 1M | Kimi K3 | 1747.2GB | 首个开源 3T 级 |

> 两条配套改动：MoE 的**解码速度按激活参数算**（`ModelSpec.activeParamsB`），显存仍按总参数算——否则 GLM-5.2 会被估成 2 tokens/s；模型详情页同时展示「总参 / 激活」。

组装台能力：实体机箱 SVG（8 类槽位）· 拖拽/点击/键盘三通道 · 实时显存功耗价格 · 六维雷达与可执行建议 · 三套预设 · 六个场景实验（任务卡自动校验）· **硬件拓扑与推理时序双视图** · 本地存档 · 说明书生成与打印。

拓扑与时序都建在 `packages/engine` 的纯函数上，不是画在组件里的图：`describeTopology()` 用显卡的 PCIe 代数和主板插槽数算出「单卡 ×16、双卡拆 ×8」的真实链路带宽，和显存带宽并排比；`describeTimeline()` 按「预填充是算力瓶颈、解码是访存瓶颈」拆成两段，输出显存随 token 增长的曲线。结论用枚举返回、由 UI 组句，所以两套语言都不会漏翻。

打磨结果：首屏 97KB gzip（路由懒加载，组装台拆成独立 chunk）· 对比度全部达 AA · 键盘可完成装机 · 页面级错误边界 · 28 条 Playwright E2E · 全局免责页脚。

数据自动化（M7）：价格经 CSV 导入后写入快照表并同步当前价，前端每张卡都能显示「京东 · 今天」或「目录估算价 · 无采集时间」；异常涨跌（>60%）与越界价在导入时就被拒绝。APScheduler 每日体检，陈旧即告警。分享卡片用 canvas 导出 1200×630 PNG，含显存占用条与保存时单价。埋点走 `sendBeacon` 上报，`/stats` 看板回答四个问题：多少人在用、学习走完没有、推荐是否被采纳、分享有没有传出去。

后端能力（M6）：企业微信扫码 / 邮箱验证码 / dev 三种登录 · 配置保存（JSONB 快照 + 评分快照）· 随机 token 分享链接（免登录只读落地页）· 学习进度同步 · `/admin` 数据后台 · catalog 只读接口带 ETag 协商缓存。

配置推荐能力：12 个内置模型 + 自定义参数量 · 量化/上下文/预算/偏好四维输入 · 三档 BOM（含 CPU 主板插槽校验、电源硬校验、二手货源标记）· 不足三档与不可行两种兜底 · 一键载入组装台（含自定义模型）。

## 快速开始

```bash
# 本机安装依赖时若遇到符号链接被拦，用 env -u NODE_OPTIONS 绕开沙箱 fs shim
pnpm install
pnpm dev          # http://localhost:5173
```

前端用 `VITE_API_TARGET` 指向后端（默认 `http://127.0.0.1:8000`），Vite 会把 `/api` 代理过去。后端不起也能跑——所有需要账号的功能会自动降级为本地模式。

其他命令：

```bash
pnpm build        # 构建全部包（engine → web）
pnpm lint         # ESLint（根目录统一配置）
pnpm typecheck    # 类型检查
pnpm test         # 单测（vitest）
pnpm e2e          # 端到端（Playwright，需先 build）
```

### 只跑后端

```bash
cd apps/api
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
# 内网 pypi 慢的话加 -i https://mirrors.aliyun.com/pypi/simple/

# 需要一个 PostgreSQL；本地没有就起一个临时库：
docker run -d --name clab-dev-pg -e POSTGRES_USER=clab -e POSTGRES_PASSWORD=clab \
  -e POSTGRES_DB=clab -p 15432:5432 postgres:15-alpine

export DATABASE_URL="postgresql+psycopg://clab:clab@localhost:15432/clab"
export APP_ENV=dev JWT_SECRET=dev-secret ADMIN_PASSWORD=devpass

.venv/bin/alembic upgrade head          # 建 9 张表
.venv/bin/uvicorn app.main:app --reload  # http://127.0.0.1:8000/api/v1/docs
.venv/bin/python -m pytest              # 69 条用例（默认跑 SQLite，不需要 PG）
```

## 目录结构

```
.
├── apps/api/                # FastAPI + SQLAlchemy + Alembic
│   ├── app/
│   │   ├── core/            # 配置、DB 会话、JWT、依赖注入、错误结构
│   │   ├── models/          # 9 张表（JSONB 快照）
│   │   ├── schemas/         # Pydantic 出入参（snake_case → camelCase）
│   │   ├── services/        # 业务逻辑：seed / catalog / auth / builds / pricing / analytics
│   │   ├── api/v1/          # 路由：auth / catalog / builds / share / progress / prices / analytics
│   │   ├── jobs/            # APScheduler：价格新鲜度体检 + 告警
│   │   ├── cli.py           # 运维命令：prices import / status、analytics report
│   │   └── admin.py         # sqladmin 后台
│   ├── migrations/          # Alembic 迁移
│   └── tests/               # pytest（SQLite）
├── apps/web/                # React 18 + Vite + TS
│   └── src/
│       ├── layout/          # 应用外壳（侧栏 / 顶栏）
│       ├── pages/           # 路由页面（知识地图 / 百科 / 组装台 / 分享 / 看板 …）
│       ├── components/      # 业务组件 + ui/ 原子组件
│       ├── hooks/           # useTheme / useProgress / useBuild / useAuth
│       ├── lib/             # 格式化、适配判定等纯工具
│       ├── navigation.ts    # 路由元信息（导航、面包屑、命令面板共用）
│       └── styles/          # Tailwind 入口 + 语义类
├── docs/screenshots/        # README 效果图（由 e2e/_readme_shots.spec.ts 生成）
├── packages/
│   ├── tokens/              # 设计令牌（CSS 变量 + Tailwind preset）
│   ├── engine/              # 计算内核（纯 TS，无框架依赖）
│   └── data/                # 内容数据 + zod 校验（模型/显卡/部件/术语/关卡）
└── deploy/                  # Dockerfile + nginx + compose
```

### 为什么 engine 单独成包

显存估算、功耗、评分、推荐求解会被「组装台 / 模型详情 / 推荐页」三处调用，写在组件里必然漂移。抽成纯函数包后可以独立单测，也方便将来被脚本复用。

### 为什么 data 也单独成包

数据既是 UI 的内容源，也是 engine 的输入。放在应用里会导致「页面用的模型清单」和「算显存用的模型清单」是两份。现在只有一份 `ModelRecord`，字段既够渲染，也满足 `ModelSpec` 契约。

## 价格维护

价格是用户唯一会拿去和电商页面比对的数字，所以走的是一条可追溯的管道：

```bash
# 1. 拿模板（带两行真实示例）
docker compose -f deploy/docker-compose.yml exec api python -m app.cli prices template > prices.csv

# 2. 填好后先预演，看会改哪几个价
docker compose -f deploy/docker-compose.yml exec -T api sh -c 'cat > /tmp/p.csv' < prices.csv
docker compose -f deploy/docker-compose.yml exec api python -m app.cli prices import /tmp/p.csv --dry-run

# 3. 确认无误再写入
docker compose -f deploy/docker-compose.yml exec api python -m app.cli prices import /tmp/p.csv

# 4. 看当前状态：渠道、距今多少天、是否陈旧
docker compose -f deploy/docker-compose.yml exec api python -m app.cli prices status
```

CSV 列：`gpu_id,price_cny,channel,source,captured_at,note`，只有前两列必填。

导入时的三条硬规则：

1. **越界拒绝**：低于 100 或高于 100 万，几乎一定是录入错误；
2. **暴涨拒绝**：相对当前价变动超过 60% 直接挡下（`--force` 可强行写入），这是「少写一个 0」最常见的形态；
3. **同天同渠道覆盖**：修正当天录错的价格不会产生重复快照。

> 没有「京东自动抓取」。商品页有风控，批量抓价用于商业展示也不合条款。16 张卡人工一周导一次足够；真要自动化，实现 `PriceProvider.fetch()` 即可，校验与快照逻辑不用改。

`PRICE_STALE_DAYS`（默认 45）控制「陈旧」阈值，超过就在卡片和详情标黄。每日 09:00 的定时任务会把陈旧情况写日志，配了 `ALERT_WEBHOOK` 还会推到企业微信群。

## 数据看板

`/stats`（仅管理员，入口在「我的配置」页）。指标口径：

| 指标 | 分母 | 为什么 |
|---|---|---|
| 关卡完成率 | 有过学习记录的人 | 用全部注册用户当分母会让指标随注册数上升而虚降 |
| 推荐采纳率 | `recommend_view` 次数 | 进页面记 view（只记一次），点「载入组装台」记 apply |
| 分享转化 | 实际存在的分享链接数 | 用 `share_create` 事件数会得出「0 个链接被打开 12 次」 |

埋点不采集 IP、不存 UA 原文（只留 80 字符摘要）、只收白名单事件与标量 props。

## 数据维护

数据文件：`packages/data/src/{models,gpus,parts,glossary,lessons}.ts`

改完必须做两件事：

```bash
pnpm --filter @clab/data test    # schema + 跨记录约束 + 文案数字对账
pnpm build                        # 重新产出 dist，web 才吃得到
```

校验分三层，任何一层不过都会让构建失败：

1. **结构**（zod）：必填字段、单位范围、`ctxMax` 必须是 1024 的倍数、`source` 必须是 URL、`updatedAt` 必须是 `YYYY-MM`。

> `pnpm build` 会额外产出 `packages/data/dist/catalog.json`——**后端 seed 的唯一数据源**。改完数据只改 TS、不重建，后端拿到的还是旧值，症状是「接口数据不更新」。
2. **关系**（`crossCheck`）：id 全局唯一、术语 `related` 必须存在、关卡编号连续、最大电源要能带动四张最强桌面卡。
3. **数字一致性**（测试）：文案里写的「权重约 6.8GB / 合计约 11.9GB」会被抽出来跟 `vramNeed()` 对账，容差 0.15。

> 第 3 层是踩过坑才加的：手写文案时按十进制 GB 估算，与代码里的 GiB 差了 7%，一度出现「14B 权重 8.3GB」而实际是 6.8GB。这类错误会直接误导购买决策。

## Docker 部署

三个容器：`web`（nginx + 静态站）· `api`（FastAPI）· `db`（PostgreSQL 15）。

```bash
cp deploy/.env.example deploy/.env   # 首次部署：至少改 JWT_SECRET / ADMIN_PASSWORD
pnpm docker:build     # 构建镜像（多阶段：node 构建 → nginx 运行；pip 装依赖）
pnpm docker:up        # 后台启动，默认 http://localhost:8080
pnpm docker:logs      # 看日志
pnpm docker:down      # 停止并移除
```

- 端口可通过环境变量覆盖：`CLAB_PORT=9000 pnpm docker:up`
- 内网构建 pypi 慢时：`PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ pnpm docker:build`
- 镜像内 nginx 已配置：SPA 路由回退、`/assets/*` 强缓存一年、`index.html` 不缓存、gzip、基础安全头、`/healthz` 健康检查，并把 `/api/` 与 `/admin` 反代到 `api:8000`
- 启动即自动建表 + 导入 `packages/data/dist/catalog.json`（幂等 upsert，可反复重启）
- 数据库落在命名卷 `clab-db`；备份：`docker exec clab-db pg_dump -U clab clab > backup.sql`
- 定时任务默认开启（`SCHEDULER_ENABLED=true`，每日 09:00 价格体检）。多副本部署时只在一个实例开启，否则会重复告警

### 数据后台

`http://localhost:8080/admin`，账号取自 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。可维护模型、显卡、部件、价格快照，以及查看用户配置与分享链接。**仓库里的默认口令是占位值 `CHANGE_ME_IN_DEPLOY_ENV`，首次部署必须在 `deploy/.env`（已被 gitignore）里设置真实口令；未修改时启动会打印告警。**

### 登录方式

| 方式 | 依赖 | 未配置时的行为 |
|---|---|---|
| 企业微信扫码 | `WECOM_CORP_ID` / `WECOM_AGENT_ID` / `WECOM_SECRET` / `WECOM_REDIRECT_URI` | 接口返回 501，前端隐藏扫码入口并说明原因 |
| 邮箱验证码 | `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | `APP_ENV=dev` 时验证码直接回传前端；`prod` 返回 501 |
| 开发登录 | `APP_ENV != prod` 且 `ALLOW_DEV_LOGIN=true` | 生产环境关死（判断在服务端，不靠前端隐藏按钮） |

## 重新生成截图

效果图由 [apps/web/e2e/_readme_shots.spec.ts](apps/web/e2e/_readme_shots.spec.ts) 从真实部署抓取，固定 1440 宽度并强制浅色主题（场景库为两行卡片，单独用 1200 高度）：

```bash
E2E_BASE_URL=http://localhost:8080 \
  pnpm --filter @clab/web exec playwright test e2e/_readme_shots.spec.ts

# 英文态配图（输出到 docs/screenshots/en/）
E2E_BASE_URL=http://localhost:8080 SHOT_LANG=en \
  pnpm --filter @clab/web exec playwright test e2e/_readme_shots.spec.ts
```

中文态输出到 `docs/screenshots/`，英文态输出到 `docs/screenshots/en/`。改了 UI 后重跑一次，两版 README 的配图就会同步更新。

## 约定

- 主题：默认浅色，`data-theme="dark"` 切深色；颜色一律走 `packages/tokens/tokens.css` 的变量，不要在组件里写死色值
- 样式：优先用 Tailwind 工具类 + preset 里的语义色名（`bg-surface` / `text-ink-2` / `border-line`）
- 页面：新增页面时先在 `navigation.ts` 注册，导航、面包屑、命令面板会自动带上
- 提交：`feat(engine): ...` / `fix(builder): ...` / `docs(plan): ...`
