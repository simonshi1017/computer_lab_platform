import {
  BookOpen,
  Code2,
  Coins,
  FlaskConical,
  MessageCircle,
  Server,
  type LucideIcon,
} from 'lucide-react';
import type { Build, BuildStats, ModelSpec, Quant } from '@clab/engine';
import { t } from '@/i18n';

/**
 * 场景实验室的数据与校验内核。
 *
 * 设计上刻意把「场景是什么」和「步骤怎么算完成」分开：
 * - 场景是纯数据（id、目标、推荐配置、步骤清单），可以直接枚举、筛选、序列化；
 * - 步骤的完成条件是可 JSON 化的 StepCheck，不是闭包。这样校验逻辑集中在一个
 *   纯函数里，能写单测、能按不同配置反复跑，也不会因为 React 重渲染重建闭包。
 *
 * 为什么不放 packages/data：场景是「教学目标 + 一套装机配置」的产品编排，
 * 会引用前端 i18n 和图标；数据层的 zod schema、catalog.json 与后端 seed 都
 * 不该被教学目标污染。和 presets.ts 一样放在应用侧。
 */

export type ScenarioLevel = 'starter' | 'intermediate' | 'advanced';

/** 步骤的自动校验条件。全部是可序列化的数据，由 isStepDone 统一解释。 */
export type StepCheck =
  | { kind: 'model'; modelId: string }
  | { kind: 'gpuCount'; min: number }
  | { kind: 'quant'; quant: Quant }
  | { kind: 'ctx'; min: number }
  | { kind: 'headroom'; min: number }
  | { kind: 'power'; minMargin: number }
  | { kind: 'cooling' }
  | { kind: 'price'; max: number }
  | { kind: 'score'; min: number }
  | { kind: 'ram'; minGb: number }
  | { kind: 'complete' };

export interface LabStep {
  /** ASCII 稳定标识，用于 React key 与埋点 */
  id: string;
  title: string;
  hint: string;
  check: StepCheck;
}

export interface Scenario {
  id: string;
  icon: LucideIcon;
  name: string;
  /** 卡片标题下的一句话目标 */
  tagline: string;
  /** 卡片正文：这个场景在教什么 */
  summary: string;
  level: ScenarioLevel;
  tags: string[];
  /** 组装台任务卡顶部展示的实验目标 */
  goal: string;
  modelId: string;
  quant: Quant;
  ctx: number;
  /** 一键载入的预算（元） */
  budget: number;
  build: Build;
  steps: LabStep[];
}

/** 校验所需的最小上下文，全部来自 useBuild 的派生结果。 */
export interface LabContext {
  modelId: string;
  customSpec: ModelSpec | null;
  quant: Quant;
  ctx: number;
  budget: number;
  stats: BuildStats;
  /** evaluation.headroom，负数表示显存放不下 */
  headroom: number;
  /** evaluation.score */
  score: number;
}

export interface StepResult {
  step: LabStep;
  done: boolean;
}

/** 把单个校验条件解释成布尔值。纯函数，不依赖 React 与 DOM。 */
export function isStepDone(check: StepCheck, ctx: LabContext): boolean {
  switch (check.kind) {
    case 'model':
      return !ctx.customSpec && ctx.modelId === check.modelId;
    case 'gpuCount':
      return ctx.stats.gpus.length >= check.min;
    case 'quant':
      return ctx.quant === check.quant;
    case 'ctx':
      return ctx.ctx >= check.min;
    case 'headroom':
      return ctx.headroom >= check.min;
    case 'power':
      return Boolean(ctx.stats.psu) && ctx.stats.psu!.watt >= ctx.stats.powerW * (1 + check.minMargin);
    case 'cooling':
      return Boolean(ctx.stats.cooling) && ctx.stats.cooling!.capacityW >= ctx.stats.powerW * 0.8;
    case 'price':
      return ctx.stats.priceCny > 0 && ctx.stats.priceCny <= check.max;
    case 'score':
      return ctx.score >= check.min;
    case 'ram':
      return ctx.stats.ramGb >= check.minGb;
    case 'complete':
      return Boolean(
        ctx.stats.gpus.length > 0 && ctx.stats.cpu && ctx.stats.mobo && ctx.stats.psu && ctx.stats.cooling,
      );
  }
}

