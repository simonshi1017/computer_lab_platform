import { describe, expect, it } from 'vitest';
import { estimateTps } from '../src/tps.js';
import { CATALOG, MODELS } from './fixtures.js';

const gpu = (id: string) => {
  const found = CATALOG.gpus.find((item) => item.id === id);
  if (!found) throw new Error(`missing gpu ${id}`);
  return found;
};

describe('生成速度估算', () => {
  it('14B INT4 8K 在 4070 Ti SUPER 上约 46 tokens/s', () => {
    expect(estimateTps(MODELS.qwen14b, [gpu('rtx4070tis')], 'int4', 8192)).toBe(46);
  });

  it('上下文拉满会掉速', () => {
    const at8k = estimateTps(MODELS.qwen14b, [gpu('rtx4070tis')], 'int4', 8192);
    const at32k = estimateTps(MODELS.qwen14b, [gpu('rtx4070tis')], 'int4', 32768);
    expect(at32k).toBeLessThan(at8k);
    expect(at32k).toBe(38);
  });

  it('同模型不同卡：3060 / 4090 对应 48 / 135 tokens/s', () => {
    expect(estimateTps(MODELS.qwen7b, [gpu('rtx3060')], 'int4', 8192)).toBe(48);
    expect(estimateTps(MODELS.qwen7b, [gpu('rtx4090')], 'int4', 8192)).toBe(135);
  });

  it('32B INT4 8K 双 3090 约 46 tokens/s', () => {
    expect(estimateTps(MODELS.qwen32b, [gpu('rtx3090'), gpu('rtx3090')], 'int4', 8192)).toBe(46);
  });

  it('双卡拿不到两倍速度（并行有损耗）', () => {
    const one = estimateTps(MODELS.qwen14b, [gpu('rtx3090')], 'int4', 8192);
    const two = estimateTps(MODELS.qwen14b, [gpu('rtx3090'), gpu('rtx3090')], 'int4', 8192);
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThan(one * 2);
  });

  it('没有显卡时为 0', () => {
    expect(estimateTps(MODELS.qwen7b, [], 'int4', 8192)).toBe(0);
  });

  it('结果被夹在 1–220 之间', () => {
    const fast = estimateTps(MODELS.qwen7b, [gpu('h100-80'), gpu('h100-80')], 'int4', 2048);
    expect(fast).toBeLessThanOrEqual(220);
    expect(fast).toBeGreaterThanOrEqual(1);
  });
});
