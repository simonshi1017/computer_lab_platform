import type { BuildStats, GpuSpec, ModelSpec, Quant } from './types.js';
import { vramNeed } from './vram.js';

/**
 * 硬件拓扑：把「机箱里那台机器」抽象成节点与链路。
 *
 * 为什么放在内核算而不是组件里：拓扑里的每个数字都要能对得上
 * （PCIe 拆分、带宽比、加载时间、供电余量），写在 JSX 里就没法单测，
 * 也容易和显存/功耗的公式各说各话。
 *
 * 数据里能拿到的：
 * - 显卡显存带宽、PCIe 代数、TDP；
 * - 内存条数量与容量（DDR5）；
 * - 硬盘容量与接口（NVMe）；
 * - 电源瓦数、散热能力、主板插槽数。
 *
 * 拿不到、但必须给用户一个量级的概念：内存通道带宽。这里按「双通道
 * DDR5-5600」估算，并明确标注是估算——比不给数字好，也比假装精确好。
 */

/** PCIe 单通道单向有效带宽（GB/s，含 128b/130b 编码开销后的近似值） */
export const PCIE_LANE_GBPS: Record<4 | 5, number> = {
  4: 1.969,
  5: 3.938,
};

/** 双通道 DDR5-5600 的理论带宽；实际可用约七成，这里给理论值并标注 */
export const DDR5_DUAL_CHANNEL_GBPS = 89.6;

export type TopologyNodeKind = 'cpu' | 'gpu' | 'ram' | 'storage' | 'psu' | 'cooling';

export interface TopologyNode {
  id: string;
  kind: TopologyNodeKind;
  /** 卡片标题，例如「RTX 5090 32G」 */
  label: string;
  /** 关键指标，例如「1792GB/s」「32GB」 */
  metric: string;
  /** 次要说明，例如「PCIe 5.0 ×16」 */
  detail: string;
  /** 缺件时节点变虚，提示用户还没配 */
  missing: boolean;
}

export interface TopologyLink {
  from: string;
  to: string;
  /** 链路名称，例如「PCIe 5.0 ×16」 */
  label: string;
  /** 链路带宽，GB/s；null 表示这条链路不适用带宽（供电、散热） */
  gbps: number | null;
  /** 与显存带宽的比值，越大说明越可能成为瓶颈；null 表示不适用 */
  ratio: number | null;
  /** 这条链路是否是当前配置的瓶颈 */
  bottleneck: boolean;
}

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

export interface Topology {
  nodes: TopologyNode[];
  links: TopologyLink[];
  /** 一句话结论：这台机器的瓶颈在哪（由 UI 按 key 组句） */
  verdict: Verdict;
  /** 模型加载耗时估算（秒），没有模型时为 null */
  loadSeconds: number | null;
  /** 供电余量比例，负数表示不够 */
  powerHeadroom: number;
  /** 散热余量比例 */
  coolingHeadroom: number;
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
  if (gpuCount === 2) return 8;
  return 8;
}

/** 单张卡的 PCIe 链路带宽（GB/s，单向） */
export function pcieBandwidth(gpu: GpuSpec, lanes: number): number {
  const gen = gpu.pcieGen ?? 4;
  return PCIE_LANE_GBPS[gen] * lanes;
}

/**
 * NVMe 盘的顺序读带宽。
 * 数据里只有容量和「PCIe 4.0 NVMe」这类描述，按 PCIe 4.0 ×4 的实际上限
 * 取 7GB/s（标称 7.4GB/s，留一点编码与协议开销）。
 */
const NVME_READ_GBPS = 7;

