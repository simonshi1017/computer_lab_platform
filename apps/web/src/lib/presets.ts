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
 * 三档的设计意图（2026-11 换代后）：
 * - 省钱：9B + 12G 卡，把模型先点起来，留 40% 余量
 * - 均衡：35B-A3B（MoE 只激活 3B）+ 32G 卡，速度换吞吐
 * - 性能：27B 稠密 + 32G 卡，质量优先，速度让位
 */
export const PRESETS: Record<PresetKey, Preset> = {
  save: {
    key: 'save',
    name: t("省钱入门版"),
    desc: t("9B 模型 + 12G 卡，先把模型跑起来"),
    modelId: 'qwen35-9b',
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
    desc: t("35B-A3B 单卡跑，只激活 3B 所以快"),
    modelId: 'qwen35-35b-a3b',
    quant: 'int4',
    ctx: 8192,
    build: {
      gpuIds: ['rtx5090'],
      cpuId: 'r7-7700',
      moboId: 'x670e',
      ramIds: ['ram64', 'ram64'],
      psuId: 'psu1000',
      storageIds: ['ssd2t'],
      coolingId: 'turbine',
    },
  },
  perf: {
    key: 'perf',
    name: t("性能进阶版"),
    desc: t("27B 稠密模型，质量优先于吞吐"),
    modelId: 'qwen38-27b',
    quant: 'int4',
    ctx: 8192,
    build: {
      gpuIds: ['rtx5090'],
      cpuId: 'r9-7950x',
      moboId: 'x670e',
      ramIds: ['ram128', 'ram128'],
      psuId: 'psu1300',
      storageIds: ['ssd2t'],
      coolingId: 'turbine',
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
