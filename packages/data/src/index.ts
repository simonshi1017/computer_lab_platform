import type { Catalog } from '@clab/engine';
import { GLOSSARY } from './glossary.js';
import { GPUS } from './gpus.js';
import { LESSONS } from './lessons.js';
import { MODELS } from './models.js';
import { COOLINGS, CPUS, MOBOS, PSUS, RAMS, STORAGES } from './parts.js';
import { datasetSchema } from './schema.js';
import type { DataCatalog, Dataset, GlossaryEntry, GpuRecord, LessonRecord, ModelRecord } from './types.js';

const RAW = {
  models: MODELS,
  gpus: GPUS,
  parts: {
    cpus: CPUS,
    mobos: MOBOS,
    rams: RAMS,
    psus: PSUS,
    storages: STORAGES,
    coolings: COOLINGS,
  },
  glossary: GLOSSARY,
  lessons: LESSONS,
  updatedAt: '2026-11',
};

/** 数据里的所有 id 都会出现在 URL / 本地存储里，必须可预测 */
function assertUnique(kind: string, ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`[data] ${kind} 出现重复 id: ${id}`);
    seen.add(id);
  }
}

/**
 * 跨记录校验。
 * zod 只能看单条，这里补上「引用是否存在」「编号是否连续」这类关系约束。
 */
function crossCheck(dataset: Dataset): void {
  assertUnique('models', dataset.models.map((m) => m.id));
  assertUnique('gpus', dataset.gpus.map((g) => g.id));
  assertUnique('glossary', dataset.glossary.map((g) => g.id));
  assertUnique('lessons', dataset.lessons.map((l) => l.id));

  const allPartIds = [
    ...dataset.parts.cpus,
    ...dataset.parts.mobos,
    ...dataset.parts.rams,
    ...dataset.parts.psus,
    ...dataset.parts.storages,
    ...dataset.parts.coolings,
  ].map((p) => p.id);
  assertUnique('parts', allPartIds);

  const glossaryIds = new Set(dataset.glossary.map((g) => g.id));
  for (const entry of dataset.glossary) {
    for (const ref of entry.related) {
      if (!glossaryIds.has(ref)) {
        throw new Error(`[data] 术语「${entry.term}」引用了不存在的 related: ${ref}`);
      }
    }
  }

  const levels = dataset.lessons.map((l) => l.level).sort((a, b) => a - b);
  levels.forEach((level, index) => {
    if (level !== index + 1) {
      throw new Error(`[data] 关卡编号不连续：期望 ${index + 1}，实际 ${level}`);
    }
  });

  // 推荐会遍历「每张卡 × 1–4 张」，目录里没有能带动的电源时方案会静默消失。
  // 这里提前断言：最大电源必须覆盖「四张最强桌面卡」的组合。
  //
  // 数据中心卡（SXM / OAM 板载）不参与这个判断：它们不能插进用户自己装的机箱，
  // 也就不存在「按 1.3 倍配电源」这回事，混进来只会让断言失真。
  const desktopGpus = dataset.gpus.filter((gpu) => gpu.gpuClass !== '数据中心');
  const strongestFour = [...desktopGpus]
    .sort((a, b) => b.tdpW - a.tdpW)
    .slice(0, 4)
    .reduce((sum, gpu) => sum + gpu.tdpW, 0);
  const maxPsu = Math.max(...dataset.parts.psus.map((p) => p.watt));
  if (maxPsu < strongestFour * 1.2) {
    throw new Error(
      `[data] 最大电源 ${maxPsu}W 带不动最强四卡组合（约 ${Math.round(strongestFour * 1.2)}W），推荐结果会缺失`,
    );
  }

  // 散热上限必须压得住最强的桌面单卡
  const maxDesktopTdp = Math.max(...desktopGpus.map((g) => g.tdpW));
  const maxCooling = Math.max(...dataset.parts.coolings.map((c) => c.capacityW));
  if (maxCooling < maxDesktopTdp) {
    throw new Error(`[data] 最强散热只能压 ${maxCooling}W，低于最强桌面显卡 ${maxDesktopTdp}W`);
  }
}

/**
 * 校验并返回数据。
 * 导出成函数是为了让测试能拿坏数据验证「确实会报错」。
 */
export function validateDataset(raw: unknown): Dataset {
  const parsed = datasetSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`[data] 数据校验失败（共 ${parsed.error.issues.length} 处）：\n${detail}`);
  }
  const dataset = parsed.data as Dataset;
  crossCheck(dataset);
  return dataset;
}

/** 应用使用的唯一数据源：模块加载即校验，不合格直接让构建失败 */
export const DATASET: Dataset = validateDataset(RAW);

/** 喂给计算内核的目录（字段是 Dataset 的子集，结构兼容） */
export const CATALOG: DataCatalog = {
  gpus: DATASET.gpus,
  cpus: DATASET.parts.cpus,
  mobos: DATASET.parts.mobos,
  rams: DATASET.parts.rams,
  psus: DATASET.parts.psus,
  storages: DATASET.parts.storages,
  coolings: DATASET.parts.coolings,
};

/** 需要满足 engine 的 Catalog 接口 —— 编译期检查，防止字段漂移 */
export const ENGINE_CATALOG: Catalog = CATALOG;

export const MODELS_LIST: ModelRecord[] = DATASET.models;
export const GPUS_LIST: GpuRecord[] = DATASET.gpus;
export const GLOSSARY_LIST: GlossaryEntry[] = DATASET.glossary;
export const LESSONS_LIST: LessonRecord[] = DATASET.lessons;
export const DATA_UPDATED_AT = DATASET.updatedAt;

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

export * from './types.js';