export function evaluateSteps(scenario: Scenario, ctx: LabContext): StepResult[] {
  return scenario.steps.map((step) => ({ step, done: isStepDone(step.check, ctx) }));
}

export function stepProgress(results: StepResult[]): { done: number; total: number; ratio: number } {
  const done = results.filter((item) => item.done).length;
  return { done, total: results.length, ratio: results.length ? done / results.length : 0 };
}

/* ------------------------------------------------------------------ *
 * 场景清单
 *
 * 顺序即推荐学习顺序：先「能跑起来」，再「跑长文本 / 跑并发」，最后
 * 是微调与成本极限。每套配置的显存、供电、散热与预算都经过内核校准，
 * 一键载入后所有步骤都能达成（见 scenarios.test.ts 的回归断言）。
 * ------------------------------------------------------------------ */

export const SCENARIO_LIST: Scenario[] = [
  {
    id: 'local-chat',
    icon: MessageCircle,
    name: t("本地聊天助手"),
    tagline: t("让 7B 模型在自己电脑上开口说话"),
    summary: t("从零搭一台最便宜的本地推理机：选一张入门卡、配好内存与电源，把第一句话跑出来。重点理解量化为什么能让小显存装下模型。"),
    level: 'starter',
    tags: [t("入门"), t("单卡"), t("低预算")],
    goal: t("用最低成本配出一台能流畅对话的本地服务器"),
    modelId: 'qwen25-7b',
    quant: 'int4',
    ctx: 8192,
    budget: 9000,
    build: {
      gpuIds: ['rtx3060'],
      cpuId: 'r5-7600',
      moboId: 'b650',
      ramIds: ['ram32', 'ram32'],
      psuId: 'psu650',
      storageIds: ['ssd1t'],
      coolingId: 'aio240',
    },
    steps: [
      {
        id: 'model',
        title: t("选对目标模型"),
        hint: t("目标设为 Qwen2.5 7B，在顶部下拉框里选它"),
        check: { kind: 'model', modelId: 'qwen25-7b' },
      },
      {
        id: 'gpu',
        title: t("装上第一张显卡"),
        hint: t("从部件库拖一张卡进 PCIe 槽位"),
        check: { kind: 'gpuCount', min: 1 },
      },
      {
        id: 'quant',
        title: t("用 INT4 量化压显存"),
        hint: t("把量化切到 INT4，权重占用会减半再减半"),
        check: { kind: 'quant', quant: 'int4' },
      },
      {
        id: 'headroom',
        title: t("确认显存放得下"),
        hint: t("评估面板的显存余量必须为正"),
        check: { kind: 'headroom', min: 0.1 },
      },
      {
        id: 'complete',
        title: t("补齐核心部件"),
        hint: t("显卡、CPU、主板、电源、散热一个都不能少"),
        check: { kind: 'complete' },
      },
    ],
  },
  {
    id: 'rag-kb',
    icon: BookOpen,
    name: t("长文档知识库"),
    tagline: t("32K 上下文，把整份文档一次读完"),
    summary: t("RAG 的瓶颈不是权重而是 KV Cache。把上下文拉到 32K，看显存怎么被吃掉，再用双卡把余量补回来。"),
    level: 'intermediate',
    tags: [t("进阶"), t("长上下文"), t("双卡")],
    goal: t("在 32K 上下文下为 14B 模型留出可用显存"),
    modelId: 'qwen25-14b',
    quant: 'int4',
    ctx: 32768,
    budget: 26000,
    build: {
      gpuIds: ['rtx4070tis', 'rtx4070tis'],
      cpuId: 'r7-7700',
      moboId: 'x670e',
      ramIds: ['ram64', 'ram64'],
      psuId: 'psu1000',
      storageIds: ['ssd2t'],
      coolingId: 'turbine',
    },
    steps: [
      {
        id: 'model',
        title: t("锁定 14B 级模型"),
        hint: t("知识库要读懂长文，7B 的语义容量不够"),
        check: { kind: 'model', modelId: 'qwen25-14b' },
      },
      {
        id: 'ctx',
        title: t("把上下文拉到 32K"),
        hint: t("拖动顶部滑块，观察 KV Cache 的增长"),
        check: { kind: 'ctx', min: 32768 },
      },
      {
        id: 'gpu',
        title: t("用两张卡凑显存"),
        hint: t("单卡放不下时，双卡是最直接的扩容方式"),
        check: { kind: 'gpuCount', min: 2 },
      },
      {
        id: 'headroom',
        title: t("留出 10% 以上余量"),
        hint: t("长对话还会继续吃显存，别卡在临界点"),
        check: { kind: 'headroom', min: 0.1 },
      },
      {
        id: 'cooling',
        title: t("压住双卡发热"),
        hint: t("双卡持续满载，散热能力不能低于整机功耗"),
        check: { kind: 'cooling' },
      },
    ],
  },
  {
    id: 'code-assistant',
    icon: Code2,
    name: t("本地代码助手"),
    tagline: t("补全要快，16K 上下文够看整个文件"),
    summary: t("代码补全对延迟最敏感：带宽决定每秒吐多少 token。用一张高带宽卡换速度，同时用大内存保证模型加载不卡。"),
    level: 'intermediate',
    tags: [t("进阶"), t("低延迟"), t("大内存")],
    goal: t("在预算内拿到能实时补全的吞吐与足够内存"),
    modelId: 'qwen25-14b',
    quant: 'int4',
    ctx: 16384,
    budget: 30000,
    build: {
      gpuIds: ['rtx4090'],
      cpuId: 'r7-7700',
      moboId: 'x670e',
      ramIds: ['ram64', 'ram64'],
      psuId: 'psu1000',
      storageIds: ['ssd2t'],
      coolingId: 'aio360',
    },
    steps: [
      {
        id: 'model',
        title: t("选一个代码能力够用的模型"),
        hint: t("14B 是本地代码助手的性价比拐点"),
        check: { kind: 'model', modelId: 'qwen25-14b' },
      },
      {
        id: 'ctx',
        title: t("上下文至少 16K"),
        hint: t("要一次读进整个源文件，8K 会截断"),
        check: { kind: 'ctx', min: 16384 },
      },
      {
        id: 'ram',
        title: t("内存配到 128GB"),
        hint: t("模型加载与索引构建都吃系统内存"),
        check: { kind: 'ram', minGb: 128 },
      },
      {
        id: 'power',
        title: t("电源留 20% 冗余"),
        hint: t("瞬时功耗会冲高，电源别按标称值卡死"),
        check: { kind: 'power', minMargin: 0.2 },
      },
      {
        id: 'score',
        title: t("六维评分达到 70 分"),
        hint: t("看评估面板，速度、成本、散热要均衡"),
        check: { kind: 'score', min: 70 },
      },
    ],
  },
  {
    id: 'team-api',
    icon: Server,
    name: t("小团队 API 服务"),
    tagline: t("32B 模型，多人并发也不掉速"),
    summary: t("给三五个人共用的推理服务：模型要大、显存要足、供电和散热要能扛长跑。学会看整机功耗与持续负载。"),
    level: 'advanced',
    tags: [t("挑战"), t("大模型"), t("长跑")],
    goal: t("配出一台能 7×24 稳定服务多人的推理机"),
    modelId: 'qwen25-32b',
    quant: 'int4',
    ctx: 16384,
    budget: 50000,
    build: {
      gpuIds: ['rtx5090'],
      cpuId: 'r9-7950x',
      moboId: 'x670e',
      ramIds: ['ram128', 'ram128'],
      psuId: 'psu1600',
      storageIds: ['ssd4t'],
      coolingId: 'turbine',
    },
    steps: [
      {
        id: 'model',
        title: t("上 32B 级模型"),
        hint: t("多人共用时，模型能力要留余量"),
        check: { kind: 'model', modelId: 'qwen25-32b' },
      },
      {
        id: 'headroom',
        title: t("显存余量 >= 10%"),
        hint: t("并发请求会叠加 KV Cache，不能按单请求算"),
        check: { kind: 'headroom', min: 0.1 },
      },
      {
        id: 'power',
        title: t("电源留 30% 冗余"),
        hint: t("长时间满载，电源必须留足余量"),
        check: { kind: 'power', minMargin: 0.3 },
      },
      {
        id: 'cooling',
        title: t("换上高负载散热"),
        hint: t("7×24 运行最怕积热降频"),
        check: { kind: 'cooling' },
      },
      {
        id: 'price',
        title: t("整机控制在预算内"),
        hint: t("改顶部预算框，看评估面板的成本维度"),
        check: { kind: 'price', max: 50000 },
      },
    ],
  },
  {
    id: 'finetune',
    icon: FlaskConical,
    name: t("LoRA 微调实验"),
    tagline: t("不量化，留足显存给梯度和优化器"),
    summary: t("微调时显存不只要放权重，还要放激活值与优化器状态。切回 FP16 看需求怎样翻倍，再换 48G 专业卡接住——训练看容量，推理才看带宽。"),
    level: 'advanced',
    tags: [t("挑战"), t("FP16"), t("专业卡")],
    goal: t("用全精度权重跑通一次轻量微调的显存规划"),
    modelId: 'qwen25-7b',
    quant: 'fp16',
    ctx: 8192,
    budget: 55000,
    build: {
      gpuIds: ['a6000'],
      cpuId: 'r9-7950x',
      moboId: 'x670e',
      ramIds: ['ram128', 'ram128'],
      psuId: 'psu1300',
      storageIds: ['ssd4t'],
      coolingId: 'turbine',
    },
    steps: [
      {
        id: 'quant',
        title: t("切回 FP16 全精度"),
        hint: t("微调对精度敏感，量化权重不适合直接训练"),
        check: { kind: 'quant', quant: 'fp16' },
      },
      {
        id: 'headroom',
        title: t("显存余量 >= 20%"),
        hint: t("梯度与优化器状态还要吃显存，余量要比推理更大"),
        check: { kind: 'headroom', min: 0.2 },
      },
      {
        id: 'ram',
        title: t("系统内存 256GB"),
        hint: t("数据集预处理与 checkpoint 都在内存里周转"),
        check: { kind: 'ram', minGb: 256 },
      },
      {
        id: 'gpu',
        title: t("用 24G 以上的卡"),
        hint: t("全精度 7B 光权重就要 14G 以上"),
        check: { kind: 'gpuCount', min: 1 },
      },
      {
        id: 'complete',
        title: t("整套配置无缺件"),
        hint: t("缺任何核心部件都跑不起来训练"),
        check: { kind: 'complete' },
      },
    ],
  },
  {
    id: 'budget',
    icon: Coins,
    name: t("极致预算挑战"),
    tagline: t("把每分钱都花在显存上"),
    summary: t("给定最紧的预算，用最短上下文和最低量化，把一台能跑的机器压出来。理解「砍配置」的顺序：先砍上下文，再砍量化，显卡最后动。"),
    level: 'starter',
    tags: [t("入门"), t("成本"), t("取舍")],
    goal: t("在 9,000 元内配出一台能跑 7B 的完整机器"),
    modelId: 'qwen25-7b',
    quant: 'int4',
    ctx: 4096,
    budget: 9000,
    build: {
      gpuIds: ['rtx3060'],
      cpuId: 'r5-7600',
      moboId: 'b650',
      ramIds: ['ram32'],
      psuId: 'psu650',
      storageIds: ['ssd1t'],
      coolingId: 'air',
    },
    steps: [
      {
        id: 'ctx',
        title: t("把上下文压到 4K"),
        hint: t("短上下文能显著省下 KV Cache"),
        check: { kind: 'ctx', min: 4096 },
      },
      {
        id: 'quant',
        title: t("保持 INT4 量化"),
        hint: t("这是成本不变前提下最省显存的一档"),
        check: { kind: 'quant', quant: 'int4' },
      },
      {
        id: 'price',
        title: t("整机不超过 9,000 元"),
        hint: t("看评估面板的整机报价，超了就换件"),
        check: { kind: 'price', max: 9000 },
      },
      {
        id: 'headroom',
        title: t("显存仍然放得下"),
        hint: t("省钱不能省到模型加载失败"),
        check: { kind: 'headroom', min: 0.1 },
      },
    ],
  },
];

export const SCENARIOS: Record<string, Scenario> = Object.fromEntries(
  SCENARIO_LIST.map((scenario) => [scenario.id, scenario]),
);

export function scenarioById(id: string | null | undefined): Scenario | undefined {
  return id ? SCENARIOS[id] : undefined;
}

export const LEVEL_LABELS: Record<ScenarioLevel, string> = {
  starter: t("入门"),
  intermediate: t("进阶"),
  advanced: t("挑战"),
};
