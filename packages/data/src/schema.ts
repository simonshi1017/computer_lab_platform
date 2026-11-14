import { z } from 'zod';

/**
 * 数据校验 schema。
 *
 * 目的不是「防黑客」，而是防自己：数据是手写的，字段漏一个、
 * 单位写错一个数量级，页面就会显示一个看起来很正常但其实荒谬的数字。
 * 这类错误如果放到线上，用户会照着买错硬件。
 *
 * 原则：
 * - 结构性约束（必填、类型、范围）在这里；
 * - 跨记录约束（id 唯一、引用存在）在 validateDataset 里；
 * - 任何一条数据不合格，构建就应该失败。
 */

const ISO_MONTH = /^\d{4}-\d{2}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const sourceField = z.string().url('source 必须是可访问的 URL');
const updatedAtField = z.string().regex(ISO_MONTH, 'updatedAt 格式应为 YYYY-MM');

export const modelSchema = z.object({
  id: z.string().regex(KEBAB, 'id 应为 kebab-case'),
  name: z.string().min(2),
  cn: z.string().min(2),
  vendor: z.string().min(2),
  country: z.string().min(2),
  arch: z.enum(['dense', 'moe']),
  archLabel: z.string().min(2),
  paramsB: z.number().positive().max(3000),
  /** MoE 的激活参数；必须小于总参数，否则速度估算会失真 */
  activeParamsB: z.number().positive().max(3000).optional(),
  layers: z.number().int().positive().max(200),
  hiddenDim: z.number().int().positive().max(32768),
  ctxMax: z
    .number()
    .int()
    .min(1024)
    .refine((v) => v % 1024 === 0, 'ctxMax 应为 1024 的整数倍'),
  license: z.string().min(2).optional(),
  releasedAt: z.string().regex(ISO_MONTH),
  languages: z.array(z.string()).min(1),
  tag: z.string().min(2).max(8),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  metaphor: z.string().min(10),
  real: z.string().min(10),
  mistake: z.string().min(20),
  ollamaTag: z
    .string()
    .regex(/^[a-z0-9.-]+:[A-Za-z0-9._-]+$/, 'ollamaTag 应形如 name:tag（量化后缀含大写 K/M）'),
  scenes: z.array(z.string().min(2)).min(2).max(6),
  strengths: z.array(z.string().min(6)).min(2).max(4),
  weaknesses: z.array(z.string().min(6)).min(1).max(4),
  source: sourceField,
  updatedAt: updatedAtField,
}).refine((m) => m.activeParamsB === undefined || m.activeParamsB <= m.paramsB, {
  message: 'activeParamsB 不能大于 paramsB（激活参数是总参数的一部分）',
  path: ['activeParamsB'],
});

export const gpuSchema = z.object({
  id: z.string().regex(KEBAB),
  name: z.string().min(3),
  vendor: z.enum(['NVIDIA', 'AMD', 'Intel']),
  arch: z.string().min(2),
  gpuClass: z.enum(['消费级', '专业卡', '数据中心']),
  vramGb: z.number().int().min(8).max(1024),
  memoryType: z.string().min(3),
  busWidth: z.number().int().positive(),
  pcieGen: z.union([z.literal(4), z.literal(5)]),
  bandwidth: z.number().positive().max(20000),
  tdpW: z.number().int().positive().max(2000),
  powerConnector: z.string().min(2),
  lengthMm: z.number().int().min(0).max(600),
  priceCny: z.number().positive(),
  priceNote: z.string().min(4),
  condition: z.enum(['new', 'used', 'channel']),
  scene: z.string().min(6),
  note: z.string().min(10),
  source: sourceField,
  updatedAt: updatedAtField,
});

/**
 * 部件公共字段。
 * 注意 tdpW 只属于「会发热并计入整机功耗」的部件；
 * 电源和散热不计入 ΣTDP（电源是供给方，散热是被动件），
 * 所以它们用 identity 而不是 powerPart。
 */
const identity = {
  id: z.string().regex(KEBAB),
  name: z.string().min(2),
  priceCny: z.number().positive(),
  source: sourceField,
  updatedAt: updatedAtField,
};

const powerPart = {
  ...identity,
  tdpW: z.number().min(0).max(2000),
};

export const cpuSchema = z.object({
  ...powerPart,
  vendor: z.string().min(2),
  cores: z.string().min(3),
  socket: z.string().min(2),
});

export const moboSchema = z.object({
  ...powerPart,
  chipset: z.string().min(2),
  socket: z.string().min(2),
  gpuSlots: z.number().int().min(1).max(8),
  ramSlots: z.number().int().min(1).max(16),
});

export const ramSchema = z.object({
  ...powerPart,
  kind: z.string().min(3),
  capacityGb: z.number().int().min(8).max(1024),
});

export const psuSchema = z.object({
  ...identity,
  level: z.string().min(2),
  watt: z.number().int().min(300).max(5000),
});

export const storageSchema = z.object({
  ...powerPart,
  kind: z.string().min(3),
  capacityTb: z.number().positive().max(64),
});

export const coolingSchema = z.object({
  ...identity,
  kind: z.string().min(2),
  noiseDb: z.number().min(15).max(80),
  capacityW: z.number().int().min(50).max(2000),
});

export const glossarySchema = z.object({
  id: z.string().regex(KEBAB),
  term: z.string().min(1),
  en: z.string().min(1),
  alias: z.array(z.string()).optional(),
  category: z.enum(['模型', '显存', '硬件', '部署']),
  plain: z.string().min(10),
  pro: z.string().min(20),
  mistake: z.string().min(20),
  related: z.array(z.string()),
});

export const lessonSchema = z.object({
  id: z.string().regex(KEBAB),
  level: z.number().int().min(1).max(9),
  title: z.string().min(2),
  question: z.string().min(6),
  output: z.string().min(6),
  points: z.array(z.string().min(6)).min(3),
  links: z.array(z.object({ label: z.string().min(2), to: z.string().startsWith('/') })).min(1),
});

export const datasetSchema = z.object({
  models: z.array(modelSchema).min(6, 'M2 要求至少 6 条模型数据'),
  gpus: z.array(gpuSchema).min(14, 'M2 要求至少 14 条显卡数据'),
  parts: z.object({
    cpus: z.array(cpuSchema).min(3),
    mobos: z.array(moboSchema).min(2),
    rams: z.array(ramSchema).min(2),
    psus: z.array(psuSchema).min(3),
    storages: z.array(storageSchema).min(2),
    coolings: z.array(coolingSchema).min(2),
  }),
  glossary: z.array(glossarySchema).min(8),
  lessons: z.array(lessonSchema).min(5),
  updatedAt: updatedAtField,
});
