import {
  buildStats,
  describeTimeline,
  evaluate,
  vramNeed,
  type Build,
  type Catalog,
  type ModelSpec,
  type Quant,
} from '@clab/engine';
import { tpsToChars } from './format';

/**
 * 方案对比的数据层。
 *
 * 只做一件事：把 N 套配置喂进同一套口径（同模型、同量化、同上下文、同预算），
 * 输出一张可以直接对比、也可以直接导出 CSV 的表。
 *
 * 为什么不复用评估面板的组件：评估面板面向「一套方案怎么改进」，
 * 这里是「几套方案差在哪」，两者的问题不同。但计算必须共用
 * `evaluate()` / `estimateTps()`，否则对比表的数字和组装台对不上。
 */

export type CompareSource = 'preset' | 'scenario' | 'current';

export interface CompareCandidate {
  /** 稳定 id，用于勾选与埋点 */
  id: string;
  name: string;
  source: CompareSource;
  /** 卡片上的一行说明，例如「省钱入门版 · 9B 单卡」 */
  note: string;
  build: Build;
}

/** 一行指标：values 是对齐到列显示值，raw 用于判定谁最好 */
export interface CompareRow {
  key: string;
  label: string;
  values: string[];
  /** 原始数值；null 表示这行不参与「最优」高亮（例如文字行） */
  raw: Array<number | null>;
  /** high = 越大越好，low = 越小越好，null = 不比较 */
  better: 'high' | 'low' | null;
  /** 数值行里最小的下标集合（并列都算）；没有可比数据时为空 */
  best: number[];
  /**
   * 这一行需要 UI 组句（单位后缀随语言变）。
   * 数值行直接显示 values；risks / chars / headroom 由页面按语言拼。
   */
  format?: 'risks' | 'chars' | 'headroom';
  /** 组句用的原始数据，按列对齐 */
  extra?: Array<{ errors?: number; warns?: number }>;
}

export interface Comparison {
  columns: CompareCandidate[];
  rows: CompareRow[];
  needTotal: number;
}

function bestIndexes(raw: Array<number | null>, better: 'high' | 'low' | null): number[] {
  if (!better) return [];
  const values = raw.filter((value): value is number => value !== null);
  if (values.length < 2) return [];
  const target = better === 'high' ? Math.max(...values) : Math.min(...values);
  return raw.map((value, index) => (value === target ? index : -1)).filter((index) => index >= 0);
}

const fmtYuan = (value: number): string => `¥${Math.round(value).toLocaleString('zh-CN')}`;

export interface CompareInput {
  candidates: CompareCandidate[];
  model: ModelSpec;
  quant: Quant;
  ctx: number;
  budget: number;
  catalog: Catalog;
}

