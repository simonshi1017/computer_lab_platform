"""运维命令行。

单价数据的维护者是运维/运营，不是开发者。所以他们需要一个**不需要打开
数据库客户端**的入口：导入 CSV、看当前价格状态、出事时有一份模板可抄。

用法：
    python -m app.cli prices template > prices.csv
    python -m app.cli prices import prices.csv --dry-run
    python -m app.cli prices import prices.csv
    python -m app.cli prices status
    python -m app.cli analytics report --days 7
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from app.core.config import settings, setup_logging
from app.core.db import SessionLocal, engine, init_models


def _print_table(headers: list[str], rows: list[list[str]]) -> None:
    """极简表格。不引 rich/tabulate：多一个依赖只为几条命令不值得。"""
    widths = [len(h) for h in headers]
    for row in rows:
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(cell))
    line = "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(line)
    print("  ".join("-" * widths[i] for i in range(len(headers))))
    for row in rows:
        print("  ".join(row[i].ljust(widths[i]) for i in range(len(row))))


async def cmd_prices_template(_: argparse.Namespace) -> int:
    from app.services.pricing import csv_template

    print(csv_template(), end="")
    return 0


async def cmd_prices_import(args: argparse.Namespace) -> int:
    from app.services.pricing import CsvPriceProvider, apply_prices

    path = Path(args.file)
    if not path.exists():
        print(f"文件不存在：{path}", file=sys.stderr)
        return 2

    text = path.read_text(encoding="utf-8-sig")
    try:
        rows = await CsvPriceProvider(text).fetch()
    except ValueError as exc:
        print(f"CSV 解析失败：{exc}", file=sys.stderr)
        return 2

    if not rows:
        print("CSV 里没有有效数据行", file=sys.stderr)
        return 2

    async with SessionLocal() as session:
        report = await apply_prices(session, rows, dry_run=args.dry_run, force=args.force)

    # 报告按「有变动」优先：运维最关心的是哪几个价变了，而不是全部 16 行
    rows_out: list[list[str]] = []
    for row in sorted(report.rows, key=lambda r: (r.action == "reject", r.old_price == r.new_price)):
        delta = "—" if row.delta_pct is None else f"{row.delta_pct:+.1%}"
        mark = {"reject": "✗ 拒绝", "update": "~ 修正", "insert": "+ 新增"}[row.action]
        rows_out.append([
            row.gpu_id,
            row.name,
            "—" if row.old_price is None else str(row.old_price),
            str(row.new_price),
            delta,
            row.channel,
            mark,
            row.reason,
        ])

    _print_table(["id", "名称", "原价", "新价", "变动", "渠道", "动作", "说明"], rows_out)
    print(
        f"\n{'[预演] ' if report.dry_run else ''}"
        f"共 {len(report.rows)} 行：写入 {report.written}、拒绝 {report.rejected}、实际变动 {report.changed}"
    )
    if report.dry_run:
        print("预演模式未写入数据库。确认无误后去掉 --dry-run 重新执行。")
    return 0 if report.rejected == 0 else 1


async def cmd_prices_status(_: argparse.Namespace) -> int:
    from app.services.pricing import latest_prices, stale_summary

    async with SessionLocal() as session:
        items = await latest_prices(session)
        summary = await stale_summary(session)

    rows = []
    for item in items:
        age = "—" if item["ageDays"] is None else f"{item['ageDays']:.0f} 天"
        rows.append([
            item["gpuId"],
            str(item["priceCny"]),
            item["channel"],
            age,
            "陈旧" if item["stale"] else "新鲜",
            (item["source"] or "")[:48],
        ])
    _print_table(["id", "当前价", "渠道", "距今", "状态", "来源"], rows)
    print(
        f"\n共 {summary['total']} 张，陈旧 {summary['staleCount']} 张，"
        f"从未采集 {summary['missingCount']} 张，阈值 {summary['thresholdDays']} 天"
    )
    return 0


async def cmd_analytics_report(args: argparse.Namespace) -> int:
    from app.services.analytics import overview

    async with SessionLocal() as session:
        data = await overview(session, days=args.days)
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


async def _ensure_ready() -> None:
    """建表 + 导入目录。

    CLI 可能先于 API 启动（比如首次部署时运维先导价格），空库里找不到
    gpu_id 会让每条导入都被判成「目录里没有这个显卡」。seed 是幂等的，
    顺手做一次，比让运维去猜「为什么 id 都对却全被拒」好得多。
    """
    from app.services.seed import seed_catalog

    await init_models()
    async with SessionLocal() as session:
        await seed_catalog(session)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="clab", description="算力科普平台运维命令")
    sub = parser.add_subparsers(dest="group", required=True)

    prices = sub.add_parser("prices", help="价格数据维护")
    prices_sub = prices.add_subparsers(dest="action", required=True)

    template = prices_sub.add_parser("template", help="输出 CSV 模板")
    template.set_defaults(func=cmd_prices_template)

    imp = prices_sub.add_parser("import", help="导入价格 CSV")
    imp.add_argument("file")
    imp.add_argument("--dry-run", action="store_true", help="只出报告，不写库")
    imp.add_argument("--force", action="store_true", help="允许超过 60% 的剧烈变动")
    imp.set_defaults(func=cmd_prices_import)

    status = prices_sub.add_parser("status", help="查看当前价格与新鲜度")
    status.set_defaults(func=cmd_prices_status)

    analytics = sub.add_parser("analytics", help="埋点数据")
    analytics_sub = analytics.add_subparsers(dest="action", required=True)
    report = analytics_sub.add_parser("report", help="输出聚合报表 JSON")
    report.add_argument("--days", type=int, default=7)
    report.set_defaults(func=cmd_analytics_report)

    return parser


async def _run(args: argparse.Namespace) -> int:
    setup_logging(settings.log_level)
    await _ensure_ready()
    try:
        return await args.func(args)
    finally:
        await engine.dispose()


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == "__main__":
    main()
