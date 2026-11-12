import { clamp } from './math.js';
import { buildStats, type ElecOptions } from './stats.js';
import { estimateTps } from './tps.js';
import type {
  Build,
  Catalog,
  Dimension,
  Evaluation,
  Grade,
  ModelSpec,
  Quant,
  Risk,
  Suggestion,
} from './types.js';
import { vramNeed } from './vram.js';

export interface EvaluateInput {
  build: Build;
  model: ModelSpec;
  quant: Quant;
  ctx: number;
  /** 用户预算，用于成本维度 */
  budget: number;
  catalog: Catalog;
  elec?: ElecOptions;
}

/** 六维权重：兼容性是硬门槛，所以给最高 */
export const DIMENSION_WEIGHTS = {
  compat: 0.3,
  perf: 0.25,
  cost: 0.15,
  thermo: 0.15,
  expand: 0.1,
  match: 0.05,
} as const;

export function gradeOf(score: number): Grade {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score > 0) return 'D';
  return '—';
}

/**
 * 评估一套配置。
 * 只回答三件事：装不装得上、跑得好不好、值不值得买。
 */
export function evaluate(input: EvaluateInput): Evaluation {
  const { build, model, quant, ctx, budget, catalog } = input;
  const stats = buildStats(build, catalog, input.elec);
  const need = vramNeed(model, quant, ctx);

  const hasCore = stats.gpus.length > 0 && Boolean(stats.cpu) && Boolean(stats.psu) && Boolean(stats.mobo);
  if (!hasCore) {
    const missing: string[] = [];
    if (stats.gpus.length === 0) missing.push('显卡');
    if (!stats.cpu) missing.push('CPU');
    if (!stats.mobo) missing.push('主板');
    if (!stats.psu) missing.push('电源');

    return {
      empty: true,
      score: 0,
      grade: '—',
      dimensions: [],
      risks: [
        {
          level: 'info',
          title: '还差几个核心部件',
          desc: `缺少：${missing.join('、')}。补齐后就能开始评估。`,
        },
      ],
      suggestions: [
        {
          id: 'preset-balance',
          label: '一键载入「均衡推荐版」跑通流程',
          action: { type: 'apply-preset', preset: 'balance' },
        },
      ],
      stats,
      tps: 0,
      need,
      headroom: -1,
    };
  }

  const psu = stats.psu!;
  const mobo = stats.mobo!;
  const headroom = stats.vramGb > 0 ? (stats.vramGb - need.total) / stats.vramGb : -1;
  const psuLoad = psu.watt > 0 ? stats.powerW / psu.watt : 0;

  const fits = need.total <= stats.vramGb;
  const tps = fits ? estimateTps(model, stats.gpus, quant, ctx) : 0;

  const risks: Risk[] = [];

  /* ---------------- 兼容性 ---------------- */
  let compat = 100;

  if (!fits) {
    compat -= 62;
    risks.push({
      level: 'err',
      title: '显存放不下这个模型',
      desc: `需要 ${need.total.toFixed(1)}GB，你只有 ${stats.vramGb}GB。少 ${(need.total - stats.vramGb).toFixed(1)}GB。`,
    });
  } else if (headroom < 0.1) {
    compat -= 12;
    risks.push({
      level: 'warn',
      title: '显存余量不到 10%',
      desc: '能跑，但长对话可能突然中断。建议留 20% 余量。',
    });
  }

  if (psu.watt < stats.powerW * 1.05) {
    compat -= 42;
    risks.push({
      level: 'err',
      title: '电源带不动',
      desc: `整机约 ${stats.powerW}W，电源只有 ${psu.watt}W，建议 ≥ ${Math.ceil((stats.powerW * 1.3) / 50) * 50}W。`,
    });
  } else if (psu.watt < stats.powerW * 1.25) {
    compat -= 10;
    risks.push({
      level: 'warn',
      title: '电源余量偏紧',
      desc: `负载约 ${Math.round(psuLoad * 100)}%，长期高负载建议换成 ${Math.ceil((stats.powerW * 1.3) / 50) * 50}W。`,
    });
  }

  if (stats.cpu && stats.cpu.socket !== mobo.socket) {
    compat -= 55;
    risks.push({
      level: 'err',
      title: 'CPU 和主板插槽不匹配',
      desc: `${stats.cpu.name} 是 ${stats.cpu.socket} 插槽，${mobo.name} 是 ${mobo.socket}，装不上，换其中一件。`,
    });
  }

  if (mobo.gpuSlots < stats.gpus.length) {
    compat -= 30;
    risks.push({
      level: 'err',
      title: '主板插不下这么多卡',
      desc: `${mobo.name} 只有 ${mobo.gpuSlots} 个卡槽，你放了 ${stats.gpus.length} 张。`,
    });
  }

  if (stats.ramGb < need.weights * 1.2) {
    compat -= 22;
    risks.push({
      level: 'err',
      title: '系统内存不够加载',
      desc: `权重 ${need.weights.toFixed(1)}GB，建议内存 ≥ ${(need.weights * 1.5).toFixed(0)}GB，你现在 ${stats.ramGb}GB。`,
    });
  } else if (stats.ramGb < need.weights * 1.5) {
    compat -= 8;
    risks.push({
      level: 'warn',
      title: '加载会比较慢',
      desc: '内存低于权重 1.5 倍时，加载阶段容易触发磁盘交换。',
    });
  }

  if (!stats.cooling) {
    compat -= 10;
    risks.push({
      level: 'warn',
      title: '还没选散热方案',
      desc: '高功耗显卡长时间满载，机箱风道必须规划好。',
    });
  }

  if (stats.mixed) {
    compat -= 8;
    risks.push({
      level: 'warn',
      title: '混插了不同型号的显卡',
      desc: `多卡并行要求每张卡放等大的分片，实际可用显存按最小那张算：${stats.vramGb}GB，而不是 ${stats.gpus
        .reduce((sum, gpu) => sum + gpu.vramGb, 0)
        .toFixed(0)}GB。`,
    });
  }

  compat = clamp(compat, 0, 100);

  /* ---------------- 性能 ---------------- */
  let perf = clamp(26 + tps * 0.55 + headroom * 26, 0, 100);
  if (!fits) perf = Math.min(perf, 22);
  if (fits && tps < 6) {
    risks.push({
      level: 'warn',
      title: '生成速度偏慢',
      desc: `约 ${tps} tokens/s，读起来会一顿一顿的。`,
    });
  }

  /* ---------------- 成本 ---------------- */
  const ratio = budget > 0 ? stats.priceCny / budget : 0;
  let cost: number;
  if (ratio <= 0.85) cost = 100 - ratio * 8;
  else if (ratio <= 1) cost = 92 - (ratio - 0.85) * 300;
  else cost = Math.max(18, 47 - (ratio - 1) * 90);

  if (ratio > 1) {
    risks.push({
      level: 'warn',
      title: '超出预算',
      desc: `总价 ${Math.round(stats.priceCny)} 元，预算 ${Math.round(budget)} 元，超 ${Math.round(stats.priceCny - budget)} 元。`,
    });
  }

  /* ---------------- 功耗与散热 ---------------- */
  let thermo: number;
  if (psuLoad > 0.92) thermo = 26;
  else if (psuLoad > 0.8) thermo = 58;
  else if (psuLoad >= 0.55) thermo = 94;
  else if (psuLoad >= 0.4) thermo = 84;
  else thermo = 70;

  if (stats.cooling && stats.cooling.noiseDb >= 50) {
    thermo -= 18;
    risks.push({
      level: 'warn',
      title: '噪声可能比较明显',
      desc: `${stats.cooling.name} 满载约 ${stats.cooling.noiseDb}dB，建议换 360 水冷或更大机箱。`,
    });
  }
  if (stats.powerW > 900) thermo -= 10;
  thermo = clamp(thermo, 0, 100);

  /* ---------------- 扩展性 ---------------- */
  const freeGpuSlots = Math.max(0, mobo.gpuSlots - stats.gpus.length);
  const freeRamSlots = Math.max(0, mobo.ramSlots - stats.rams.length);
  const expand = clamp(35 + freeGpuSlots * 18 + freeRamSlots * 7 + (psuLoad < 0.6 ? 12 : 0), 0, 100);

  /* ---------------- 学习匹配 ---------------- */
  let match = 78;
  if (fits && headroom >= 0.15 && stats.priceCny <= budget) match = 96;
  if (!fits) match = 40;
  if (budget > 0 && stats.priceCny > budget * 1.3) match -= 18;
  match = clamp(match, 0, 100);

  const dimensions: Dimension[] = [
    { key: 'compat', label: '兼容性', score: compat, weight: DIMENSION_WEIGHTS.compat, hint: '能装在一起吗？' },
    { key: 'perf', label: '性能', score: perf, weight: DIMENSION_WEIGHTS.perf, hint: '跑得动吗？快不快？' },
    { key: 'cost', label: '成本', score: cost, weight: DIMENSION_WEIGHTS.cost, hint: '贵不贵？' },
    { key: 'thermo', label: '功耗散热', score: thermo, weight: DIMENSION_WEIGHTS.thermo, hint: '会不会吵 / 热？' },
    { key: 'expand', label: '扩展性', score: expand, weight: DIMENSION_WEIGHTS.expand, hint: '以后还能升级吗？' },
    { key: 'match', label: '学习匹配', score: match, weight: DIMENSION_WEIGHTS.match, hint: '适合你现在吗？' },
  ];

  const score = Math.round(
    dimensions.reduce((sum, dim) => sum + dim.score * dim.weight, 0),
  );

  if (fits && headroom >= 0.2) {
    risks.push({
      level: 'ok',
      title: '显存余量充足',
      desc: `占用 ${need.total.toFixed(1)} / ${stats.vramGb}GB，剩 ${Math.round(headroom * 100)}%，长对话很稳。`,
    });
  }

  return {
    empty: false,
    score,
    grade: gradeOf(score),
    dimensions,
    risks,
    suggestions: buildSuggestions({ input, stats, need, headroom, fits, psu }),
    stats,
    tps,
    need,
    headroom,
  };
}

