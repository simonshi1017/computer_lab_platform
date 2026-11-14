import type { BuildStats, GpuSpec, ModelSpec, Quant } from './types.js';
import { vramNeed } from './vram.js';

/**
 * 硬件拓扑：把「机箱里那台机器」抽象成链路带宽与余量。
 *
 * 只出**事实**，不出文案：节点标题、单位、句子都由 UI 组。
 * 之前这里返回过带中文的节点列表，结果是字典扫描要为一堆看不见的
 * 字符串维护翻译，页面那边还得再拼一遍盒子——两边都会漂移。
 *
 * 数据里能拿到的：显卡显存带宽、PCIe 代数、TDP；内存条数与容量；
 * 硬盘容量；电源瓦数、散热能力。
 * 拿不到但必须给量级概念的：内存通道带宽（按双通道 DDR5-5600 估算）。
 */

/** PCIe 单通道单向有效带宽（GB/s，含编码开销后的近似值） */
export const PCIE_LANE_GBPS: Record<4 | 5, number> = {
  4: 1.969,
  5: 3.938,
};

/** 双通道 DDR5-5600 的理论带宽；实际可用约七成，这里给理论值并标注估算 */
export const DDR5_DUAL_CHANNEL_GBPS = 89.6;

/**
 * NVMe 盘的顺序读带宽。
 * 数据里只有容量和「PCIe 4.0 NVMe」这类描述，按 ×4 的实际上限取 7GB/s
 * （标称 7.4GB/s，留一点编码与协议开销）。
 */
export const NVME_READ_GBPS = 7;

/**
 * 结论用「枚举 + 变量」返回，不返回中文长句。
 * 组句是展示层的事：内核只管判断是哪一类瓶颈，语言由 UI 决定。
 */
export type VerdictKey =
  | 'no-gpu'
  | 'weak-psu'
  | 'weak-cooling'
  | 'multi-gpu'
  | 'mixed-gpu'
  | 'single-gpu';

export interface Verdict {
  key: VerdictKey;
  /** 组句需要的数字，例如 PCIe 通道数、显存带宽比 */
  vars: Record<string, string | number>;
}

export interface TopologyFacts {
  /** 每张卡实际拿到的 PCIe 通道数 */
  lanes: number;
  /** 每张卡的 PCIe 链路带宽（GB/s，单向） */
  pcieGbps: number;
  /** 每张卡的显存带宽（GB/s）；没装卡为 0 */
  hbmGbps: number;
  /** 显存带宽 / PCIe 带宽，越大说明链路越像瓶颈；没装卡为 0 */
  ratio: number;
  /** 模型加载耗时估算（秒）：取盘读与 PCIe 两段中更慢的一段 */
  loadSeconds: number | null;
  /** 供电余量比例，负数表示不够 */
  powerHeadroom: number;
  /** 散热余量比例 */
  coolingHeadroom: number;
  verdict: Verdict;
}

export interface TopologyInput {
  stats: BuildStats;
  model?: ModelSpec | null;
  quant?: Quant;
  ctx?: number;
}

/** 每张卡实际拿到的 PCIe 通道数：单卡 ×16，双卡各 ×8，三卡及以上各 ×8 */
export function pcieLanesFor(gpuCount: number): number {
  if (gpuCount <= 1) return 16;
  return 8;
}

/** 单张卡的 PCIe 链路带宽（GB/s，单向） */
export function pcieBandwidth(gpu: GpuSpec, lanes: number): number {
  const gen = gpu.pcieGen ?? 4;
  return PCIE_LANE_GBPS[gen] * lanes;
}

export function describeTopology(input: TopologyInput): TopologyFacts {
  const { stats, model, quant = 'int4', ctx = 8192 } = input;
  const gpus = stats.gpus;
  const lanes = pcieLanesFor(gpus.length);
  const lead = gpus[0] ?? null;

  const pcieGbps = lead ? pcieBandwidth(lead, lanes) : 0;
  const hbmGbps = lead ? lead.bandwidth : 0;
  const ratio = pcieGbps > 0 ? Math.round(hbmGbps / pcieGbps) : 0;

  const powerHeadroom = stats.psu ? (stats.psu.watt - stats.powerW) / stats.psu.watt : -1;
  const coolingHeadroom = stats.cooling
    ? (stats.cooling.capacityW - stats.powerW * 0.8) / stats.cooling.capacityW
    : -1;

  let loadSeconds: number | null = null;
  if (model && lead) {
    const need = vramNeed(model, quant, ctx);
    // 加载 = 从盘读到内存，再经 PCIe 进显存；取两者中更慢的一段，
    // 不叠加（实际是流水线，叠加会高估一倍）。
    const diskSeconds = need.weights / NVME_READ_GBPS;
    const pcieSeconds = need.weights / (pcieGbps * Math.max(1, gpus.length * 0.8));
    loadSeconds = Math.max(diskSeconds, pcieSeconds);
  }

  return {
    lanes,
    pcieGbps,
    hbmGbps,
    ratio,
    loadSeconds,
    powerHeadroom,
    coolingHeadroom,
    verdict: verdictOf({ gpus, stats, powerHeadroom, coolingHeadroom, lanes, ratio }),
  };
}

function verdictOf(args: {
  gpus: GpuSpec[];
  stats: BuildStats;
  powerHeadroom: number;
  coolingHeadroom: number;
  lanes: number;
  ratio: number;
}): Verdict {
  const { gpus, stats, powerHeadroom, coolingHeadroom, lanes, ratio } = args;
  if (gpus.length === 0) return { key: 'no-gpu', vars: {} };
  if (powerHeadroom < 0) return { key: 'weak-psu', vars: {} };
  if (coolingHeadroom < 0) return { key: 'weak-cooling', vars: {} };
  if (gpus.length >= 2) return { key: 'multi-gpu', vars: { lanes, ratio } };
  if (stats.mixed) return { key: 'mixed-gpu', vars: {} };
  return { key: 'single-gpu', vars: {} };
}
