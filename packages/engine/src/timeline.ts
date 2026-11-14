import type { GpuSpec, ModelSpec, Quant, VramBreakdown } from './types.js';
import { estimateTps } from './tps.js';
import { kvCacheGb, vramNeed, weightGb, OVERHEAD_RATIO } from './vram.js';

/**
 * 推理时序：一次请求里显存和时间是怎么花掉的。
 *
 * 两段结构是这个平台最想讲清的一件事：
 * - prefill：把提示词一次性读完，算力密集，吞吐高、显存随 token 线性涨；
 * - decode：一个 token 一个 token 往外吐，访存密集，速度慢，KV 还在涨。
 *
 * 所有数字都是估算，但**结构**是真实的：KV 随时序线性增长、显存不回落、
 * 长上下文把预填充阶段拉得很长——这些结论和具体显卡无关。
 */

export interface TimelineInput {
  model: ModelSpec;
  quant: Quant;
  ctx: number;
  gpus: GpuSpec[];
  /** 提示词长度，默认取上下文的 1/4（长文档场景的典型值） */
  promptTokens?: number;
  /** 期望输出长度，默认 512 */
  outputTokens?: number;
}

export interface TimelinePoint {
  /** 相对开始的毫秒数 */
  t: number;
  /** 这一刻的 KV Cache 占用（GB） */
  kv: number;
  /** 这一刻的显存占用（权重 + KV + 框架开销，GB） */
  vram: number;
  /** 累计 token 数 */
  tokens: number;
  phase: 'prefill' | 'decode';
}

export interface Timeline {
  promptTokens: number;
  outputTokens: number;
  /** 预填充耗时（毫秒） */
  prefillMs: number;
  /** 解码耗时（毫秒） */
  decodeMs: number;
  totalMs: number;
  /** 预填充吞吐（tokens/s） */
  prefillTps: number;
  /** 解码吞吐（tokens/s） */
  decodeTps: number;
  /** 请求结束时的 KV 占用 */
  kvEnd: number;
  /** 请求结束时的显存占用 */
  vramEnd: number;
  /** 峰值显存（等于 vramEnd） */
  peakVram: number;
  weights: number;
  /** 静态拆解，和评估面板用的是同一套口径 */
  need: VramBreakdown;
  series: TimelinePoint[];
}

/**
 * 预填充相对解码的加速比。
 *
 * 解码是访存瓶颈（每 token 要把权重读一遍），预填充是算力瓶颈
 * （prompt 里的 token 可以并行进矩阵乘）。实测开源推理框架上
 * 这个比值大致在 8–12 之间，取 10 作为教学用的中位数——
 * 它是估算参数，不是物理常数，UI 上必须标「估算」。
 */
export const PREFILL_SPEEDUP = 10;

const clampCtx = (value: number, max: number): number => Math.max(1, Math.min(value, max));

export function describeTimeline(input: TimelineInput): Timeline {
  const { model, quant, ctx, gpus } = input;
  const promptTokens = clampCtx(input.promptTokens ?? Math.round(ctx / 4), ctx);
  const outputTokens = Math.max(1, input.outputTokens ?? 512);

  const decodeTps = gpus.length > 0 ? estimateTps(model, gpus, quant, ctx) : 0;
  const prefillTps = Math.min(20000, decodeTps * PREFILL_SPEEDUP);

  const prefillMs = prefillTps > 0 ? (promptTokens / prefillTps) * 1000 : 0;
  const decodeMs = decodeTps > 0 ? (outputTokens / decodeTps) * 1000 : 0;

  const weights = weightGb(model.paramsB, quant);
  const overhead = (w: number, kv: number) => (w + kv) * OVERHEAD_RATIO;
  const vramAt = (tokens: number) => {
    const kv = kvCacheGb(model, tokens);
    return { kv, vram: weights + kv + overhead(weights, kv) };
  };

  const series: TimelinePoint[] = [];
  const SAMPLES = 28;

  // 预填充：token 从 0 涨到 promptTokens，时间线性推进
  for (let i = 0; i <= SAMPLES; i += 1) {
    const ratio = i / SAMPLES;
    const tokens = Math.round(promptTokens * ratio);
    const { kv, vram } = vramAt(tokens);
    series.push({ t: prefillMs * ratio, kv, vram, tokens, phase: 'prefill' });
  }

  // 解码：KV 继续涨，但涨得慢
  for (let i = 1; i <= SAMPLES; i += 1) {
    const ratio = i / SAMPLES;
    const tokens = promptTokens + Math.round(outputTokens * ratio);
    const { kv, vram } = vramAt(tokens);
    series.push({ t: prefillMs + decodeMs * ratio, kv, vram, tokens, phase: 'decode' });
  }

  const end = vramAt(promptTokens + outputTokens);
  const need = vramNeed(model, quant, ctx);

  return {
    promptTokens,
    outputTokens,
    prefillMs,
    decodeMs,
    totalMs: prefillMs + decodeMs,
    prefillTps,
    decodeTps,
    kvEnd: end.kv,
    vramEnd: end.vram,
    peakVram: end.vram,
    weights,
    need,
    series,
  };
}
