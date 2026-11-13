# Compute Lab

**English** · [简体中文](./README.md)

An interactive learning platform that takes "running a large language model" apart, piece by piece: first it explains the concepts, then lets you assemble a virtual server with your own hands, and finally hands you a multi-dimensional evaluation and a deployment manual.

![DIY Builder: a real-looking chassis, live VRAM/power figures, and a six-axis score](docs/screenshots/05-builder.png)

## Screenshots

Captured from a real deployment in the default light theme at a 1440×960 viewport. Regenerating them is a one-liner (see the end of this file).

<table>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/01-home.png" width="420" alt="Knowledge map"/><br/><b>Knowledge Map</b><br/>A five-level learning path, daily picks, and resume-where-you-left-off</td>
    <td width="50%" align="center"><img src="docs/screenshots/02-models.png" width="420" alt="Model catalog"/><br/><b>Model Catalog</b><br/>9 models with vendor, use cases, strengths, limits, and VRAM estimates</td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/03-hardware.png" width="420" alt="Hardware catalog"/><br/><b>Hardware Catalog</b><br/>16 GPUs and five component families, with price source and capture date</td>
    <td width="50%" align="center"><img src="docs/screenshots/04-recommend.png" width="420" alt="Configuration recommender"/><br/><b>Configuration Recommender</b><br/>Three budget tiers with hard PSU and socket compatibility checks</td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/screenshots/06-manual.png" width="620" alt="Deployment manual"/><br/><b>My Deployment Manual</b><br/>Turn a build into an actionable checklist: target, itemized cost, performance estimate, risk notes — printable and exportable</td>
  </tr>
</table>

## Languages

The UI ships in **Simplified Chinese and English**. Use the language button in the top bar, or go straight to `?lang=en`. The choice persists in localStorage and keeps `<html lang>` and `hreflang` tags in sync.

| 简体中文 | English |
|---|---|
| <img src="docs/screenshots/01-home.png" width="420" alt="Chinese home"/> | <img src="docs/screenshots/en/01-home.png" width="420" alt="English home"/> |

The implementation is deliberately small: dictionaries in `apps/web/src/i18n/` use the **original Chinese string as the key**, and `t()` returns it unchanged in Chinese — no duplicate zh-CN dictionary to maintain. `scripts/i18n-codemod.mjs` handles bulk extraction and coverage checks:

```bash
node scripts/i18n-codemod.mjs check   # list unextracted / untranslated strings
node scripts/i18n-codemod.mjs apply   # wrap new Chinese strings in t() (idempotent)
```

All **514 UI strings** are bilingual. Switching language reloads the page so module-level constants (route metadata, presets, filter labels) are re-evaluated under the new locale — the same `lang`-parameter behavior as the reference site.

> Scope: this covers **UI copy**. Model, GPU, glossary and lesson **content data is still Chinese only** and is queued for the next batch.

- Product design: [prototype/](prototype/) (interactive prototype; the visual and interaction baseline)
- Design system: [DESIGN.md](DESIGN.md)
- Tech stack: [TECH-STACK.md](TECH-STACK.md)
- Development plan: [DEV-PLAN.md](DEV-PLAN.md)

## Status

| Milestone | Status |
|---|---|
| M0 Project scaffolding | ✅ Done |
| M1 Compute engine | ✅ Done |
| M2 Content & data | ✅ Done |
| M3 DIY builder | ✅ Done |
| M4 Configuration recommender | ✅ Done |
| M5 Polish & launch | ✅ Done |
| M6 Backend P1 | ✅ Done |
| M7 Data automation | ✅ Done |

Content baseline: 9 models · 16 GPUs · 31 parts across 7 categories · 16 glossary terms · 5 learning levels.

Builder: a physical-chassis SVG with 8 slot types · drag / click / keyboard input · live VRAM, power and price · six-axis radar with actionable suggestions · three presets · local autosave · printable manual.

Polish: 97 KB gzipped first load (lazy routes, builder in its own chunk) · all contrast ratios meet AA · a build can be completed by keyboard alone · page-level error boundaries · 21 Playwright E2E checks · a global disclaimer footer.

