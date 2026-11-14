import type { Catalog, CoolingSpec, CpuSpec, GpuSpec, ModelSpec, MoboSpec, PsuSpec, RamSpec, StorageSpec } from '@clab/engine';

/**
 * 数据层类型 —— 在 engine 的「计算契约」之上叠加「科普内容」。
 *
 * 分层原则：
 * - engine 只认 ModelSpec / GpuSpec 这类最小字段，用来算显存和评分；
 * - 这里多出来的字段（比喻、场景、擅长、来源）只服务展示，不参与计算。
 *
 * 之所以让富记录直接兼容 ModelSpec，是为了把同一条数据同时喂给
 * `vramNeed(record, ...)` 和页面渲染，避免出现两份模型清单互相漂移。
 */

export type ModelArch = 'dense' | 'moe';

export interface ModelRecord extends ModelSpec {
  /** 中文名，列表和详情页的主标题用它 */
  cn: string;
  /** 厂商所属地区，用于筛选与「谁家的」这类问题 */
  country: string;
  arch: ModelArch;
  /** 展示用的架构中文名 */
  archLabel: string;
  /** 发布年月 */
  releasedAt: string;
  languages: string[];
  /** 一句话定位，卡片右上角标签 */
  tag: string;
  /** 图标底色 */
  color: string;
  /** 生活化比喻 */
  metaphor: string;
  /** 真实数字：典型显存占用与速度 */
  real: string;
  /** 常见误区 */
  mistake: string;
  /** Ollama 拉取标签，说明书里的部署命令直接用这个 */
  ollamaTag: string;
  /** 典型使用场景 */
  scenes: string[];
  /** 擅长什么 */
  strengths: string[];
  /** 不适合什么 */
  weaknesses: string[];
}

export interface GpuRecord extends GpuSpec {
  /** 架构代号，例如 Ada Lovelace */
  arch: string;
  /** 显存类型 */
  memoryType: string;
  /** 位宽，单位 bit */
  busWidth: number;
  /** PCIe 代数（4 / 5），拓扑图算链路带宽要用 */
  pcieGen: 4 | 5;
  /** 供电接口 */
  powerConnector: string;
  /** 卡长，单位 mm，用于判断装不装得下 */
  lengthMm: number;
  /** 适合什么场景 */
  scene: string;
  /** 一句话点评 */
  note: string;
  /** 价格状态说明（全新 / 二手行情 / 询价） */
  priceNote: string;
  /**
   * 货源状态。新手最容易被「便宜一半的 3090」吸引，,
   * 却不知道那是矿卡；推荐与详情都必须把这个说清楚。
   */
  condition: 'new' | 'used' | 'channel';
}

/** 部件记录的通用字段：来源与更新时间是「估算值可追溯」的硬要求 */
export interface PartMeta {
  source: string;
  updatedAt: string;
}

export type CpuRecord = CpuSpec & PartMeta & { vendor: string };
export type MoboRecord = MoboSpec & PartMeta & { chipset: string; socket: string };
export type RamRecord = RamSpec & PartMeta & { kind: string };
export type PsuRecord = PsuSpec & PartMeta & { level: string };
export type StorageRecord = StorageSpec & PartMeta & { kind: string };
export type CoolingRecord = CoolingSpec & PartMeta & { kind: string };

export interface GlossaryEntry {
  id: string;
  term: string;
  en: string;
  /** 别名，搜索时一并匹配 */
  alias?: string[];
  /** 小白话 */
  plain: string;
  /** 专业解释 */
  pro: string;
  /** 常见误区 */
  mistake: string;
  /** Ollama 拉取标签，说明书里的部署命令直接用这个 */
  /** 关联术语 id */
  related: string[];
  category: '模型' | '显存' | '硬件' | '部署';
}

export interface LessonRecord {
  id: string;
  /** 第几关 */
  level: number;
  title: string;
  /** 这一关要回答的问题 */
  question: string;
  /** 学完留下的输出物 */
  output: string;
  /** 关卡内要讲清的知识点 */
  points: string[];
  /** 关联的术语与页面 */
  links: { label: string; to: string }[];
}

export interface DataCatalog extends Catalog {
  gpus: GpuRecord[];
  cpus: CpuRecord[];
  mobos: MoboRecord[];
  rams: RamRecord[];
  psus: PsuRecord[];
  storages: StorageRecord[];
  coolings: CoolingRecord[];
}

export interface Dataset {
  models: ModelRecord[];
  gpus: GpuRecord[];
  parts: {
    cpus: CpuRecord[];
    mobos: MoboRecord[];
    rams: RamRecord[];
    psus: PsuRecord[];
    storages: StorageRecord[];
    coolings: CoolingRecord[];
  };
  glossary: GlossaryEntry[];
  lessons: LessonRecord[];
  /** 数据整体更新时间，页脚与免责声明显示 */
  updatedAt: string;
}
