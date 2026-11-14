import { describe, expect, it } from 'vitest';
import { describeTimeline, PREFILL_SPEEDUP } from '../src/timeline.js';
import { CATALOG, MODELS } from './fixtures.js';

const gpu = (id: string) => CATALOG.gpus.find((item) => item.id === id)!;

const base = () =>
  describeTimeline({
    model: MODELS.qwen14b,
    quant: 'int4',
    ctx: 8192,
    gpus: [gpu('rtx4070tis')],
    promptTokens: 2048,
    outputTokens: 512,
  });

describe('推理时序', () => {
  it('两段时间相加等于总时间，不会出现第三种口径', () => {
    const line = base();
    expect(line.totalMs).toBeCloseTo(line.prefillMs + line.decodeMs, 6);
    expect(line.prefillMs).toBeGreaterThan(0);
    expect(line.decodeMs).toBeGreaterThan(0);
  });

  it('预填充比解码快一个量级（读 prompt 是并行矩阵乘）', () => {
    const line = base();
    expect(line.prefillTps).toBeCloseTo(line.decodeTps * PREFILL_SPEEDUP, 6);
    expect(line.prefillTps).toBeGreaterThan(line.decodeTps * 5);
  });

  it('KV Cache 只涨不落，显存也跟着单调上涨', () => {
    const line = base();
    const kv = line.series.map((point) => point.kv);
    const vram = line.series.map((point) => point.vram);
    for (let i = 1; i < kv.length; i += 1) {
      expect(kv[i]).toBeGreaterThanOrEqual(kv[i - 1]);
      expect(vram[i]).toBeGreaterThanOrEqual(vram[i - 1]);
    }
    expect(line.kvEnd).toBeGreaterThan(0);
  });

  it('时序中的峰值显存低于「按满上下文估的合计」（后者还含 20% 余量）', () => {
    const line = base();
    expect(line.peakVram).toBeLessThan(line.need.total);
    // 但权重部分必须一致，两个面板不能各算一套
    expect(line.weights).toBeCloseTo(line.need.weights, 6);
  });

  it('上下文越长，预填充越慢（不是线性于总时长，而是线性于 prompt）', () => {
    const short = describeTimeline({
      model: MODELS.qwen14b,
      quant: 'int4',
      ctx: 8192,
      gpus: [gpu('rtx4070tis')],
      promptTokens: 1024,
      outputTokens: 512,
    });
    const long = describeTimeline({
      model: MODELS.qwen14b,
      quant: 'int4',
      ctx: 8192,
      gpus: [gpu('rtx4070tis')],
      promptTokens: 4096,
      outputTokens: 512,
    });
    expect(long.prefillMs).toBeGreaterThan(short.prefillMs * 3.5);
    // 解码段不变：它只跟输出 token 数有关
    expect(long.decodeMs).toBeCloseTo(short.decodeMs, 6);
  });

  it('没装显卡时两段都是 0，而不是 NaN', () => {
    const line = describeTimeline({
      model: MODELS.qwen14b,
      quant: 'int4',
      ctx: 8192,
      gpus: [],
      promptTokens: 1024,
      outputTokens: 128,
    });
    expect(line.decodeTps).toBe(0);
    expect(line.totalMs).toBe(0);
    expect(Number.isFinite(line.peakVram)).toBe(true);
  });

  it('prompt 超过模型上限时被夹住，不会算出负的 KV', () => {
    const line = describeTimeline({
      model: MODELS.qwen7b,
      quant: 'int4',
      ctx: 8192,
      gpus: [gpu('rtx3060')],
      promptTokens: 999999,
      outputTokens: 64,
    });
    expect(line.promptTokens).toBeLessThanOrEqual(MODELS.qwen7b.ctxMax);
    expect(line.series.every((point) => point.kv >= 0)).toBe(true);
  });
});
