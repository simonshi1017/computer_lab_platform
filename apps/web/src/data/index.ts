/**
 * 应用侧的本地化数据入口。
 *
 * 为什么不在 packages/data 里改 schema：
 * 数据层有 zod 校验和「文案数字对账」测试，中文原文是这些断言的基准；
 * 给每条记录加 en 字段会同时冲击 schema、catalog.json 和后端 seed。
 * 这里改成「按 locale 深拷贝 + 按中文原文查字典覆盖」，零冲击数据层，
 * 并且 @clab/data 仍然是唯一数据源，不存在两份清单漂移。
 *
 * 切换语言是整页重载（见 i18n/index.ts::setLocale），所以模块加载时
 * 做一次本地化就够了，不需要响应式订阅。
 */
import {
  DATASET as RAW_DATASET,
  DATA_UPDATED_AT,
} from '@clab/data';
import type {
  CoolingRecord,
  CpuRecord,
  DataCatalog,
  Dataset,
  GlossaryEntry,
  GpuRecord,
  LessonRecord,
  MoboRecord,
  ModelArch,
  ModelRecord,
  PartMeta,
  PsuRecord,
  RamRecord,
  StorageRecord,
} from '@clab/data';
import type { Catalog } from '@clab/engine';
import { getLocale, t } from '@/i18n';

/**
 * 这些字段是逻辑值或标识，翻译会让筛选、比较、URL 直接失效。
 * 例如 gpuClass 同时用于「消费级/专业卡/数据中心」筛选和展示，
 * 展示处单独包 t()，数据本身必须保持中文。
 */
const LOGIC_FIELDS = new Set([
  'id',
  'gpuClass',
  'category',
  'condition',
  'source',
  'updatedAt',
  'ollamaTag',
  'license',
  'color',
  'arch',
  'releasedAt',
  'to',
  'en',
]);

const HAS_CN = /[\u3400-\u9fff]/;

function localize<T>(value: T, field?: string): T {
  if (typeof value === 'string') {
    if (!HAS_CN.test(value) || (field && LOGIC_FIELDS.has(field))) return value;
    return t(value) as T;
  }
  if (Array.isArray(value)) return value.map((item) => localize(item, field)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = localize(item, key);
    return out as T;
  }
  return value;
}

/** 应用唯一数据源：英文态是翻译后的副本，中文态直接复用原对象 */
export const DATASET: Dataset = getLocale() === 'en' ? localize(RAW_DATASET) : RAW_DATASET;

/** 喂给计算内核的目录：数值与 id 不变，展示字段随 locale */
export const CATALOG: DataCatalog = {
  gpus: DATASET.gpus,
  cpus: DATASET.parts.cpus,
  mobos: DATASET.parts.mobos,
  rams: DATASET.parts.rams,
  psus: DATASET.parts.psus,
  storages: DATASET.parts.storages,
  coolings: DATASET.parts.coolings,
};

/** 编译期检查：本地化后的目录仍满足 engine 的 Catalog 契约 */
export const ENGINE_CATALOG: Catalog = CATALOG;

export const MODELS_LIST: ModelRecord[] = DATASET.models;
export const GPUS_LIST: GpuRecord[] = DATASET.gpus;
export const GLOSSARY_LIST: GlossaryEntry[] = DATASET.glossary;
export const LESSONS_LIST: LessonRecord[] = DATASET.lessons;
export { DATA_UPDATED_AT };

export function modelById(id: string): ModelRecord | undefined {
  return DATASET.models.find((m) => m.id === id);
}

export function gpuById(id: string): GpuRecord | undefined {
  return DATASET.gpus.find((g) => g.id === id);
}

export function glossaryById(id: string): GlossaryEntry | undefined {
  return DATASET.glossary.find((g) => g.id === id);
}

export function lessonByLevel(level: number): LessonRecord | undefined {
  return DATASET.lessons.find((l) => l.level === level);
}

export type {
  Catalog,
  CoolingRecord,
  CpuRecord,
  DataCatalog,
  Dataset,
  GlossaryEntry,
  GpuRecord,
  LessonRecord,
  MoboRecord,
  ModelArch,
  ModelRecord,
  PartMeta,
  PsuRecord,
  RamRecord,
  StorageRecord,
};
