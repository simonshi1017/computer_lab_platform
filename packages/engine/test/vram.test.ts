import { describe, expect, it } from 'vitest';
import { kvCacheGb, kvDimOf, vramNeed, weightGb } from '../src/vram.js';
import { MODELS } from './fixtures.js';

const round1 = (value: number) => Number(value.toFixed(1));

describe('显存估算 · 黄金用例', () => {
  /**
   * 期望值由 PRD 公式独立算出（不经过本实现），
   * 一旦这里变红，说明公式被动过，必须人工确认。
   */
  const cases: Array<[string, keyof typeof MODELS, 'fp16' | 'int8' | 'int4', number, number]> = [
    ['7B INT4 8K', 'qwen7b', 'int4', 8192, 5.9],
    ['7B INT4 32K', 'qwen7b', 'int4', 32768, 9.2],
    ['7B FP16 8K', 'qwen7b', 'fp16', 8192, 20.1],
    ['14B INT4 8K', 'qwen14b', 'int4', 8192, 11.9],
    ['14B INT4 16K', 'qwen14b', 'int4', 16384, 14.6],
    ['14B INT4 32K', 'qwen14b', 'int4', 32768, 20.0],
    ['14B INT8 8K', 'qwen14b', 'int8', 8192, 21.1],
    ['14B FP16 8K', 'qwen14b', 'fp16', 8192, 39.5],
    ['32B INT4 8K', 'qwen32b', 'int4', 8192, 23.9],
    ['32B INT4 32K', 'qwen32b', 'int4', 32768, 34.8],
    ['32B FP16 8K', 'qwen32b', 'fp16', 8192, 85.0],
    ['70B INT4 8K', 'llama70b', 'int4', 8192, 51.4],
    ['70B INT4 32K', 'llama70b', 'int4', 32768, 73.0],
    ['70B FP16 8K', 'llama70b', 'fp16', 8192, 184.0],
    ['27B(自定义) INT4 8K', 'custom27b', 'int4', 8192, 20.5],
    ['27B(自定义) INT4 32K', 'custom27b', 'int4', 32768, 31.3],
  ];

  it.each(cases)('%s 需要 %s GB', (_name, key, quant, ctx, expected) => {
    const need = vramNeed(MODELS[key], quant, ctx);
    expect(round1(need.total)).toBe(expected);
  });
});

describe('显存估算 · 结构', () => {
  it('拆解项的加总等于 total', () => {
    const need = vramNeed(MODELS.qwen14b, 'int4', 16384);
    expect(need.weights + need.kvCache + need.overhead + need.margin).toBeCloseTo(need.total, 6);
  });

  it('量化档位之间的权重比例正确', () => {
    const fp16 = weightGb(MODELS.qwen14b.paramsB, 'fp16');
    const int8 = weightGb(MODELS.qwen14b.paramsB, 'int8');
    const int4 = weightGb(MODELS.qwen14b.paramsB, 'int4');
    expect(int8).toBeCloseTo(fp16 / 2, 6);
    expect(int4).toBeCloseTo(fp16 / 4, 6);
  });

  it('KV Cache 随上下文线性增长', () => {
    const at8k = kvCacheGb(MODELS.qwen14b, 8192);
    const at32k = kvCacheGb(MODELS.qwen14b, 32768);
    expect(at32k / at8k).toBeCloseTo(4, 3);
  });

  it('KV 维度按 GQA 近似取隐藏维度的 1/4', () => {
    expect(kvDimOf(MODELS.qwen14b)).toBe(1280);
    expect(kvDimOf(MODELS.qwen7b)).toBe(896);
  });

  it('上下文为 0 时只剩权重与开销', () => {
    const need = vramNeed(MODELS.qwen14b, 'int4', 0);
    expect(need.kvCache).toBe(0);
    expect(need.total).toBeLessThan(weightGb(MODELS.qwen14b.paramsB, 'int4') * 1.4);
  });
});
