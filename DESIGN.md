# Compute Lab · DESIGN.md

> 算力模型科普学习平台设计系统规范 v1.0
> 参考基线：Vercel（结构克制）+ Linear（信息密度）+ Raycast（深色玻璃质感）+ Stripe（渐变光感）
> 适配目标：0 基础小白可读、可交互、可评估的算力知识平台

---

## 1. Visual Theme & Atmosphere

**设计哲学**
把「算力」这个抽象、昂贵、充满术语的领域，做成一个**可以上手拆装的实验室**。界面本身要传递三件事：这是科学的（精确、有刻度的）、这是安全的（不会骂你配错）、这是可以玩的（拖拽、滑块、即时反馈）。

**视觉基调**
深空实验室。近乎黑的冷调背景 + 一层极淡的工程网格 + 玻璃质感的浮层卡片。数据用等宽字体，像仪表盘读数；解释用人文排版，像课本旁白。拒绝 RGB 赛博朋克，走「精密仪器」路线。

**核心视觉特征**
- `精密` — 1px 细边框 + 内高光，像金属拉丝面板
- `层次` — 背景 → 面板 → 浮层 → 弹窗，四级深度明确
- `克制霓虹` — 只在关键数值、激活态、进度条上出现渐变色
- `刻度感` — 雷达图、槽位、进度条都带刻度与网格

**光影倾向**
微阴影（几乎无投影）+ 玻璃模糊（backdrop-filter: blur(20px)）+ 顶部 1px 内高光制造「上表面被打亮」的错觉。不使用大面积发光外阴影。

**主题策略（v1.2 调整）**
默认 **Light-first**：白卡 + `#F4F6FB` 底 + `rgba(16,19,26,.09)` 细描边，教学场景下长时间阅读更省力、投影演示不易发灰。深色保留为可选（`data-theme="dark"`），用于夜间与「实验室模式」。

浅色模式下必须显式覆盖的四类元素（否则会「消失」）：
1. 图表网格线 —— 统一走 `.rd-grid / .rd-axis` 类，不写死 `rgba(255,255,255,.08)`
2. 轨道类背景 —— `--progress-track`、`--bd-bar`、评分环底环改用 `rgba(16,19,26,.08)`
3. 语义文字色 —— 用 `--good-ink / --warn-ink / --danger-ink / --accent-ink` 变量，浅色下自动转深（如 `#0E8A4B`、`#96570A`、`#3B54C9`）
4. 筛选 chip / seg / ptab —— 浅色下需要实底白 + 更强描边，否则会「飘」在背景上

---

## 2. Color Palette & Roles

### Primary
| Token | HEX | 使用场景 |
|---|---|---|
| `--accent` | `#6C8CFF` | 主按钮、激活导航、关键链接 |
| `--accent-strong` | `#4F6FFF` | 主按钮 hover |
| `--accent-soft` | `rgba(108,140,255,.14)` | 选中态底色、标签底色 |
| `--mint` | `#3DE0C0` | 正向数据、通过状态、渐变副色 |

### Brand & Dark
| Token | HEX | 使用场景 |
|---|---|---|
| `--bg` | `#07090D` | 页面底色 |
| `--bg-grid` | `rgba(255,255,255,.022)` | 工程网格线 |
| `--surface` | `#0E1219` | 卡片 / 面板 |
| `--surface-2` | `#151A23` | 卡片内嵌区、输入框 |
| `--surface-3` | `#1D2430` | hover 态、拖拽占位 |

### Interactive
| Token | HEX | 使用场景 |
|---|---|---|
| `--grad-primary` | `linear-gradient(135deg,#6C8CFF 0%,#3DE0C0 100%)` | 主 CTA、进度条、雷达填充 |
| `--focus-ring` | `rgba(108,140,255,.45)` | 输入聚焦外圈 |

### Neutral / Gray
| Token | HEX | 使用场景 |
|---|---|---|
| `--text` | `#E9EDF6` | 主文字 |
| `--text-2` | `#9BA7BC` | 次级说明 |
| `--text-3` | `#5F6B7F` | 弱化标注、单位 |
| `--border` | `rgba(255,255,255,.08)` | 默认描边 |
| `--border-strong` | `rgba(255,255,255,.16)` | hover / 激活描边 |

### Semantic
| Token | HEX | 使用场景 |
|---|---|---|
| `--success` | `#3DDC84` | 兼容通过、绿色风险 |
| `--warning` | `#FFB454` | 临界、黄色风险 |
| `--danger` | `#FF5C6C` | 不兼容、红色风险 |
| `--info` | `#5BC8FF` | 提示、术语解释 |

