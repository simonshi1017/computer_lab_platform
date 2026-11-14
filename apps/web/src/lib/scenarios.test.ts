import { describe, expect, it } from 'vitest';
import { buildStats, evaluate, vramNeed } from '@clab/engine';
import type { Build } from '@clab/engine';
import { ENGINE_CATALOG, modelById, DATASET } from '@/data';
import {
  SCENARIOS,
  SCENARIO_LIST,
  evaluateSteps,
  isStepDone,
  scenarioById,
  stepProgress,
  type LabContext,
  type Scenario,
} from './scenarios';

/** 用真实计算内核跑一遍场景的预置配置，得到任务卡实际会看到的上下文 */
function contextOf(scenario: Scenario, patch: Partial<LabContext> = {}): LabContext {
  const model = modelById(scenario.modelId)!;
  const stats = buildStats(scenario.build, ENGINE_CATALOG);
  const evaluation = evaluate({
    build: scenario.build,
    model,
    quant: scenario.quant,
    ctx: scenario.ctx,
    budget: scenario.budget,
    catalog: ENGINE_CATALOG,
  });
  return {
    modelId: scenario.modelId,
    customSpec: null,
    quant: scenario.quant,
    ctx: scenario.ctx,
    budget: scenario.budget,
    stats,
    headroom: evaluation.headroom,
    score: evaluation.score,
    ...patch,
  };
}

describe('scenario catalog', () => {
  it('has unique ids and a lookup table', () => {
    expect(SCENARIO_LIST.length).toBe(6);
    expect(new Set(SCENARIO_LIST.map((s) => s.id)).size).toBe(SCENARIO_LIST.length);
    expect(Object.keys(SCENARIOS)).toHaveLength(SCENARIO_LIST.length);
    expect(scenarioById('rag-kb')?.name).toBe(SCENARIOS['rag-kb'].name);
    expect(scenarioById('not-a-scenario')).toBeUndefined();
    expect(scenarioById(null)).toBeUndefined();
  });

  it('every scenario references real models and parts', () => {
    const ids = new Set(
      Object.values(DATASET.parts)
        .flat()
        .map((part) => part.id),
    );
    for (const gpu of DATASET.gpus) ids.add(gpu.id);

    for (const s of SCENARIO_LIST) {
      expect(modelById(s.modelId), `${s.id}: model missing`).toBeTruthy();
      const b: Build = s.build;
      for (const id of [...b.gpuIds, ...b.ramIds, ...b.storageIds, b.cpuId, b.moboId, b.psuId, b.coolingId]) {
        if (id) expect(ids.has(id), `${s.id}: unknown part ${id}`).toBe(true);
      }
      expect(s.steps.length, `${s.id}: too few steps`).toBeGreaterThanOrEqual(4);
      expect(new Set(s.steps.map((step) => step.id)).size, `${s.id}: duplicate step id`).toBe(s.steps.length);
    }
  });

  it('all steps are reachable with the shipped configuration', () => {
    for (const s of SCENARIO_LIST) {
      const results = evaluateSteps(s, contextOf(s));
      const failed = results.filter((r) => !r.done).map((r) => `${r.step.id}:${r.step.check.kind}`);
      expect(failed, `${s.id} cannot be completed: ${failed.join(', ')}`).toEqual([]);
      expect(stepProgress(results).ratio).toBe(1);
    }
  });

  it('context stays within the model limit', () => {
    for (const s of SCENARIO_LIST) {
      expect(s.ctx, `${s.id}: ctx over model max`).toBeLessThanOrEqual(modelById(s.modelId)!.ctxMax);
    }
  });
});

describe('isStepDone', () => {
  const base = contextOf(SCENARIO_LIST[0]);

  it('rejects a mismatched model / quantization / context', () => {
    expect(isStepDone({ kind: 'model', modelId: 'qwen25-7b' }, base)).toBe(true);
    expect(isStepDone({ kind: 'model', modelId: 'qwen25-72b' }, base)).toBe(false);
    expect(isStepDone({ kind: 'quant', quant: 'int4' }, base)).toBe(true);
    expect(isStepDone({ kind: 'quant', quant: 'fp16' }, base)).toBe(false);
    expect(isStepDone({ kind: 'ctx', min: 8192 }, base)).toBe(true);
    expect(isStepDone({ kind: 'ctx', min: 32768 }, base)).toBe(false);
  });

  it('treats headroom and score as thresholds, not exact matches', () => {
    expect(isStepDone({ kind: 'headroom', min: 0.1 }, { ...base, headroom: 0.12 })).toBe(true);
    expect(isStepDone({ kind: 'headroom', min: 0.1 }, { ...base, headroom: -0.2 })).toBe(false);
    expect(isStepDone({ kind: 'score', min: 70 }, { ...base, score: 84 })).toBe(true);
    expect(isStepDone({ kind: 'score', min: 90 }, { ...base, score: 84 })).toBe(false);
  });

  it('detects missing PSU, cooling, RAM and budget overruns', () => {
    expect(isStepDone({ kind: 'power', minMargin: 0.2 }, base)).toBe(true);
    expect(isStepDone({ kind: 'power', minMargin: 5 }, base)).toBe(false);
    expect(isStepDone({ kind: 'power', minMargin: 0 }, { ...base, stats: { ...base.stats, psu: null } })).toBe(false);
    expect(isStepDone({ kind: 'cooling' }, { ...base, stats: { ...base.stats, cooling: null } })).toBe(false);
    expect(isStepDone({ kind: 'ram', minGb: 128 }, base)).toBe(false);
    expect(isStepDone({ kind: 'price', max: 9000 }, base)).toBe(true);
    expect(isStepDone({ kind: 'price', max: 5000 }, base)).toBe(false);
    expect(isStepDone({ kind: 'complete' }, { ...base, stats: { ...base.stats, mobo: null } })).toBe(false);
  });

  it('a custom model never satisfies a built-in model step', () => {
    expect(
      isStepDone({ kind: 'model', modelId: 'qwen25-7b' }, { ...base, customSpec: { ...modelById('qwen25-7b')! } }),
    ).toBe(false);
  });
});

describe('stepProgress', () => {
  it('reports zero for an empty list instead of NaN', () => {
    expect(stepProgress([])).toEqual({ done: 0, total: 0, ratio: 0 });
  });

  it('counts done steps', () => {
    const results = evaluateSteps(SCENARIO_LIST[0], contextOf(SCENARIO_LIST[0]));
    expect(stepProgress(results)).toEqual({ done: 5, total: 5, ratio: 1 });
  });
});

describe('vram math behind the scenarios', () => {
  it('long context grows KV Cache much faster than weights', () => {
    const model = modelById('qwen25-14b')!;
    const short = vramNeed(model, 'int4', 8192);
    const long = vramNeed(model, 'int4', 32768);
    expect(long.kvCache).toBeGreaterThan(short.kvCache * 3);
    expect(long.weights).toBeCloseTo(short.weights, 5);
  });
});
