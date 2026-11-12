import type { Build, ModelSpec, Quant } from '@clab/engine';

/**
 * 组装台的配置存档。
 *
 * 抽成独立模块是为了让「配置推荐」能直接把一套结果交给组装台：
 * 写同一个 key，跳到 /builder，那边挂载时自然读出来。
 * 不走全局状态库，是因为这份状态的唯一消费者就是组装台，
 * 加一个 store 只会多一层同步问题。
 */

export const BUILDER_STORAGE_KEY = 'clab.builder.v1';

export interface StoredBuilderState {
  build: Build;
  modelId: string;
  /**
   * 从推荐页带过来的自定义尺寸模型（data 里没有这条记录）。
   * 有它时覆盖 modelId 指向的模型。
   */
  customSpec?: ModelSpec | null;
  quant: Quant;
  ctx: number;
  budget: number;
}

export function saveBuilderState(state: StoredBuilderState): void {
  try {
    localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式忽略：此时跳过去会看到默认配置，不算致命 */
  }
}
