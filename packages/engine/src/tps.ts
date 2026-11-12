import { clamp } from './math.js';
import type { GpuSpec, ModelSpec, Quant } from './types.js';
import { weightGb } from './vram.js';

/** 多卡的带宽折损：并行开销让 2 张卡拿不到 2 倍带宽 */
export const MULTI_GPU_EFFICIENCY = 0.78;
/** 解码阶段是访存瓶颈，实际可用带宽约为标称值的一半 */
export const BANDWIDTH_UTILIZATION = 0.5;
/** 上下文拉满时，注意力计算会拖慢生成 */
export const MAX_CTX_PENALTY = 0.22;
/** 展示上限，避免出现「1000 tokens/s」这种不可信的估算 */
export const TPS_CAP = 220;

/**
 * 生成速度估算（tokens/s）。
 * 解码阶段受显存带宽限制，所以速度 ≈ 带宽 / 权重大小，再打上下文折扣。
 */
export function estimateTps(
  spec: ModelSpec,
  gpus: GpuSpec[],
  quant: Quant,
  ctxTokens: number,
): number {
  if (gpus.length === 0) return 0;

  const weights = weightGb(spec.paramsB, quant);
  const totalBandwidth =
    gpus.reduce((sum, gpu) => sum + gpu.bandwidth, 0) *
    (gpus.length > 1 ? MULTI_GPU_EFFICIENCY : 1);

  const raw = (totalBandwidth * BANDWIDTH_UTILIZATION) / Math.max(weights, 0.6);
  const ctxRatio = spec.ctxMax > 0 ? clamp(ctxTokens / spec.ctxMax, 0, 1) : 0;
  const penalized = raw * (1 - ctxRatio * MAX_CTX_PENALTY);

  return clamp(Math.round(penalized), 1, TPS_CAP);
}
