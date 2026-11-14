import { describe, expect, it } from 'vitest';
import { buildStats, type Build } from '../src/stats.js';
import { describeTopology, pcieBandwidth, pcieLanesFor } from '../src/topology.js';
import { CATALOG, MODELS } from './fixtures.js';

const build = (patch: Partial<Build> = {}): Build => ({
  gpuIds: ['rtx3060'],
  cpuId: 'r5-7600',
  moboId: 'b650',
  ramIds: ['ram32', 'ram32'],
  psuId: 'psu650',
  storageIds: ['ssd1t'],
  coolingId: 'aio360',
  ...patch,
});

const stats = (patch: Partial<Build> = {}) => buildStats(build(patch), CATALOG);

describe('PCIe 链路', () => {
  it('单卡给 ×16，双卡拆成 ×8', () => {
    expect(pcieLanesFor(1)).toBe(16);
    expect(pcieLanesFor(2)).toBe(8);
    expect(pcieLanesFor(4)).toBe(8);
  });

  it('4 代 ×16 约 31.5GB/s，5 代 ×16 翻倍', () => {
    const rtx4090 = CATALOG.gpus.find((g) => g.id === 'rtx4090')!;
    const h100 = CATALOG.gpus.find((g) => g.id === 'h100-80')!;
    expect(pcieBandwidth(rtx4090, 16)).toBeCloseTo(31.5, 1);
    expect(pcieBandwidth(rtx4090, 8)).toBeCloseTo(15.75, 2);
    expect(pcieBandwidth({ ...h100, pcieGen: 5 }, 16)).toBeCloseTo(63, 0);
  });

  it('没填 pcieGen 时按 4 代算，不会算出 Inf', () => {
    const rtx3090 = CATALOG.gpus.find((g) => g.id === 'rtx3090')!;
    expect(pcieBandwidth({ ...rtx3090, pcieGen: undefined }, 16)).toBeCloseTo(31.5, 1);
  });
});

describe('拓扑事实', () => {
  it('单卡：链路 ×16，带宽比约 11 倍（360 / 31.5）', () => {
    const facts = describeTopology({ stats: stats() });
    expect(facts.lanes).toBe(16);
    expect(facts.pcieGbps).toBeCloseTo(31.5, 1);
    expect(facts.hbmGbps).toBe(360);
    expect(facts.ratio).toBe(11);
  });

  it('双卡：通道拆成 ×8，结论指向 PCIe 瓶颈', () => {
    const facts = describeTopology({
      stats: stats({ gpuIds: ['rtx3090', 'rtx3090'], psuId: 'psu1300', coolingId: 'turbine' }),
    });
    expect(facts.lanes).toBe(8);
    expect(facts.ratio).toBe(59); // 936 / 15.75 ≈ 59
    expect(facts.verdict.key).toBe('multi-gpu');
    expect(facts.verdict.vars.lanes).toBe(8);
  });

  it('单卡结论是「不是 PCIe 的瓶颈」', () => {
    expect(describeTopology({ stats: stats() }).verdict.key).toBe('single-gpu');
  });

  it('空机箱不会崩，结论是「没显卡」', () => {
    const facts = describeTopology({ stats: stats({ gpuIds: [], cpuId: null, ramIds: [], psuId: null }) });
    expect(facts.verdict.key).toBe('no-gpu');
    expect(facts.loadSeconds).toBeNull();
    expect(facts.pcieGbps).toBe(0);
    expect(facts.ratio).toBe(0);
  });

  it('加载时间按「盘读」和「PCIe」两段中更慢的一段算', () => {
    // 9B INT4 ≈ 4.2GB：盘 7GB/s → 0.6s；PCIe 31.5GB/s → 0.17s，取 0.6s
    const facts = describeTopology({
      stats: stats(),
      model: { ...MODELS.qwen7b, paramsB: 9 },
      quant: 'int4',
      ctx: 8192,
    });
    expect(facts.loadSeconds).toBeGreaterThan(0.5);
    expect(facts.loadSeconds).toBeLessThan(0.8);
  });

  it('电源不够时把结论指向电源，而不是显卡', () => {
    const facts = describeTopology({ stats: stats({ gpuIds: ['rtx5090', 'rtx5090'], psuId: 'psu650' }) });
    expect(facts.powerHeadroom).toBeLessThan(0);
    expect(facts.verdict.key).toBe('weak-psu');
  });

  it('散热不够时把结论指向散热', () => {
    const facts = describeTopology({
      stats: stats({ gpuIds: ['rtx5090'], psuId: 'psu1000', coolingId: 'air' }),
    });
    expect(facts.coolingHeadroom).toBeLessThan(0);
    expect(facts.verdict.key).toBe('weak-cooling');
  });
});
