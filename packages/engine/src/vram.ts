import type { ModelSpec, Quant, VramBreakdown } from './types.js';

/** 每参数占用的字节数 */
export const BYTES_PER_PARAM: Record<Quant, number> = {
  fp16: 2,
  int8: 1,
  int4: 0.5,
};

const GIB = 1024 ** 3;

/**
 * KV Cache 的等效维度。
 * 现代模型普遍使用 GQA，Key/Value 的头维度约为隐藏维度的 1/4。
 * 用完整 hiddenDim 会高估 3 倍以上（7B/8K 会算成 3.2GB，实际约 0.8GB）。
 */
export function kvDimOf(spec: ModelSpec): number {
  return Math.round(spec.hiddenDim / 4);
}

/** 权重显存：参数 × 每参数字节 */
export function weightGb(paramsB: number, quant: Quant): number {
  return (paramsB * BYTES_PER_PARAM[quant] * 1e9) / GIB;
}

/** KV Cache 显存：2（K 和 V）× 层数 × 维度 × 上下文 × 2 字节 */
export function kvCacheGb(spec: ModelSpec, ctxTokens: number): number {
  return (2 * spec.layers * kvDimOf(spec) * ctxTokens * 2) / 1e9;
}

/** 框架自身的额外占用（显存碎片、激活值等） */
export const OVERHEAD_RATIO = 0.12;
/** 安全余量：不把显存吃满，否则长对话容易 OOM */
export const SAFETY_MARGIN_RATIO = 0.2;

/**
 * 跑这个模型、这个量化、这个上下文，一共要吃多少显存。
 * 所有数字都是估算值，UI 上必须带「估算」标记。
 */
export function vramNeed(spec: ModelSpec, quant: Quant, ctxTokens: number): VramBreakdown {
  const weights = weightGb(spec.paramsB, quant);
  const kvCache = kvCacheGb(spec, ctxTokens);
  const raw = weights + kvCache;
  const overhead = raw * OVERHEAD_RATIO;
  const margin = (raw + overhead) * SAFETY_MARGIN_RATIO;

  return { weights, kvCache, overhead, margin, total: raw + overhead + margin };
}
