import { describe, expect, it } from 'vitest';
import { DIMENSION_WEIGHTS, evaluate } from '../src/score.js';
import { EMPTY_BUILD } from '../src/types.js';
import { BALANCE_BUILD, CATALOG, MODELS } from './fixtures.js';

const baseInput = {
  build: BALANCE_BUILD,
  model: MODELS.qwen14b,
  quant: 'int4' as const,
  ctx: 8192,
  budget: 25000,
  catalog: CATALOG,
};

describe('六维评估', () => {
  it('均衡版跑 14B / INT4 / 8K：84 分 A 级（与原型一致）', () => {
    const result = evaluate(baseInput);
    expect(result.empty).toBe(false);
    expect(result.score).toBe(84);
    expect(result.grade).toBe('A');
    expect(result.tps).toBe(46);
  });

  it('六个维度权重之和为 1', () => {
    const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('兼容性满分时不出现红色风险', () => {
    const result = evaluate(baseInput);
    const compat = result.dimensions.find((d) => d.key === 'compat');
    expect(compat?.score).toBe(100);
    expect(result.risks.some((risk) => risk.level === 'err')).toBe(false);
  });

  it('显存放不下时：兼容性重扣 + 红色风险 + 速度归零', () => {
    const result = evaluate({ ...baseInput, ctx: 32768, build: { ...BALANCE_BUILD, gpuIds: ['rtx3060'] } });
    expect(result.tps).toBe(0);
    expect(result.score).toBeLessThan(60);
    expect(result.grade).toBe('D');
    expect(result.risks.some((risk) => risk.level === 'err' && risk.title.includes('显存'))).toBe(true);
    expect(result.headroom).toBeLessThan(0);
  });

  it('放不下时给出可执行的下一步（降上下文）', () => {
    const result = evaluate({ ...baseInput, ctx: 32768, build: { ...BALANCE_BUILD, gpuIds: ['rtx3060'] } });
    const ctxSuggestion = result.suggestions.find((s) => s.action.type === 'set-ctx');
    expect(ctxSuggestion).toBeDefined();
    if (ctxSuggestion?.action.type === 'set-ctx') {
      expect(ctxSuggestion.action.ctx).toBe(4096);
    }
  });

  it('核心部件不全时返回空评估，并提示补件', () => {
    const result = evaluate({ ...baseInput, build: EMPTY_BUILD });
    expect(result.empty).toBe(true);
    expect(result.grade).toBe('—');
    expect(result.score).toBe(0);
    expect(result.risks[0]?.title).toContain('还差');
    expect(result.suggestions[0]?.action.type).toBe('apply-preset');
  });

  it('电源不足会被判为硬性不兼容', () => {
    const result = evaluate({
      ...baseInput,
      build: { ...BALANCE_BUILD, gpuIds: ['rtx5090'], psuId: 'psu650' },
    });
    expect(result.risks.some((risk) => risk.level === 'err' && risk.title.includes('电源'))).toBe(true);
    const compat = result.dimensions.find((d) => d.key === 'compat');
    expect(compat && compat.score < 70).toBe(true);
  });

  it('超出预算时成本维度下降并给出提示', () => {
    const result = evaluate({ ...baseInput, budget: 12000 });
    const cost = result.dimensions.find((d) => d.key === 'cost');
    expect(cost && cost.score < 60).toBe(true);
    expect(result.risks.some((risk) => risk.title.includes('预算'))).toBe(true);
  });

  it('显存余量充足时会给出绿色确认', () => {
    const result = evaluate(baseInput);
    expect(result.risks.some((risk) => risk.level === 'ok')).toBe(true);
  });
});

describe('建议必须可兑现', () => {
  const fourCards = {
    ...baseInput,
    build: { ...BALANCE_BUILD, gpuIds: ['rtx5090', 'rtx5090', 'rtx5090', 'rtx5090'], psuId: 'psu3200', moboId: 'wrx90' },
    budget: 200000,
  };

  it('电源需求超过目录上限时，不出「换电源」按钮', () => {
    const result = evaluate(fourCards);
    const needed = Math.ceil((result.stats.powerW * 1.3) / 50) * 50;
    const maxAvailable = Math.max(...CATALOG.psus.map((item) => item.watt));

    // 前提：这个场景确实超出上限，否则测试本身失去意义
    expect(needed).toBeGreaterThan(maxAvailable);

    expect(result.suggestions.some((item) => item.action.type === 'auto-psu')).toBe(false);
    const explain = result.suggestions.find((item) => item.id === 'psu-too-big');
    expect(explain).toBeDefined();
    expect(explain?.label).toContain('减一张卡');
  });

  it('电源需求在目录范围内时，仍然给出一键换电源', () => {
    const result = evaluate({
      ...baseInput,
      build: { ...BALANCE_BUILD, gpuIds: ['rtx5090'], psuId: 'psu650' },
    });
    expect(result.suggestions.some((item) => item.action.type === 'auto-psu')).toBe(true);
  });

  it('内存槽插满时，提示换成单条更大的而不是「再加一条」', () => {
    const result = evaluate({
      ...baseInput,
      build: {
        ...BALANCE_BUILD,
        ramIds: ['ram32', 'ram32', 'ram32', 'ram32'],
        gpuIds: ['rtx5090'],
      },
      // 70B FP16 权重 131.5G，1.5 倍是 197G，128G 内存确实不够
      model: MODELS.llama70b,
      quant: 'fp16',
    });
    const ramSuggestion = result.suggestions.find((item) => item.action.type === 'auto-ram');
    expect(ramSuggestion?.label).toContain('插满');
  });
});

describe('插槽兼容性', () => {
  it('CPU 与主板插槽不一致会被判为硬性错误', () => {
    // BALANCE_BUILD 用 X670E(AM5)，换成 Intel 的 i9 就装不上
    const result = evaluate({ ...baseInput, build: { ...BALANCE_BUILD, cpuId: 'i9-14900k' } });
    expect(result.risks.some((risk) => risk.level === 'err' && risk.title.includes('插槽'))).toBe(true);
    const compat = result.dimensions.find((dim) => dim.key === 'compat');
    expect(compat && compat.score < 60).toBe(true);
  });
});
