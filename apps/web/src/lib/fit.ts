import { vramNeed, type GpuSpec } from '@clab/engine';
import { MODELS_LIST, type ModelRecord } from '@clab/data';

/** 判定用的上下文：8K 是多数本地对话的真实值，不拿满上下文去评判「能不能跑」 */
export const FIT_CTX = 8192;

export type FitVerdict = 'ok' | 'tight' | 'no';

export interface ModelFit {
  model: ModelRecord;
  /** INT4 + 8K 下的显存需求 */
  needGb: number;
  /** 占单卡显存的比例 */
  usage: number;
  verdict: FitVerdict;
}

/**
 * 单卡能跑哪些模型。
 *
 * 三档判定：
 * - ok：需求 ≤ 显存的 85%，留得下余量，长对话不容易崩；
 * - tight：85%–100%，能加载但很临界；
 * - no：超过显存，加载就会失败。
 */
export function modelsFitForGpu(gpu: GpuSpec): ModelFit[] {
  return MODELS_LIST.map((model) => {
    const needGb = vramNeed(model, 'int4', Math.min(FIT_CTX, model.ctxMax)).total;
    const usage = needGb / gpu.vramGb;
    const verdict: FitVerdict = usage <= 0.85 ? 'ok' : usage <= 1 ? 'tight' : 'no';
    return { model, needGb, usage, verdict };
  }).sort((a, b) => a.needGb - b.needGb);
}

/** 卡片角标用：这张卡单卡能舒服跑的最大模型 */
export function maxModelForGpu(gpu: GpuSpec): ModelFit | null {
  const fits = modelsFitForGpu(gpu).filter((fit) => fit.verdict === 'ok');
  return fits.length ? fits[fits.length - 1] : null;
}

export const VERDICT_LABEL: Record<FitVerdict, string> = {
  ok: '能跑',
  tight: '临界',
  no: '放不下',
};

export const VERDICT_COLOR: Record<FitVerdict, string> = {
  ok: 'var(--good-ink)',
  tight: 'var(--warn-ink)',
  no: 'var(--danger-ink)',
};
