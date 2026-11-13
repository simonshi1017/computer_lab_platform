import type { Build, PresetKey, Quant } from '@clab/engine';
import { DATASET, modelById } from '@/data';
import { t } from '@/i18n';

export interface Preset {
  key: PresetKey;
  name: string;
  desc: string;
  /** 这套预设想跑什么 */
  modelId: string;
  quant: Quant;
  ctx: number;
  build: Build;
}

/**
 * 三套预设。
 *
 * 放在应用侧而不是 engine：预设必须写具体的部件 id，而 id 属于数据。
 * engine 只认 action 类型（`apply-preset`），由应用决定「省钱版」到底长什么样，
 * 这样换一批硬件数据时不用动内核。
 *
 * 三档的设计意图：
 * - 省钱：先把模型点起来，能跑就行，¥6,900
 * - 均衡：14B + 16G 显存留 26% 余量，性价比拐点
 * - 性能：32B 全上下文，单卡 32G，长期主力
 */
export const PRESETS: Record<PresetKey, Preset> = {
  save: {
    key: 'save',
    name: t("省钱入门版"),
    desc: t("先把模型跑起来，¥6,900"),
    modelId: 'qwen25-7b',
    quant: 'int4',
    ctx: 8192,
    build: {
      gpuIds: ['rtx3060'],
      cpuId: 'r5-7600',
      moboId: 'b650',
      ramIds: ['ram32', 'ram32'],
      psuId: 'psu650',
      storageIds: ['ssd1t'],
      coolingId: 'air',
    },
  },
  balance: {
    key: 'balance',
    name: t("均衡推荐版"),
    desc: t("14B 全上下文，留得下余量"),
    modelId: 'qwen25-14b',
    quant: 'int4',
    ctx: 8192,
    build: {
      gpuIds: ['rtx4070tis'],
      cpuId: 'r7-7700',
      moboId: 'x670e',
      ramIds: ['ram64', 'ram64'],
      psuId: 'psu850',
      storageIds: ['ssd2t'],
      coolingId: 'aio360',
    },
  },
  perf: {
    key: 'perf',
    name: t("性能进阶版"),
    desc: t("32B 单卡全上下文，长期主力"),
    modelId: 'qwen25-32b',
    quant: 'int4',
    ctx: 8192,
    build: {
      gpuIds: ['rtx5090'],
      cpuId: 'r9-7950x',
      moboId: 'x670e',
      ramIds: ['ram128', 'ram128'],
      psuId: 'psu1300',
      storageIds: ['ssd2t'],
      coolingId: 'aio360',
    },
  },
};

/**
 * 预设里写的是硬编码 id，数据改名时这里会静默失效（部件消失、评分莫名下降）。
 * 所以模块加载时先自查一遍，坏掉就直接在开发时报错。
 */
function assertPresets(): void {
  const psuIds = new Set(DATASET.parts.psus.map((item) => item.id));
  const cpuIds = new Set(DATASET.parts.cpus.map((item) => item.id));
  const moboIds = new Set(DATASET.parts.mobos.map((item) => item.id));
  const ramIds = new Set(DATASET.parts.rams.map((item) => item.id));
  const storageIds = new Set(DATASET.parts.storages.map((item) => item.id));
  const coolingIds = new Set(DATASET.parts.coolings.map((item) => item.id));
  const gpuIds = new Set(DATASET.gpus.map((item) => item.id));

  for (const preset of Object.values(PRESETS)) {
    const { build } = preset;
    const checks: Array<[boolean, string]> = [
      [modelById(preset.modelId) !== undefined, `model ${preset.modelId}`],
      [build.gpuIds.every((id) => gpuIds.has(id)), `gpu ${build.gpuIds.join('/')}`],
      [build.cpuId === null || cpuIds.has(build.cpuId), `cpu ${build.cpuId}`],
      [build.moboId === null || moboIds.has(build.moboId), `mobo ${build.moboId}`],
      [build.ramIds.every((id) => ramIds.has(id)), `ram ${build.ramIds.join('/')}`],
      [build.psuId === null || psuIds.has(build.psuId), `psu ${build.psuId}`],
      [build.storageIds.every((id) => storageIds.has(id)), `storage ${build.storageIds.join('/')}`],
      [build.coolingId === null || coolingIds.has(build.coolingId), `cooling ${build.coolingId}`],
    ];

    for (const [ok, label] of checks) {
      if (!ok) throw new Error(`[presets] 「${preset.name}」引用了数据里不存在的部件：${label}`);
    }
  }
}

assertPresets();

export const PRESET_LIST = Object.values(PRESETS);