interface SuggestionContext {
  input: EvaluateInput;
  stats: ReturnType<typeof buildStats>;
  need: ReturnType<typeof vramNeed>;
  headroom: number;
  fits: boolean;
  psu: NonNullable<ReturnType<typeof buildStats>['psu']>;
}

function buildSuggestions(ctx: SuggestionContext): Suggestion[] {
  const { input, stats, need, headroom, fits, psu } = ctx;
  const { catalog, budget, quant, ctx: contextTokens } = input;
  const out: Suggestion[] = [];

  if (!fits) {
    if (quant !== 'int4') {
      out.push({
        id: 'quant-int4',
        label: '量化降到 INT4，显存占用省一半',
        action: { type: 'set-quant', quant: 'int4' },
      });
    }
    if (contextTokens > 4096) {
      out.push({
        id: 'ctx-4096',
        label: `把上下文从 ${contextTokens / 1024}K 降到 4K`,
        action: { type: 'set-ctx', ctx: 4096 },
      });
    }
    out.push({
      id: 'goto-hardware',
      label: '换成显存更大的显卡',
      action: { type: 'navigate', to: '/hardware' },
    });
  } else if (headroom < 0.2 && contextTokens > 4096) {
    out.push({
      id: 'ctx-4096',
      label: '把上下文降到 4K，留出 20% 余量',
      action: { type: 'set-ctx', ctx: 4096 },
    });
  }

  if (psu.watt < stats.powerW * 1.3) {
    const needed = Math.ceil((stats.powerW * 1.3) / 50) * 50;
    const maxAvailable = catalog.psus.reduce((max, item) => Math.max(max, item.watt), 0);

    if (maxAvailable >= needed) {
      out.push({
        id: 'psu-auto',
        label: `换 ${needed}W 电源，别让电源长期满载`,
        action: { type: 'auto-psu' },
      });
    } else {
      // 目录里根本没有这么大的电源。这时给「换电源」按钮等于骗人：
      // 点下去只会换成仍然不够的最大号，用户以为问题解决了。
      out.push({
        id: 'psu-too-big',
        label: `这套要 ${needed}W，目录里最大只有 ${maxAvailable}W——减一张卡，或换服务器电源方案`,
        action: { type: 'navigate', to: '/hardware' },
      });
    }
  }

  if (stats.ramGb < need.weights * 1.5) {
    // 内存槽插满了就加不了，只能换单条更大的
    const slotLimit = stats.mobo?.ramSlots ?? 4;
    const label =
      stats.rams.length >= slotLimit
        ? `内存槽已插满（${slotLimit} 条），换成单条更大的内存`
        : '内存加到权重 1.5 倍以上，加载更快';
    out.push({ id: 'ram-auto', label, action: { type: 'auto-ram' } });
  }

  if (!stats.cooling) {
    const quieter = [...catalog.coolings]
      .filter((cooling) => cooling.noiseDb <= 36)
      .sort((a, b) => a.priceCny - b.priceCny)[0];
    if (quieter) {
      out.push({
        id: 'cooling',
        label: `加一个${quieter.name}，压住长时间满载`,
        action: { type: 'set-cooling', coolingId: quieter.id },
      });
    }
  }

  if (budget > 0 && stats.priceCny > budget) {
    out.push({
      id: 'preset-save',
      label: '看看「省钱入门版」，同样能跑起来',
      action: { type: 'apply-preset', preset: 'save' },
    });
  }

  if (out.length === 0) {
    out.push({
      id: 'goto-manual',
      label: '这套已经很均衡了，去生成说明书并开始部署',
      action: { type: 'navigate', to: '/manual' },
    });
  }

  return out;
}