### Shadow
| Token | 值 |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.4)` |
| `--shadow-md` | `0 8px 24px -8px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04)` |
| `--shadow-lg` | `0 24px 60px -20px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.06)` |

---

## 3. Typography Rules

**Font Family**
```css
--font-sans: "Inter", "PingFang SC", "Noto Sans SC", -apple-system, "Segoe UI", sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
```

### Type Scale
| 层级 | Size | Weight | Line Height | Letter Spacing | 用途 |
|---|---|---|---|---|---|
| Display | 44px / 2.75rem | 700 | 1.12 | -0.03em | 首页主标题 |
| H1 | 32px / 2rem | 650 | 1.2 | -0.025em | 页面标题 |
| H2 | 24px / 1.5rem | 650 | 1.3 | -0.02em | 区块标题 |
| H3 | 18px / 1.125rem | 600 | 1.4 | -0.01em | 卡片标题 |
| Body | 14.5px / .906rem | 400 | 1.65 | 0 | 正文说明 |
| Body-sm | 13px / .8125rem | 400 | 1.6 | 0 | 次级说明 |
| Label | 12px / .75rem | 550 | 1.4 | 0.02em | 表单标签、分组名 |
| Nano | 11px / .6875rem | 500 | 1.3 | 0.06em | 单位、角标（大写） |
| Metric | 28–34px | 700 | 1.0 | -0.02em | 仪表盘数值（等宽） |

**设计哲学**
标题紧字距（-0.03em）建立密度感；正文行高 1.65 保证中文长句可读；所有数字用等宽字体并开启 `font-variant-numeric: tabular-nums`，避免实时跳数时抖动；英文缩写统一偏小一档字号并加 0.06em 字距，形成「术语气质」。

---

## 4. Component Stylings

### Buttons
```css
.btn { height:38px; padding:0 16px; border-radius:10px; font-size:13.5px; font-weight:550;
       display:inline-flex; align-items:center; gap:8px; transition:.18s cubic-bezier(.2,.8,.2,1); }