Data automation (M7): prices imported from CSV are written to a snapshot table and synced to the current price, so every GPU card can say "JD.com · today" or "catalog estimate · no capture date". Out-of-range jumps (>60%) and absurd prices are rejected at import time. An APScheduler job runs a daily freshness check and raises alerts. Share cards are exported as 1200×630 PNGs via canvas, including a VRAM usage bar and the unit prices at save time. Analytics are sent with `sendBeacon`; the `/stats` dashboard answers four questions: how many people use it, do they finish learning, are recommendations adopted, and do shares travel.

Backend (M6): WeCom QR / email code / dev login · saved builds (JSONB state + score snapshot) · random-token share links (read-only, no login) · synced learning progress · `/admin` data console · read-only catalog endpoints with ETag conditional caching.

Recommender: 9 built-in models plus a custom parameter count · four inputs (quantization / context / budget / preference) · three BOM tiers with CPU-to-socket and PSU hard checks and used-market flags · explicit fallbacks for "fewer than three tiers" and "no feasible build" · one-click load into the builder, custom models included.

## Quick Start

```bash
# If symlinks are blocked by a sandbox fs shim, prefix installs with: env -u NODE_OPTIONS
pnpm install
pnpm dev          # http://localhost:5173
```

The frontend points at the backend via `VITE_API_TARGET` (default `http://127.0.0.1:8000`); Vite proxies `/api` there. The backend is optional — anything requiring an account gracefully falls back to local-only mode.

Other commands:

```bash
pnpm build        # build all packages (engine → web)
pnpm lint         # ESLint (shared root config)
pnpm typecheck    # TypeScript checks
pnpm test         # unit tests (vitest)
pnpm e2e          # end-to-end (Playwright, run build first)
```

### Backend only

```bash
cd apps/api
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
# On slow internal networks, add -i https://mirrors.aliyun.com/pypi/simple/

# PostgreSQL is required; spin up a throwaway instance if you don't have one:
docker run -d --name clab-dev-pg -e POSTGRES_USER=clab -e POSTGRES_PASSWORD=clab \
  -e POSTGRES_DB=clab -p 15432:5432 postgres:15-alpine

export DATABASE_URL="postgresql+psycopg://clab:clab@localhost:15432/clab"
export APP_ENV=dev JWT_SECRET=dev-secret ADMIN_PASSWORD=devpass

.venv/bin/alembic upgrade head          # create the 9 tables
.venv/bin/uvicorn app.main:app --reload  # http://127.0.0.1:8000/api/v1/docs
.venv/bin/python -m pytest              # 69 tests (SQLite by default, no PG needed)
```

## Repository Layout

```
.
├── apps/api/                # FastAPI + SQLAlchemy + Alembic
│   ├── app/
│   │   ├── core/            # config, DB sessions, JWT, dependencies, error shapes
│   │   ├── models/          # 9 tables (JSONB snapshots)
│   │   ├── schemas/         # Pydantic I/O (snake_case → camelCase)
│   │   ├── services/        # seed / catalog / auth / builds / pricing / analytics
│   │   ├── api/v1/          # auth / catalog / builds / share / progress / prices / analytics
│   │   ├── jobs/            # APScheduler: price freshness checks + alerts
│   │   ├── cli.py           # ops commands: prices import / status, analytics report
│   │   └── admin.py         # sqladmin console
│   ├── migrations/          # Alembic migrations
│   └── tests/               # pytest (SQLite)
├── apps/web/                # React 18 + Vite + TS
│   └── src/
│       ├── layout/          # app shell (sidebar / topbar)
│       ├── pages/           # route pages (map / catalogs / builder / share / stats …)
│       ├── components/      # feature components + ui primitives
│       ├── hooks/           # useTheme / useProgress / useBuild / useAuth
│       ├── lib/             # pure helpers: formatting, fit checks
│       ├── navigation.ts    # route metadata shared by nav, breadcrumbs, command palette
│       └── styles/          # Tailwind entry + semantic classes
├── docs/screenshots/        # README screenshots (from e2e/_readme_shots.spec.ts)
├── packages/
│   ├── tokens/              # design tokens (CSS variables + Tailwind preset)
│   ├── engine/              # compute engine (pure TS, framework-free)
│   └── data/                # content + zod validation (models/GPUs/parts/glossary/lessons)
└── deploy/                  # Dockerfile + nginx + compose
```

