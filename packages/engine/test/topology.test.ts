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

describe('拓扑图', () => {
  it('节点覆盖 CPU / 内存 / 硬盘 / 显卡 / 电源 / 散热', () => {
    const topo = describeTopology({ stats: stats(), model: MODELS.qwen7b });
    const kinds = new Set(topo.nodes.map((node) => node.kind));
    expect(kinds).toEqual(new Set(['cpu', 'ram', 'storage', 'gpu', 'psu', 'cooling']));
    expect(topo.nodes.every((node) => !node.missing)).toBe(true);
    expect(topo.links.some((link) => link.to === 'gpu-0')).toBe(true);
  });

  it('单卡时 PCIe 不算瓶颈，多卡时算', () => {
    const single = describeTopology({ stats: stats() });
    const dual = describeTopology({
      stats: stats({ gpuIds: ['rtx3090', 'rtx3090'], psuId: 'psu1300', coolingId: 'turbine' }),
    });

    expect(single.links.find((link) => link.to === 'gpu-0')?.bottleneck).toBe(false);
    expect(single.verdict.key).toBe('single-gpu');
    expect(dual.links.find((link) => link.to === 'gpu-0')?.bottleneck).toBe(true);
    expect(dual.verdict.key).toBe('multi-gpu');
    expect(dual.verdict.vars.lanes).toBe(8);
  });

  it('空机箱不会崩，且明确说缺显卡', () => {
    const empty = describeTopology({ stats: stats({ gpuIds: [], cpuId: null, ramIds: [], psuId: null }) });
    expect(empty.nodes.filter((node) => node.missing).length).toBeGreaterThan(0);
    expect(empty.verdict.key).toBe('no-gpu');
    expect(empty.loadSeconds).toBeNull();
  });

  it('加载时间按「盘读」和「PCIe」两段中更慢的一段算', () => {
    // 9B INT4 ≈ 4.2GB：盘 7GB/s → 0.6s；PCIe 31.5GB/s → 0.17s，取 0.6s
    const topo = describeTopology({
      stats: stats(),
      model: { ...MODELS.qwen7b, paramsB: 9 },
      quant: 'int4',
      ctx: 8192,
    });
    expect(topo.loadSeconds).toBeGreaterThan(0.5);
    expect(topo.loadSeconds).toBeLessThan(0.8);
  });

  it('电源不够时把结论指向电源，而不是显卡', () => {
    const weak = describeTopology({ stats: stats({ gpuIds: ['rtx5090', 'rtx5090'], psuId: 'psu650' }) });
    expect(weak.powerHeadroom).toBeLessThan(0);
    expect(weak.verdict.key).toBe('weak-psu');
  });
});