.btn-primary { background:linear-gradient(135deg,#6C8CFF,#4F6FFF); color:#fff;
       box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 6px 16px -8px rgba(108,140,255,.9); }
.btn-primary:hover { transform:translateY(-1px); box-shadow:inset 0 1px 0 rgba(255,255,255,.3),
       0 10px 24px -10px rgba(108,140,255,1); }
.btn-ghost { background:rgba(255,255,255,.04); color:var(--text); border:1px solid var(--border); }
.btn-ghost:hover { background:rgba(255,255,255,.07); border-color:var(--border-strong); }
.btn-soft { background:var(--accent-soft); color:#A9BBFF; border:1px solid rgba(108,140,255,.24); }
.btn-danger { background:rgba(255,92,108,.12); color:#FF8A95; border:1px solid rgba(255,92,108,.3); }
.btn-sm { height:30px; padding:0 12px; font-size:12.5px; border-radius:8px; }
```

### Cards
```css
.card { background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.012));
        border:1px solid var(--border); border-radius:16px; padding:20px;
        backdrop-filter:blur(20px); box-shadow:var(--shadow-md); }
.card:hover { border-color:var(--border-strong); }
```

### Inputs / Selects
```css
.input { height:38px; background:var(--surface-2); border:1px solid var(--border);
         border-radius:10px; padding:0 12px; color:var(--text); font-size:13.5px; }
.input:focus { outline:none; border-color:rgba(108,140,255,.6); box-shadow:0 0 0 3px var(--focus-ring); }
.input::placeholder { color:var(--text-3); }
```

### Navigation
```css
.nav-item { height:40px; border-radius:10px; padding:0 12px; color:var(--text-2);
            font-size:13.5px; display:flex; align-items:center; gap:10px; position:relative; }
.nav-item:hover { background:rgba(255,255,255,.045); color:var(--text); }
.nav-item.active { background:linear-gradient(90deg,rgba(108,140,255,.18),rgba(108,140,255,.04));
            color:#fff; }
.nav-item.active::before { content:""; position:absolute; left:0; top:9px; bottom:9px; width:2px;
            border-radius:2px; background:linear-gradient(180deg,#6C8CFF,#3DE0C0); }
```

### Badges
```css
.badge { height:22px; padding:0 8px; border-radius:6px; font-size:11px; font-weight:550;
         letter-spacing:.04em; display:inline-flex; align-items:center; gap:4px; }
.badge-ok { background:rgba(61,220,132,.12); color:#6FE9A5; border:1px solid rgba(61,220,132,.22); }
.badge-warn { background:rgba(255,180,84,.12); color:#FFC879; border:1px solid rgba(255,180,84,.22); }
.badge-err { background:rgba(255,92,108,.12); color:#FF8A95; border:1px solid rgba(255,92,108,.22); }
.badge-info { background:rgba(91,200,255,.12); color:#8CDBFF; border:1px solid rgba(91,200,255,.22); }
```

### Modal
```css
.modal-mask { background:rgba(4,6,10,.72); backdrop-filter:blur(8px); }
.modal { width:min(880px,92vw); background:var(--surface); border:1px solid var(--border-strong);
         border-radius:20px; box-shadow:var(--shadow-lg); animation:modalIn .26s cubic-bezier(.2,.9,.2,1); }
@keyframes modalIn { from{opacity:0; transform:translateY(12px) scale(.98)} to{opacity:1; transform:none} }
```

---

## 5. Layout Principles

- **Spacing Base**：4px。常用档位 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56。
- **Grid**：12 列，24px gutter，内容区最大宽度 1360px。
- **Sidebar**：宽 236px，固定，`padding:16px 12px`。
- **Topbar**：高 60px，sticky，底部 1px 描边。
- **Builder 三栏**：`260px | 1fr | 380px`，gap 16px，最小支持宽度 1200px 后改为上下堆叠。
- **Section Spacing**：区块间 40px，卡片间 16px。
- **留白哲学**：信息密度优先但绝不拥挤——卡片内部 20px，卡片之间 16px，靠「边框 + 层级」而非大面积空白做区分。

---

## 6. Depth & Elevation

```css
--shadow-xs: 0 1px 2px rgba(0,0,0,.35);
--shadow-sm: 0 2px 6px rgba(0,0,0,.35);
--shadow-md: 0 8px 24px -8px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04);
--shadow-lg: 0 24px 60px -20px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.06);
--shadow-glow: 0 0 0 1px rgba(108,140,255,.35), 0 12px 32px -12px rgba(108,140,255,.5);
```

**Surface Layers**
`bg (#07090D)` → `surface (#0E1219)` → `surface-2 (#151A23)` → `overlay (rgba(4,6,10,.72))`

**Z-index Scale**
`base 0` / `sticky 10` / `dropdown 100` / `sidebar 200` / `modal-mask 900` / `modal 950` / `toast 990` / `cmdk 1000`

**Backdrop**
```css
backdrop-filter: blur(20px) saturate(140%);
background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015));
```

---

## 7. Do's and Don'ts

**Do's**
1. 每个专业术语首次出现时，右侧跟一个可点击的虚线下划线标识。
2. 所有实时变化的数值使用等宽字体 + `tabular-nums`，避免布局抖动。
3. 危险/不兼容提示用「现象 + 原因 + 下一步」三句式，禁止评价用户。
4. 拖拽目标在被悬停时必须有明确的描边高亮与占位阴影。
5. 所有估算值后面固定跟一个灰色的 `估算` 角标。
6. 雷达图、进度条、槽位统一使用 4px 圆角，保持仪器感。
7. 深色为主，但所有文字对比度不低于 4.5:1（`--text-3` 仅用于单位与角标）。
8. 动效时长控制在 120–260ms，缓动统一 `cubic-bezier(.2,.8,.2,1)`。

**Don'ts**
1. 不要使用纯黑 `#000` 作背景，会失去层级。
2. 不要用大面积发光/霓虹外阴影，会显得廉价。
3. 不要用红色表达「配置差」，红色只表示「真的装不上」。
4. 不要在卡片内再嵌套超过两层卡片。
5. 不要用渐变色作为正文文字。
6. 不要让按钮圆角超过 12px（会变成玩具感）。
7. 不要在小白的默认视图里直接暴露 TDP / KV Cache / PCIe 等缩写。
8. 不要在数值剧烈变化时使用数字滚动动画，直接刷新更快。

---

## 8. Responsive Behavior

| 断点 | 宽度 | 策略 |
|---|---|---|
| Mobile | < 768px | 侧栏转底部 Tab；Builder 单列（组件库 → 机箱 → 评估）；雷达图缩小至 240px |
| Tablet | 768–1199px | 侧栏收起为图标条（64px）；Builder 两栏（组件库 + 机箱），评估面板底部抽屉 |
| Desktop | 1200–1599px | 完整三栏，侧栏 236px |
| Wide | ≥ 1600px | 内容区居中，最大 1360px，两侧留白 |

- **Touch Targets**：最小 40×40px，移动端主按钮 44px 高。
- **Font Scaling**：正文不缩放；Display 在移动端降至 30px，H1 降至 24px。
- **折叠策略**：模型/硬件卡片网格 4→3→2→1 列；表格在移动端转卡片流。

---

## 9. Agent Prompt Guide

**Quick Reference**
```
深空实验室 · 冷调近黑 #07090D · 玻璃卡片 rgba(255,255,255,.045) · 1px 白 8% 描边
主色 #6C8CFF → 副色 #3DE0C0 · 16px 圆角卡片 · 10px 圆角按钮
Inter + PingFang SC · 数字 JetBrains Mono tabular-nums · 标题 -0.03em
微阴影 + blur(20px) · 动效 180ms cubic-bezier(.2,.8,.2,1)
```

**Component Prompts**
1. `用 Compute Lab 设计系统做一个「显卡选择卡片」：左侧 48px 芯片图标，标题 RTX 4090 24GB，副标题 数据中心级/消费级，右侧显示 显存/带宽/功耗 三个等宽数值，底部一个兼容性 badge。`
2. `做一个六维评估雷达图组件：6 个轴（兼容性/性能/成本/功耗散热/扩展性/学习匹配度），填充用 #6C8CFF 到 #3DE0C0 的 22% 透明度渐变，网格线 rgba(255,255,255,.08)，轴标签 11px。`
3. `做一个拖拽组装台的机箱视图：深色金属面板，4 个 GPU 竖槽、1 个 CPU 插槽、4 条内存插槽、1 个电源仓位，空槽显示虚线描边，填充后显示部件名 + 状态灯。`
4. `做一个术语解释气泡：点击术语后从下方弹出，含「一句话解释」「专业解释」「常见误区」三段，最大宽度 320px。`
5. `做一个配置评估报告页：顶部一句话结论，下面六维评分卡网格，再下面风险清单（红黄绿三级），最后是分组的优化建议按钮。`

**Iteration Guide**
1. 先确定层级再看颜色，层级错了一切都错。
2. 数值永远用等宽字体，中文用 PingFang SC。
3. 卡片间距固定 16px，内部 20px，不要随手改。
4. 任何新增颜色先从语义色里找，找不到再加。
5. 交互反馈必须 ≤ 200ms，超过就显得卡。
6. 移动端优先保证「机箱 + 评估结论」两个屏内可见。
7. 提示语先写现象，再写原因，最后写下一步。
8. 每加一个功能，问一遍：这会不会让小白更迷茫？
9. 所有估算值都要有来源与更新时间。
10. 交付前用 13 寸屏检查一遍三栏布局是否溢出。

---

## 10. 扩展组件（v1.1 · 配置推荐）

### Tier Card（三档推荐卡）
```
背景  linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012))
描边  1px var(--border)；命中项 1px rgba(108,140,255,.5) + 外发光 0 0 0 1px
圆角  16px   内边距  16px
结构  头部（名称/说明/¥价格 26px Mono）→ BOM 清单（6 行，行高 1.6）
      → 4 列指标（显存/余量/速度/功耗，14px Mono）→ 理由块 → CTA
```
- 「推荐」角标：右上角 12px，渐变底 + 深色字，字号 9.5px，字距 .1em
- 指标数值统一 14px / 650 / `-0.02em`，单位 9.5px 灰色
- 厂商角标：NVIDIA 用 `rgba(118,185,0,.12)` 底、`#8BD34A` 字；AMD 用 `rgba(237,28,36,.12)` 底、`#FF8A8F` 字

### Spec Grid（规格矩阵）
```
display: grid; grid-template-columns: repeat(4, 1fr);
gap: 1px; background: var(--border);   /* 1px 缝隙当分隔线 */
单元格  background: var(--surface); padding: 9px 11px;
标签    9.5px / var(--text-3) / 大写 / 字距 .04em
数值    12px / 550；数字类加 .mono
```
禁止用 border 画表格线，统一用 1px gap + 底色，保证缩放下不糊。

### 语义约束
- 「省钱 / 均衡 / 性能」三档必须**真的不同**，去重后不足三档时，用一张说明卡补齐，不许用更贵更慢的方案凑数。
- 电源必须校验：`psu.watt ≥ power × 1.05` 才允许出现，否则该方案直接淘汰。
- AMD 方案在性价比排序里按 ×0.85 折算，且必须显示 ROCm 生态提示。