### Why the engine is its own package

VRAM estimates, power draw, scoring, and the recommender solver are used by the builder, model details, and recommender page. Keeping them inside components guarantees drift. As pure functions they can be unit-tested in isolation and reused by scripts later.

### Why data is its own package too

Data is both the UI's content source and the engine's input. Co-locating it with the app tends to produce two model lists — one for rendering, one for computing VRAM. There is now exactly one `ModelRecord` whose fields satisfy both rendering needs and the `ModelSpec` contract.

## Maintaining Prices

Price is the one number users will compare against a store page, so it goes through an auditable pipeline:

```bash
# 1. Get a template (with two real example rows)
docker compose -f deploy/docker-compose.yml exec api python -m app.cli prices template > prices.csv

# 2. Fill it in, then dry-run to see which prices would change
docker compose -f deploy/docker-compose.yml exec -T api sh -c 'cat > /tmp/p.csv' < prices.csv
docker compose -f deploy/docker-compose.yml exec api python -m app.cli prices import /tmp/p.csv --dry-run

# 3. Commit when it looks right
docker compose -f deploy/docker-compose.yml exec api python -m app.cli prices import /tmp/p.csv

# 4. Inspect status: channel, age in days, staleness
docker compose -f deploy/docker-compose.yml exec api python -m app.cli prices status
```

CSV columns: `gpu_id,price_cny,channel,source,captured_at,note`. Only the first two are required.

Three hard rules at import:

1. **Out-of-range rejection**: below ¥100 or above ¥1,000,000 is almost always a typo.
2. **Spike rejection**: a >60% move against the current price is blocked (`--force` overrides) — the classic "one zero missing" error.
3. **Same-day, same-channel overwrite**: fixing a bad entry the same day won't create a duplicate snapshot.

> There is no "automatic JD.com scraper". Store pages have anti-bot controls, and bulk scraping for commercial display violates their terms. A weekly manual import for 16 GPUs is enough; to automate it, implement `PriceProvider.fetch()` — validation and snapshot logic stay untouched.

`PRICE_STALE_DAYS` (default 45) controls the staleness threshold; stale cards and detail views are flagged. A daily 09:00 job logs stale items and pushes to a WeCom group when `ALERT_WEBHOOK` is set.

## Analytics Dashboard

`/stats` (admin only; linked from "My Builds"). Metric definitions:

| Metric | Denominator | Why |
|---|---|---|
| Level completion | People with any learning record | Using all registered users makes the metric fall as sign-ups grow |
| Recommendation adoption | `recommend_view` count | Entering the page logs one view; "Load into builder" logs an apply |
| Share conversion | Share links that actually exist | Using `share_create` events yields nonsense like "0 links opened 12 times" |

No IPs are collected, no raw UA is stored (only an 80-character digest), and only allow-listed events with scalar props are accepted.

## Maintaining Content

Data files: `packages/data/src/{models,gpus,parts,glossary,lessons}.ts`

After any edit, do both:

```bash
pnpm --filter @clab/data test    # schema + cross-record constraints + copy/number reconciliation
pnpm build                        # regenerate dist; web consumes the built output
```

Three validation layers — any failure breaks the build:

1. **Structure** (zod): required fields, unit ranges, `ctxMax` must be a multiple of 1024, `source` must be a URL, `updatedAt` must be `YYYY-MM`.

