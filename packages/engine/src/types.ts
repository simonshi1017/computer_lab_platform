/**
 * 领域类型 —— 计算内核与 UI 之间的唯一契约。
 * 这里只描述「数据长什么样」，不含任何算法。
 */

export type Quant = 'fp16' | 'int8' | 'int4';

export type GpuVendor = 'NVIDIA' | 'AMD' | 'Intel';

export type GpuClass = '消费级' | '专业卡' | '数据中心';

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | '—';

/** 模型规格（M2 起由 data/models.json 提供，字段一一对应） */
export interface ModelSpec {
  id: string;
  name: string;
  /** 厂商，例如「阿里云」「Meta」 */
  vendor: string;
  /** 架构描述，例如「Dense 稠密」「MoE 混合专家」 */
  arch: string;
  /** 参数量，单位 B（十亿） */
  paramsB: number;
  /** 网络层数 */
  layers: number;
  /** 隐藏维度 */
  hiddenDim: number;
  /** 最大上下文，单位 token */
  ctxMax: number;
  license?: string;
  /** 数据来源链接，用于「估算值必须可追溯」 */
  source?: string;
  updatedAt?: string;
}

/** 显卡规格 */
export interface GpuSpec {
  id: string;
  name: string;
  vendor: GpuVendor;
  gpuClass: GpuClass;
  /** 显存，单位 GB */
  vramGb: number;
  /** 显存带宽，单位 GB/s */
  bandwidth: number;
  /** 热设计功耗，单位 W */
  tdpW: number;
  /** 参考价，单位元 */
  priceCny: number;
  source?: string;
  updatedAt?: string;
}

export interface CpuSpec {
  id: string;
  name: string;
  cores: string;
  /** 插槽类型，必须与主板一致，否则点不亮 */
  socket: string;
  tdpW: number;
  priceCny: number;
}

export interface MoboSpec {
  id: string;
  name: string;
  /** 插槽类型，必须与 CPU 一致 */
  socket: string;
  /** 可插显卡数量 */
  gpuSlots: number;
  ramSlots: number;
  tdpW: number;
  priceCny: number;
}

export interface RamSpec {
  id: string;
  name: string;
  capacityGb: number;
  tdpW: number;
  priceCny: number;
}

export interface PsuSpec {
  id: string;
  name: string;
  watt: number;
  priceCny: number;
}

export interface StorageSpec {
  id: string;
  name: string;
  capacityTb: number;
  tdpW: number;
  priceCny: number;
}

export interface CoolingSpec {
  id: string;
  name: string;
  priceCny: number;
  noiseDb: number;
  /** 可压制的发热量，单位 W（风冷 200 / 240 水冷 280 / 360 水冷 400 / 涡轮 800） */
  capacityW: number;
}

/** 全站可选的硬件目录（M2 由数据层注入） */
export interface Catalog {
  gpus: GpuSpec[];
  cpus: CpuSpec[];
  mobos: MoboSpec[];
  rams: RamSpec[];
  psus: PsuSpec[];
  storages: StorageSpec[];
  coolings: CoolingSpec[];
}

/** 用户组装的一套配置 */
export interface Build {
  gpuIds: string[];
  cpuId: string | null;
  moboId: string | null;
  ramIds: string[];
  psuId: string | null;
  storageIds: string[];
  coolingId: string | null;
}

export const EMPTY_BUILD: Build = {
  gpuIds: [],
  cpuId: null,
  moboId: null,
  ramIds: [],
  psuId: null,
  storageIds: [],
  coolingId: null,
};

/** 显存占用拆解，便于在 UI 上分摊展示 */
export interface VramBreakdown {
  /** 权重占用 GB */
  weights: number;
  /** KV Cache 占用 GB */
  kvCache: number;
  /** 框架开销 GB */
  overhead: number;
  /** 安全余量 GB */
  margin: number;
  /** 合计 GB */
  total: number;
}

/** 配置的物理与成本统计 */
export interface BuildStats {
  gpus: GpuSpec[];
  cpu: CpuSpec | null;
  mobo: MoboSpec | null;
  rams: RamSpec[];
  psu: PsuSpec | null;
  storages: StorageSpec[];
  cooling: CoolingSpec | null;
  /** 可用显存（混插不同型号时按最小卡 × 卡数） */
  vramGb: number;
  ramGb: number;
  /** 整机功耗 = ΣTDP × 1.2 */
  powerW: number;
  priceCny: number;
  /** 月电费 */
  elecMonthlyCny: number;
  /** 是否混插了不同型号的显卡 */
  mixed: boolean;
}

export interface Dimension {
  key: 'compat' | 'perf' | 'cost' | 'thermo' | 'expand' | 'match';
  label: string;
  /** 0–100 */
  score: number;
  weight: number;
  /** 给小白的一句提问式说明 */
  hint: string;
}

export type RiskLevel = 'err' | 'warn' | 'ok' | 'info';

export interface Risk {
  level: RiskLevel;
  title: string;
  desc: string;
}

export type PresetKey = 'save' | 'balance' | 'perf';

export type SuggestionAction =
  | { type: 'set-quant'; quant: Quant }
  | { type: 'set-ctx'; ctx: number }
  | { type: 'apply-preset'; preset: PresetKey }
  | { type: 'auto-psu' }
  | { type: 'auto-ram' }
  | { type: 'set-cooling'; coolingId: string }
  | { type: 'navigate'; to: string };

export interface Suggestion {
  id: string;
  label: string;
  action: SuggestionAction;
}

export interface Evaluation {
  /** 核心部件不全时为 true，此时 score 为 0、grade 为 '—' */
  empty: boolean;
  score: number;
  grade: Grade;
  dimensions: Dimension[];
  risks: Risk[];
  suggestions: Suggestion[];
  stats: BuildStats;
  tps: number;
  need: VramBreakdown;
  /** 显存余量比例，负数表示放不下 */
  headroom: number;
}

export type RecommendPref = 'save' | 'balance' | 'perf' | 'quiet';

export interface RecommendInput {
  model: ModelSpec;
  quant: Quant;
  ctx: number;
  budget: number;
  pref: RecommendPref;
  catalog: Catalog;
}

/** 推荐求解出来的候选配置 */
export interface TierBuild {
  key: string;
  gpu: GpuSpec;
  gpuCount: number;
  cpu: CpuSpec;
  mobo: MoboSpec;
  ramIds: string[];
  rams: RamSpec[];
  psu: PsuSpec;
  storage: StorageSpec;
  cooling: CoolingSpec;
  vramGb: number;
  headroom: number;
  powerW: number;
  priceCny: number;
  tps: number;
  /** 计入生态折价后的吞吐，仅用于排序 */
  effectiveTps: number;
}

export interface Tier extends TierBuild {
  name: string;
  desc: string;
  picked: boolean;
}

export interface Recommendation {
  tiers: Tier[];
  need: VramBreakdown;
  /** 可行方案不足三档时为 true，UI 应展示说明卡 */
  limited: boolean;
}