export function compareBuilds(input: CompareInput): Comparison {
  const { candidates, model, quant, ctx, budget, catalog } = input;
  const need = vramNeed(model, quant, ctx);

  const evaluated = candidates.map((candidate) => {
    const stats = buildStats(candidate.build, catalog);
    const evaluation = evaluate({ build: candidate.build, model, quant, ctx, budget, catalog });
    const timeline = describeTimeline({ model, quant, ctx, gpus: stats.gpus });
    const gpuLabel =
      stats.gpus.length === 0
        ? '—'
        : stats.gpus.length === 1
          ? stats.gpus[0].name
          : `${stats.gpus[0].name} ×${stats.gpus.length}`;

    return { candidate, stats, evaluation, timeline, gpuLabel };
  });

  const rows: CompareRow[] = [];

  const push = (
    key: string,
    label: string,
    values: string[],
    raw: Array<number | null>,
    better: 'high' | 'low' | null = null,
  ) => {
    rows.push({ key, label, values, raw, better, best: bestIndexes(raw, better) });
  };

  push(
    'gpu',
    '显卡',
    evaluated.map((item) => item.gpuLabel),
    [],
  );
  push(
    'vram',
    '显存合计',
    evaluated.map((item) => (item.stats.vramGb > 0 ? `${item.stats.vramGb}GB` : '—')),
    evaluated.map((item) => item.stats.vramGb || null),
    'high',
  );
  push(
    'price',
    '整机价格',
    evaluated.map((item) => fmtYuan(item.stats.priceCny)),
    evaluated.map((item) => item.stats.priceCny || null),
    'low',
  );
  push(
    'power',
    '整机功耗',
    evaluated.map((item) => `${Math.round(item.stats.powerW)}W`),
    evaluated.map((item) => item.stats.powerW || null),
    'low',
  );
  push(
    'tps',
    '解码速度',
    evaluated.map((item) => `${item.timeline.decodeTps} tokens/s`),
    evaluated.map((item) => item.timeline.decodeTps || null),
    'high',
  );
  push(
    'ttft',
    '首字延迟',
    evaluated.map((item) => {
      if (item.timeline.totalMs <= 0) return '—';
      const ms = item.timeline.prefillMs;
      return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
    }),
    evaluated.map((item) => (item.timeline.totalMs > 0 ? item.timeline.prefillMs : null)),
    'low',
  );
  rows.push({
    key: 'headroom',
    label: '显存余量',
    values: evaluated.map(() => ''),
    raw: evaluated.map((item) => (item.stats.vramGb > 0 ? Math.round(item.evaluation.headroom * 100) : null)),
    better: 'high',
    best: [],
    format: 'headroom',
  });
  rows[rows.length - 1].best = bestIndexes(rows[rows.length - 1].raw, 'high');
  push(
    'score',
    '六维总分',
    evaluated.map((item) => (item.evaluation.empty ? '—' : `${item.evaluation.score}（${item.evaluation.grade}）`)),
    evaluated.map((item) => (item.evaluation.empty ? null : item.evaluation.score)),
    'high',
  );

  // 六个维度分行，方便看「哪套赢在成本、哪套赢在散热」
  const DIMENSIONS = [
    { key: 'compat', label: '兼容性' },
    { key: 'perf', label: '性能' },
    { key: 'cost', label: '成本' },
    { key: 'thermo', label: '功耗散热' },
    { key: 'expand', label: '扩展性' },
    { key: 'match', label: '学习匹配' },
  ];
  for (const dimension of DIMENSIONS) {
    push(
      `dim-${dimension.key}`,
      dimension.label,
      evaluated.map((item) => {
        const found = item.evaluation.dimensions.find((dim) => dim.key === dimension.key);
        return found ? String(Math.round(found.score)) : '—';
      }),
      evaluated.map((item) => {
        const found = item.evaluation.dimensions.find((dim) => dim.key === dimension.key);
        return found ? found.score : null;
      }),
      'high',
    );
  }

  // 文字行（不比较）：风险数量与主要风险，用来看「省的钱是不是省在隐患上」
  rows.push({
    key: 'risks',
    label: '风险提示',
    values: evaluated.map(() => ''),
    raw: [],
    better: null,
    best: [],
    format: 'risks',
    extra: evaluated.map((item) => ({
      errors: item.evaluation.risks.filter((risk) => risk.level === 'err').length,
      warns: item.evaluation.risks.filter((risk) => risk.level === 'warn').length,
    })),
  });

  rows.push({
    key: 'chars',
    label: '每秒汉字',
    values: evaluated.map(() => ''),
    raw: evaluated.map((item) => (item.timeline.decodeTps > 0 ? tpsToChars(item.timeline.decodeTps) : null)),
    better: 'high',
    best: [],
    format: 'chars',
  });
  rows[rows.length - 1].best = bestIndexes(rows[rows.length - 1].raw, 'high');

  return { columns: candidates, rows, needTotal: need.total };
}

/**
 * CSV 导出：首行是方案名，第一列是指标名。带 BOM，Excel 打开不乱码。
 * renderCell 由页面传入，保证导出内容与屏幕上的语言一致。
 */
export function toCsv(
  comparison: Comparison,
  targetName: string,
  renderCell?: (row: CompareRow, index: number) => string,
): string {
  const header = ['指标', ...comparison.columns.map((column) => column.name)];
  const escape = (cell: string) => {
    const text = cell.replace(/"/g, '""');
    return /[",\n]/.test(text) ? `"${text}"` : text;
  };
  const lines = [
    [`目标：${targetName}`],
    header.map(escape).join(','),
    ...comparison.rows.map((row) =>
      [row.label, ...row.values.map((value, index) => renderCell?.(row, index) ?? value)]
        .map(escape)
        .join(','),
    ),
  ];
  return `\uFEFF${lines.map((line) => (Array.isArray(line) ? line.join(',') : line)).join('\n')}\n`;
}
