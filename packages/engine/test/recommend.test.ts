import { describe, expect, it } from 'vitest';
import { recommend } from '../src/recommend.js';
import { CATALOG, MODELS } from './fixtures.js';

const call = (over: Partial<Parameters<typeof recommend>[0]> = {}) =>
  recommend({
    model: MODELS.qwen14b,
    quant: 'int4',
    ctx: 8192,
    budget: 25000,
    pref: 'balance',
    catalog: CATALOG,
    ...over,
  });

describe('配置推荐', () => {
  it('14B / INT4 / 8K / 2.5 万：给出多档可行方案', () => {
    const { tiers } = call();
    expect(tiers.length).toBeGreaterThanOrEqual(2);
    expect(tiers.length).toBeLessThanOrEqual(3);
  });

  it('每一档都真的装得下、电源也带得动', () => {
    const { tiers, need } = call();
    for (const tier of tiers) {
      expect(tier.vramGb).toBeGreaterThan(need.total);
      expect(tier.psu.watt).toBeGreaterThanOrEqual(tier.powerW);
      expect(tier.priceCny).toBeGreaterThan(0);
      expect(tier.tps).toBeGreaterThan(0);
    }
  });

  it('三档之间不重复，且只有一档被标记为推荐', () => {
    const { tiers } = call();
    expect(new Set(tiers.map((tier) => tier.key)).size).toBe(tiers.length);
    expect(tiers.filter((tier) => tier.picked)).toHaveLength(1);
  });

  it('省钱档不比均衡档贵', () => {
    const { tiers } = call();
    const save = tiers.find((tier) => tier.name === '省钱入门版');
    const balance = tiers.find((tier) => tier.name === '均衡推荐版');
    if (save && balance) expect(save.priceCny).toBeLessThanOrEqual(balance.priceCny);
  });

  it('性能档必须真的比均衡档快 5% 以上', () => {
    const { tiers } = call();
    const balance = tiers.find((tier) => tier.name === '均衡推荐版');
    const perf = tiers.find((tier) => tier.name === '性能进阶版');
    if (balance && perf) {
      expect(perf.effectiveTps).toBeGreaterThanOrEqual(balance.effectiveTps * 1.05);
    }
  });

  it('偏好为省时，推荐位落在最便宜的那档', () => {
    const { tiers } = call({ pref: 'save' });
    const picked = tiers.find((tier) => tier.picked);
    const cheapest = [...tiers].sort((a, b) => a.priceCny - b.priceCny)[0];
    expect(picked?.key).toBe(cheapest.key);
  });

  it('70B / 32K：方案变少时标记 limited', () => {
    const result = call({ model: MODELS.llama70b, ctx: 32768 });
    for (const tier of result.tiers) {
      expect(tier.vramGb).toBeGreaterThan(result.need.total);
    }
    if (result.tiers.length < 3) expect(result.limited).toBe(true);
  });

  it('模型大到没有方案时返回空数组而不是崩溃', () => {
    const result = call({ model: { ...MODELS.llama70b, paramsB: 500 }, ctx: 32768 });
    expect(result.tiers).toHaveLength(0);
    expect(result.limited).toBe(true);
  });

  it('预算高低会改变推荐结果', () => {
    const cheap = call({ budget: 8000 });
    const rich = call({ budget: 80000 });
    const cheapTop = cheap.tiers.find((tier) => tier.picked);
    const richTop = rich.tiers.find((tier) => tier.picked);
    expect(cheapTop).toBeDefined();
    expect(richTop).toBeDefined();
    expect(cheapTop!.priceCny).toBeLessThanOrEqual(richTop!.priceCny);
  });
});

describe('硬件必须装得上', () => {
  it('推荐出的每一档，CPU 与主板插槽都一致', () => {
    const cases = [
      { model: MODELS.qwen14b, ctx: 8192, budget: 20000 },
      { model: MODELS.qwen7b, ctx: 8192, budget: 8000 },
      { model: MODELS.qwen32b, ctx: 32768, budget: 60000 },
      { model: MODELS.llama70b, ctx: 8192, budget: 120000 },
    ];
    for (const item of cases) {
      const { tiers } = call(item);
      for (const tier of tiers) {
        expect(tier.cpu.socket, `${item.model.id} 的 ${tier.name} 插槽不匹配`).toBe(tier.mobo.socket);
      }
    }
  });

  it('每一档的显卡数量都不超过主板卡槽', () => {
    const { tiers } = call({ model: MODELS.qwen32b, ctx: 32768, budget: 80000 });
    for (const tier of tiers) {
      expect(tier.gpuCount).toBeLessThanOrEqual(tier.mobo.gpuSlots);
    }
  });
});