> `pnpm build` also emits `packages/data/dist/catalog.json` — **the sole seed source for the backend**. Editing TS without rebuilding leaves the API serving stale data ("the endpoint isn't updating").
2. **Relations** (`crossCheck`): globally unique ids, glossary `related` targets must exist, lesson numbers must be contiguous, the largest PSU must handle four of the strongest desktop GPUs.
3. **Number consistency** (tests): figures written into prose such as "weights ≈ 6.8 GB / total ≈ 11.9 GB" are extracted and reconciled with `vramNeed()` at a 0.15 tolerance.

> Layer 3 exists because of a real bug: prose was estimated in decimal GB while the code uses GiB — a 7% gap that produced "14B weights = 8.3 GB" when the truth was 6.8 GB. Errors like that directly mislead purchase decisions.

## Docker Deployment

Three containers: `web` (nginx + static site) · `api` (FastAPI) · `db` (PostgreSQL 15).

```bash
cp deploy/.env.example deploy/.env   # first deploy: at minimum change JWT_SECRET / ADMIN_PASSWORD
pnpm docker:build     # multi-stage build (node → nginx; pip installs)
pnpm docker:up        # start in background, http://localhost:8080 by default
pnpm docker:logs      # tail logs
pnpm docker:down      # stop and remove
```

- Override the port: `CLAB_PORT=9000 pnpm docker:up`
- Slow internal PyPI: `PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ pnpm docker:build`
- The nginx image is configured for SPA fallback, one-year immutable caching of `/assets/*`, no-cache on `index.html`, gzip, basic security headers, a `/healthz` endpoint, and reverse proxying of `/api/` and `/admin` to `api:8000`
- Startup runs migrations and imports `packages/data/dist/catalog.json` (idempotent upsert; safe to restart repeatedly)
- Data lives in the named volume `clab-db`; back it up with `docker exec clab-db pg_dump -U clab clab > backup.sql`
- The scheduler is on by default (`SCHEDULER_ENABLED=true`, daily 09:00 price check). With multiple replicas, enable it on one instance only, or alerts will duplicate

### Data Console

`http://localhost:8080/admin`, using `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Manage models, GPUs, parts and price snapshots; inspect saved builds and share links. **The repository ships a placeholder password `CHANGE_ME_IN_DEPLOY_ENV`; set a real one in `deploy/.env` (gitignored) on first deploy. Leaving it unchanged prints a startup warning.**

### Login Methods

| Method | Requires | When unconfigured |
|---|---|---|
| WeCom QR | `WECOM_CORP_ID` / `WECOM_AGENT_ID` / `WECOM_SECRET` / `WECOM_REDIRECT_URI` | API returns 501; the UI hides the QR entry and explains why |
| Email code | `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | With `APP_ENV=dev` the code is returned to the frontend; `prod` returns 501 |
| Dev login | `APP_ENV != prod` and `ALLOW_DEV_LOGIN=true` | Disabled in production — enforced server-side, not by hiding a button |

## Regenerating Screenshots

Screenshots come from [apps/web/e2e/_readme_shots.spec.ts](apps/web/e2e/_readme_shots.spec.ts), captured from a live deployment at a fixed 1440×960 viewport with the light theme forced:

```bash
E2E_BASE_URL=http://localhost:8080 \
  pnpm --filter @clab/web exec playwright test e2e/_readme_shots.spec.ts

# English screenshots (output to docs/screenshots/en/)
E2E_BASE_URL=http://localhost:8080 SHOT_LANG=en \
  pnpm --filter @clab/web exec playwright test e2e/_readme_shots.spec.ts
```

Output goes to `docs/screenshots/`. Re-run it after UI changes to keep both READMEs in sync.

## Conventions

- Theme: light by default, `data-theme="dark"` switches to dark; all colors come from variables in `packages/tokens/tokens.css` — never hard-code hex values in components
- Styling: prefer Tailwind utilities plus preset semantic names (`bg-surface` / `text-ink-2` / `border-line`)
- Pages: register a new page in `navigation.ts` first; navigation, breadcrumbs, and the command palette pick it up automatically
- Commits: `feat(engine): ...` / `fix(builder): ...` / `docs(plan): ...`
