import { describe, expect, it } from 'vitest';
import { buildStats, EMPTY_BUILD, estimateTps, recommend, vramNeed } from '@clab/engine';
import {
  CATALOG,
  DATASET,
  GLOSSARY_LIST,
  GPUS_LIST,
  LESSONS_LIST,
  MODELS_LIST,
  gpuById,
  modelById,
  validateDataset,
} from '../src/index.js';
import { datasetSchema } from '../src/schema.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('数据集自洽性', () => {
  it('能通过全部校验', () => {
    expect(() => validateDataset(clone(DATASET))).not.toThrow();
  });

  it('数量达到 M2 验收线（≥6 模型 / ≥14 显卡）', () => {
    expect(MODELS_LIST.length).toBeGreaterThanOrEqual(6);
    expect(GPUS_LIST.length).toBeGreaterThanOrEqual(14);
    expect(GLOSSARY_LIST.length).toBeGreaterThanOrEqual(8);
    expect(LESSONS_LIST).toHaveLength(5);
  });

  it('每条数据都带来源与更新时间（估算值可追溯）', () => {
    for (const item of [...MODELS_LIST, ...GPUS_LIST]) {
      expect(item.source).toMatch(/^https?:\/\//);
      expect(item.updatedAt).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it('id 查询稳定且大小写敏感（id 会进 URL）', () => {
    expect(modelById('qwen25-14b')?.paramsB).toBe(14.7);
    expect(modelById('Qwen25-14B')).toBeUndefined();
    expect(gpuById('rtx3090')?.vramGb).toBe(24);
  });

  it('覆盖多个厂商，不是单一生态', () => {
    const vendors = new Set(MODELS_LIST.map((m) => m.vendor));
    expect(vendors.size).toBeGreaterThanOrEqual(4);
    expect(new Set(GPUS_LIST.map((g) => g.vendor))).toContain('AMD');
    expect(GPUS_LIST.some((g) => g.gpuClass === '数据中心')).toBe(true);
  });
});

describe('数据能直接喂给计算内核', () => {
  it('每个模型 × 三种量化 × 满上下文都能算出合理显存', () => {
    for (const model of MODELS_LIST) {
      for (const quant of ['fp16', 'int8', 'int4'] as const) {
        const need = vramNeed(model, quant, model.ctxMax);
        expect(Number.isFinite(need.total)).toBe(true);
        expect(need.total).toBeGreaterThan(need.weights);
        expect(need.weights).toBeGreaterThan(0);
      }
    }
  });

  it('空配置不会崩', () => {
    const stats = buildStats(EMPTY_BUILD, CATALOG);
    expect(stats.priceCny).toBe(0);
  });

  it('每个模型都能跑出推荐结果（要么有方案，要么明确 limited）', () => {
    for (const model of MODELS_LIST) {
      const result = recommend({
        model,
        quant: 'int4',
        ctx: Math.min(model.ctxMax, 8192),
        budget: 40000,
        pref: 'balance',
        catalog: CATALOG,
      });
      expect(Array.isArray(result.tiers)).toBe(true);
      if (result.tiers.length === 0) expect(result.limited).toBe(true);
      for (const tier of result.tiers) {
        expect(tier.vramGb).toBeGreaterThan(result.need.total);
        expect(tier.psu.watt).toBeGreaterThanOrEqual(tier.powerW);
      }
    }
  });
});

describe('坏数据必须被拦住', () => {
  it('缺必填字段时报错并指出路径', () => {
    const bad = clone(DATASET) as unknown as { models: Array<Record<string, unknown>> };
    delete bad.models[0].metaphor;
    expect(() => validateDataset(bad)).toThrow(/metaphor/);
  });

  it('ctxMax 不是 1024 的倍数时报错', () => {
    const bad = clone(DATASET);
    bad.models[0].ctxMax = 30000;
    expect(() => validateDataset(bad)).toThrow(/1024/);
  });

  it('显存写成负数时报错', () => {
    const bad = clone(DATASET);
    bad.gpus[0].vramGb = -1;
    expect(() => validateDataset(bad)).toThrow(/vramGb/);
  });

  it('source 不是 URL 时报错', () => {
    const bad = clone(DATASET);
    bad.gpus[0].source = '内部资料';
    expect(() => validateDataset(bad)).toThrow(/source/);
  });

  it('重复 id 时报错', () => {
    const bad = clone(DATASET);
    bad.gpus[1].id = bad.gpus[0].id;
    expect(() => validateDataset(bad)).toThrow(/重复 id/);
  });

  it('术语引用了不存在的关联时报错', () => {
    const bad = clone(DATASET);
    bad.glossary[0].related = ['not-exist'];
    expect(() => validateDataset(bad)).toThrow(/not-exist/);
  });

  it('关卡编号不连续时报错', () => {
    const bad = clone(DATASET);
    bad.lessons[1].level = 5;
    expect(() => validateDataset(bad)).toThrow(/关卡编号不连续/);
  });

  it('最大电源带不动四卡时报错', () => {
    const bad = clone(DATASET);
    const maxWatt = Math.max(...bad.parts.psus.map((p) => p.watt));
    bad.parts.psus = bad.parts.psus.map((p) => ({ ...p, watt: Math.min(p.watt, 800) }));
    expect(() => validateDataset(bad)).toThrow(/带不动/);
    expect(maxWatt).toBeGreaterThan(800);
  });

  it('模型少于 6 条时报错', () => {
    const bad = clone(DATASET);
    bad.models = bad.models.slice(0, 3);
    expect(() => validateDataset(bad)).toThrow(/至少 6 条/);
  });
});

describe('schema 结构完整性', () => {
  it('数据字段与 schema 一一对应，没有多余字段被静默丢弃', () => {
    const parsed = datasetSchema.parse(clone(DATASET));
    expect(Object.keys(parsed.models[0]).sort()).toEqual(Object.keys(DATASET.models[0]).sort());
    expect(Object.keys(parsed.gpus[0]).sort()).toEqual(Object.keys(DATASET.gpus[0]).sort());
  });
});

describe('显卡文案里的数字必须由内核算得出来', () => {
  // 这几条是「会直接影响购买决策」的说法，绑成断言防止后续改公式后文案失真
  const seventyB = () => modelById('llama33-70b')!;

  it('70B INT4 8K 需要 51.4G —— 所以 48G 卡装不下', () => {
    const need = vramNeed(seventyB(), 'int4', 8192).total;
    expect(need).toBeCloseTo(51.4, 1);
    expect(need).toBeGreaterThan(gpuById('a6000')!.vramGb);
  });

  it('70B FP16 8K 需要 184G —— 所以 141G 也不够', () => {
    const need = vramNeed(seventyB(), 'fp16', 8192).total;
    expect(need).toBeCloseTo(184, 0);
    expect(need).toBeGreaterThan(gpuById('h200-141')!.vramGb);
  });

  it('H200 141G 能跑 70B INT4 的 64K 上下文', () => {
    const need = vramNeed(seventyB(), 'int4', 65536).total;
    expect(need).toBeLessThan(gpuById('h200-141')!.vramGb);
  });

  it('H100 跑 70B INT4 8K 约 50 tokens/s', () => {
    expect(estimateTps(seventyB(), [gpuById('h100-80')!], 'int4', 8192)).toBe(50);
  });

  it('A100 带宽约为消费级旗舰的两倍（不是三倍）', () => {
    const ratio = gpuById('a100-80')!.bandwidth / gpuById('rtx4090')!.bandwidth;
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.4);
  });

  it('每张桌面卡都存在能跑起来的档位（不会全是「跑不动」）', () => {
    for (const gpu of GPUS_LIST.filter((item) => item.gpuClass !== '数据中心')) {
      const fits = MODELS_LIST.filter(
        (model) => vramNeed(model, 'int4', 8192).total <= gpu.vramGb * 0.85,
      );
      expect(fits.length, `${gpu.name} 连 7B 都跑不动`).toBeGreaterThan(0);
    }
  });
});

describe('模型文案里的显存数字与内核一致', () => {
  // 文案是手写的自然语言，最容易在公式调整后悄悄过时。
  // 这里把「权重约 X GB / 合计约 X GB」抽出来跟内核对账，容差 0.15（四舍五入）。
  it('每条 real 文案的权重与合计都在误差范围内', () => {
    for (const model of MODELS_LIST) {
      const need = vramNeed(model, 'int4', Math.min(8192, model.ctxMax));

      const weightHit = /权重约 ([\d.]+)GB/.exec(model.real);
      if (weightHit) {
        const claimed = Number(weightHit[1]);
        expect(
          Math.abs(claimed - need.weights),
          `${model.id} 文案写权重 ${claimed}G，实际 ${need.weights.toFixed(1)}G`,
        ).toBeLessThan(0.15);
      }

      const totalHit = /(?:合计|总共)约 ([\d.]+)GB/.exec(model.real);
      if (totalHit) {
        const claimed = Number(totalHit[1]);
        expect(
          Math.abs(claimed - need.total),
          `${model.id} 文案写合计 ${claimed}G，实际 ${need.total.toFixed(1)}G`,
        ).toBeLessThan(0.15);
      }
    }
  });

  it('术语表 KV Cache 误区里的数字与内核一致', () => {
    const model = modelById('qwen25-14b')!;
    const at32k = vramNeed(model, 'int4', 32768);
    const entry = GLOSSARY_LIST.find((item) => item.id === 'kv-cache')!;

    const weightHit = /权重只有 ([\d.]+)GB/.exec(entry.mistake);
    const kvHit = /KV Cache 要 ([\d.]+)GB/.exec(entry.mistake);

    expect(weightHit).not.toBeNull();
    expect(kvHit).not.toBeNull();
    expect(Math.abs(Number(weightHit![1]) - at32k.weights)).toBeLessThan(0.15);
    expect(Math.abs(Number(kvHit![1]) - at32k.kvCache)).toBeLessThan(0.15);
  });
});

describe('货源状态', () => {
  it('每张卡都有货源状态，且二手卡被正确标出', () => {
    for (const gpu of GPUS_LIST) {
      expect(['new', 'used', 'channel']).toContain(gpu.condition);
    }
    // 3090 是典型矿卡，必须标二手
    expect(GPUS_LIST.find((g) => g.id === 'rtx3090')?.condition).toBe('used');
    // 3060 主价是全新，只是备注里提到二手，不能被误标
    expect(GPUS_LIST.find((g) => g.id === 'rtx3060')?.condition).toBe('new');
    // 数据中心卡走渠道/整机，不能标全新零售
    expect(GPUS_LIST.find((g) => g.id === 'h100-80')?.condition).toBe('channel');
  });

  it('货源状态与价格说明不矛盾', () => {
    for (const gpu of GPUS_LIST) {
      if (gpu.condition === 'new') {
        expect(gpu.priceNote, `${gpu.id} 标全新但价格说明写着二手`).not.toMatch(/^二手/);
      }
      if (gpu.condition === 'used') {
        expect(gpu.priceNote, `${gpu.id} 标二手但价格说明没提`).toMatch(/二手/);
      }
    }
  });
});

describe('插槽生态自洽', () => {
  it('每颗 CPU 的插槽都有对应主板，否则推荐会永远配不出方案', () => {
    for (const cpu of DATASET.parts.cpus) {
      const matches = DATASET.parts.mobos.filter((mobo) => mobo.socket === cpu.socket);
      expect(matches.length, `${cpu.name}（${cpu.socket}）没有任何主板可用`).toBeGreaterThan(0);
    }
  });

  it('每个插槽至少有一颗 CPU 和一块主板，不存在孤立生态', () => {
    const sockets = new Set(DATASET.parts.mobos.map((mobo) => mobo.socket));
    for (const socket of sockets) {
      expect(
        DATASET.parts.cpus.some((cpu) => cpu.socket === socket),
        `${socket} 有主板但没有 CPU`,
      ).toBe(true);
    }
  });

  it('多卡方案需要高卡槽主板，目录里必须真的有', () => {
    expect(DATASET.parts.mobos.some((mobo) => mobo.gpuSlots >= 2)).toBe(true);
    expect(DATASET.parts.mobos.some((mobo) => mobo.gpuSlots >= 4)).toBe(true);
  });
});
