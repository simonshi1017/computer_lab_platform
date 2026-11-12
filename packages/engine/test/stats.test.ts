import { describe, expect, it } from 'vitest';
import { buildStats } from '../src/stats.js';
import { EMPTY_BUILD } from '../src/types.js';
import { BALANCE_BUILD, CATALOG } from './fixtures.js';

describe('配置统计', () => {
  it('均衡版：16GB 显存 / 128GB 内存 / 613W / ¥18,100', () => {
    const stats = buildStats(BALANCE_BUILD, CATALOG);
    expect(stats.vramGb).toBe(16);
    expect(stats.ramGb).toBe(128);
    expect(stats.powerW).toBe(613);
    expect(stats.priceCny).toBe(18100);
    expect(stats.mixed).toBe(false);
  });

  it('月电费 = 功耗 × 8 小时 × 30 天 × 0.6 元', () => {
    const stats = buildStats(BALANCE_BUILD, CATALOG);
    expect(stats.elecMonthlyCny).toBeCloseTo(88.27, 1);
  });

  it('混插不同型号时，可用显存按最小卡 × 数量', () => {
    const stats = buildStats(
      { ...BALANCE_BUILD, gpuIds: ['rtx4070tis', 'rtx3060'] },
      CATALOG,
    );
    expect(stats.mixed).toBe(true);
    expect(stats.vramGb).toBe(24); // min(16, 12) × 2
  });

  it('同型号双卡是简单相加', () => {
    const stats = buildStats({ ...BALANCE_BUILD, gpuIds: ['rtx3090', 'rtx3090'] }, CATALOG);
    expect(stats.mixed).toBe(false);
    expect(stats.vramGb).toBe(48);
  });

  it('空配置不报错', () => {
    const stats = buildStats(EMPTY_BUILD, CATALOG);
    expect(stats.priceCny).toBe(0);
    expect(stats.vramGb).toBe(0);
    expect(stats.powerW).toBe(0);
    expect(stats.gpus).toHaveLength(0);
  });

  it('未知 id 会被忽略而不是崩溃', () => {
    const stats = buildStats({ ...BALANCE_BUILD, gpuIds: ['not-exist'] }, CATALOG);
    expect(stats.gpus).toHaveLength(0);
    expect(stats.vramGb).toBe(0);
  });
});