export function describeTopology(input: TopologyInput): Topology {
  const { stats, model, quant = 'int4', ctx = 8192 } = input;
  const gpus = stats.gpus;
  const lanes = pcieLanesFor(gpus.length);
  const nodes: TopologyNode[] = [];
  const links: TopologyLink[] = [];

  const cpu = stats.cpu;
  nodes.push({
    id: 'cpu',
    kind: 'cpu',
    label: cpu?.name ?? '未选 CPU',
    metric: cpu ? `${cpu.cores}` : '—',
    detail: cpu ? `TDP ${cpu.tdpW}W` : '',
    missing: !cpu,
  });

  const ramGb = stats.ramGb;
  const dimmCount = stats.rams.length;
  nodes.push({
    id: 'ram',
    kind: 'ram',
    label: dimmCount > 0 ? `${dimmCount} 条内存` : '未装内存',
    metric: ramGb > 0 ? `${ramGb}GB` : '—',
    detail: dimmCount > 0 ? `双通道 DDR5 ≈ ${DDR5_DUAL_CHANNEL_GBPS}GB/s（估算）` : '',
    missing: dimmCount === 0,
  });

  const storage = stats.storages[0] ?? null;
  nodes.push({
    id: 'storage',
    kind: 'storage',
    label: storage?.name ?? '未装硬盘',
    metric: storage ? `${storage.capacityTb}TB` : '—',
    detail: storage ? `NVMe ≈ ${NVME_READ_GBPS}GB/s` : '',
    missing: !storage,
  });

  gpus.forEach((gpu, index) => {
    nodes.push({
      id: `gpu-${index}`,
      kind: 'gpu',
      label: gpu.name,
      metric: `${gpu.bandwidth}GB/s`,
      detail: `${gpu.vramGb}GB · PCIe ${gpu.pcieGen ?? 4}.0 ×${lanes}`,
      missing: false,
    });
  });

  nodes.push({
    id: 'psu',
    kind: 'psu',
    label: stats.psu?.name ?? '未选电源',
    metric: stats.psu ? `${stats.psu.watt}W` : '—',
    detail: stats.psu ? `整机估算 ${Math.round(stats.powerW)}W` : '',
    missing: !stats.psu,
  });

  nodes.push({
    id: 'cooling',
    kind: 'cooling',
    label: stats.cooling?.name ?? '未选散热',
    metric: stats.cooling ? `${stats.cooling.capacityW}W` : '—',
    detail: stats.cooling ? `噪声 ${stats.cooling.noiseDb}dB` : '',
    missing: !stats.cooling,
  });

  // CPU ↔ 内存
  if (dimmCount > 0) {
    links.push({
      from: 'cpu',
      to: 'ram',
      label: '内存通道',
      gbps: DDR5_DUAL_CHANNEL_GBPS,
      ratio: null,
      bottleneck: false,
    });
  }

  // CPU ↔ 硬盘
  if (storage) {
    links.push({
      from: 'cpu',
      to: 'storage',
      label: 'NVMe ×4',
      gbps: NVME_READ_GBPS,
      ratio: null,
      bottleneck: false,
    });
  }

  // CPU ↔ 每张卡
  gpus.forEach((gpu, index) => {
    const gbps = pcieBandwidth(gpu, lanes);
    const ratio = gpu.bandwidth / gbps;
    links.push({
      from: 'cpu',
      to: `gpu-${index}`,
      label: `PCIe ${gpu.pcieGen ?? 4}.0 ×${lanes}`,
      gbps,
      ratio,
      // 单卡时带宽比虽然悬殊，但推理是常驻显存、几乎不过 PCIe，
      // 所以只在「多卡」时把 PCIe 标成瓶颈（跨卡通信真的走这里）。
      bottleneck: gpus.length > 1,
    });
  });

  // 电源、散热：不带宽度的两条「供给链路」
  if (stats.psu) {
    links.push({ from: 'psu', to: 'cpu', label: '供电', gbps: null, ratio: null, bottleneck: false });
  }
  if (stats.cooling) {
    links.push({ from: 'cooling', to: 'cpu', label: '风道', gbps: null, ratio: null, bottleneck: false });
  }

  const powerHeadroom = stats.psu ? (stats.psu.watt - stats.powerW) / stats.psu.watt : -1;
  const coolingHeadroom = stats.cooling ? (stats.cooling.capacityW - stats.powerW * 0.8) / stats.cooling.capacityW : -1;

  let loadSeconds: number | null = null;
  if (model) {
    const need = vramNeed(model, quant, ctx);
    // 加载 = 从盘读到内存，再经 PCIe 进显存；取两者中更慢的一段，
    // 不叠加（实际是流水线，叠加会高估一倍）。
    const diskSeconds = need.weights / NVME_READ_GBPS;
    const pcieSeconds = gpus.length > 0 ? need.weights / (pcieBandwidth(gpus[0], lanes) * Math.max(1, gpus.length * 0.8)) : Number.POSITIVE_INFINITY;
    loadSeconds = Math.max(diskSeconds, pcieSeconds);
  }

  return {
    nodes,
    links,
    verdict: verdictOf({ gpus, stats, powerHeadroom, coolingHeadroom, lanes }),
    loadSeconds,
    powerHeadroom,
    coolingHeadroom,
  };
}

function verdictOf(args: {
  gpus: GpuSpec[];
  stats: BuildStats;
  powerHeadroom: number;
  coolingHeadroom: number;
  lanes: number;
}): Verdict {
  const { gpus, stats, powerHeadroom, coolingHeadroom, lanes } = args;
  if (gpus.length === 0) return { key: 'no-gpu', vars: {} };
  if (powerHeadroom < 0) return { key: 'weak-psu', vars: {} };
  if (coolingHeadroom < 0) return { key: 'weak-cooling', vars: {} };
  if (gpus.length >= 2) {
    return {
      key: 'multi-gpu',
      vars: {
        lanes,
        ratio: Math.round(gpus[0].bandwidth / pcieBandwidth(gpus[0], lanes)),
      },
    };
  }
  if (stats.mixed) return { key: 'mixed-gpu', vars: {} };
  return { key: 'single-gpu', vars: {} };
}
