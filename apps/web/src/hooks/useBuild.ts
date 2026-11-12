import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildStats, evaluate, EMPTY_BUILD, vramNeed, withAutoPsu, withAutoRam } from '@clab/engine';
import type { Build, ModelSpec, PresetKey, Quant } from '@clab/engine';
import { DATASET, MODELS_LIST, modelById } from '@clab/data';
import { PRESETS } from '@/lib/presets';
import { useRuntimeCatalog } from '@/hooks/usePrices';
import { BUILDER_STORAGE_KEY, type StoredBuilderState } from '@/lib/builderStorage';

/** 机箱的物理限制：4 个 PCIe、4 条 DIMM、2 个盘位 */
export const MAX_GPU = 4;
export const MAX_RAM = 4;
export const MAX_STORAGE = 2;

const DEFAULT_BUDGET = 20000;
const DEFAULT_CTX = 8192;

export type PartKind = 'cpu' | 'mobo' | 'psu' | 'cooling' | 'storage' | 'gpu' | 'ram';

export interface BuilderState {
  build: Build;
  modelId: string;
  /** 从推荐页带来的自定义尺寸模型，有它时覆盖 modelId 指向的记录 */
  customSpec: ModelSpec | null;
  quant: Quant;
  ctx: number;
  budget: number;
}

function initialState(): BuilderState {
  const preset = PRESETS.balance;
  return {
    build: structuredClone(preset.build) as Build,
    modelId: preset.modelId,
    customSpec: null,
    quant: preset.quant,
    ctx: preset.ctx,
    budget: DEFAULT_BUDGET,
  };
}

/** 自定义模型来自 localStorage，字段必须自己校验，不能直接信 */
function readCustomSpec(value: unknown): ModelSpec | null {
  if (!value || typeof value !== 'object') return null;
  const spec = value as Partial<ModelSpec>;
  const ok =
    typeof spec.id === 'string' &&
    typeof spec.name === 'string' &&
    typeof spec.paramsB === 'number' &&
    spec.paramsB > 0 &&
    typeof spec.layers === 'number' &&
    spec.layers > 0 &&
    typeof spec.hiddenDim === 'number' &&
    spec.hiddenDim > 0 &&
    typeof spec.ctxMax === 'number' &&
    spec.ctxMax > 0;
  return ok ? (spec as ModelSpec) : null;
}

function readSaved(): BuilderState | null {
  try {
    const raw = localStorage.getItem(BUILDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BuilderState>;
    if (!parsed.build || !parsed.modelId) return null;

    // 自定义模型的 modelId 是 'custom'，data 里当然查不到。
    // 有 customSpec 时就不该再用 modelById 卡它，否则整份存档会被丢掉。
    const customSpec = readCustomSpec(parsed.customSpec);
    if (!customSpec && !modelById(parsed.modelId)) return null;

    return {
      customSpec,
      build: {
        ...EMPTY_BUILD,
        ...parsed.build,
        gpuIds: (parsed.build.gpuIds ?? []).slice(0, MAX_GPU),
        ramIds: (parsed.build.ramIds ?? []).slice(0, MAX_RAM),
        storageIds: (parsed.build.storageIds ?? []).slice(0, MAX_STORAGE),
      },
      modelId: parsed.modelId,
      quant: parsed.quant ?? 'int4',
      ctx: parsed.ctx ?? DEFAULT_CTX,
      budget: parsed.budget ?? DEFAULT_BUDGET,
    };
  } catch {
    return null;
  }
}

/**
 * 组装台状态。
 *
 * 设计取舍：
 * - 显卡/内存/硬盘是「数组」而不是「按槽位索引」，删除后自动紧凑排列，和真机箱一致；
 * - drop 到任意空槽都追加到末尾（不允许留空槽），避免出现 1、3 号槽有卡、2 号空的怪状态；
 * - 每次变更都重算评估。engine 单次 < 1ms，64 种推荐组合也才几十毫秒，不需要节流。
 */
export interface BuildOverride {
  /** 从模型详情跳过来时带的目标模型 */
  modelId?: string;
  /** 从显卡详情跳过来时要顺手装上的一张卡 */
  gpuId?: string;
}

export function useBuild(override?: BuildOverride) {
  const [state, setState] = useState<BuilderState>(initialState);
  const [loaded, setLoaded] = useState(false);
  // URL 参数只在首次生效，之后用户自己的调整不能被它反复覆盖
  const overrideRef = useRef(override);

  // 首次挂载后读本地存档，避免覆盖用户上次的配置
  useEffect(() => {
    const saved = readSaved();
    const initial = overrideRef.current;

    setState((current) => {
      let next = saved ?? current;
      if (initial?.modelId && modelById(initial.modelId)) {
        next = { ...next, modelId: initial.modelId };
      }
      if (initial?.gpuId) {
        const gpu = DATASET.gpus.find((item) => item.id === initial.gpuId);
        if (gpu) next = { ...next, build: { ...next.build, gpuIds: [...next.build.gpuIds, gpu.id].slice(0, MAX_GPU) } };
      }
      return next;
    });
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(state satisfies StoredBuilderState));
    } catch {
      /* 隐私模式忽略 */
    }
  }, [state, loaded]);

  const modelRecord = state.customSpec ? null : (modelById(state.modelId) ?? MODELS_LIST[0]);
  const model: ModelSpec = state.customSpec ?? modelRecord ?? MODELS_LIST[0];
  /** 展示名：自定义模型没有中文名，用 name */
  const modelName = state.customSpec ? state.customSpec.name : (modelRecord?.cn ?? MODELS_LIST[0].name);

  // 换模型时把上下文收进合法范围，否则会出现 7B 配 128K 的非法组合
  useEffect(() => {
    setState((current) => {
      if (current.ctx <= model.ctxMax) return current;
      return { ...current, ctx: Math.min(DEFAULT_CTX, model.ctxMax) };
    });
  }, [model.ctxMax]);

  // 目录价格可能在运行时被 /prices/latest 覆盖：组装台的总价必须跟着变，
  // 否则同一张卡在卡片和组装台会显示两个不同的价格
  const catalog = useRuntimeCatalog();
  const stats = useMemo(() => buildStats(state.build, catalog), [state.build, catalog]);
  const need = useMemo(() => vramNeed(model, state.quant, state.ctx), [model, state.quant, state.ctx]);
  const evaluation = useMemo(
    () =>
      evaluate({
        build: state.build,
        model,
        quant: state.quant,
        ctx: state.ctx,
        budget: state.budget,
        catalog,
      }),
    [state.build, model, state.quant, state.ctx, state.budget, catalog],
  );

  /* ---------------- 槽位操作 ---------------- */

  const patch = useCallback((updater: (current: BuilderState) => BuilderState) => {
    setState(updater);
  }, []);

  /** 往第一个空位加显卡；满了就替换最后一张，避免静默失败 */
  const addGpu = useCallback((gpuId: string) => {
    patch((current) => {
      const gpus = current.build.gpuIds;
      if (gpus.length >= MAX_GPU) {
        return { ...current, build: { ...current.build, gpuIds: [...gpus.slice(0, MAX_GPU - 1), gpuId] } };
      }
      return { ...current, build: { ...current.build, gpuIds: [...gpus, gpuId] } };
    });
  }, [patch]);

  const addRam = useCallback((ramId: string) => {
    patch((current) => {
      const rams = current.build.ramIds;
      if (rams.length >= MAX_RAM) {
        return { ...current, build: { ...current.build, ramIds: [...rams.slice(0, MAX_RAM - 1), ramId] } };
      }
      return { ...current, build: { ...current.build, ramIds: [...rams, ramId] } };
    });
  }, [patch]);

  const addStorage = useCallback((storageId: string) => {
    patch((current) => {
      const storages = current.build.storageIds;
      if (storages.length >= MAX_STORAGE) {
        return {
          ...current,
          build: { ...current.build, storageIds: [...storages.slice(0, MAX_STORAGE - 1), storageId] },
        };
      }
      return { ...current, build: { ...current.build, storageIds: [...storages, storageId] } };
    });
  }, [patch]);

  /** 单值槽位（CPU / 主板 / 电源 / 散热） */
  const setSingle = useCallback(
    (kind: 'cpuId' | 'moboId' | 'psuId' | 'coolingId', id: string) => {
      patch((current) => ({ ...current, build: { ...current.build, [kind]: id } }));
    },
    [patch],
  );

  /** 统一入口：部件库点击 / 拖拽落点都走这里 */
  const placePart = useCallback(
    (kind: PartKind, id: string) => {
      if (kind === 'gpu') addGpu(id);
      else if (kind === 'ram') addRam(id);
      else if (kind === 'storage') addStorage(id);
      else if (kind === 'cpu') setSingle('cpuId', id);
      else if (kind === 'mobo') setSingle('moboId', id);
      else if (kind === 'psu') setSingle('psuId', id);
      else if (kind === 'cooling') setSingle('coolingId', id);
    },
    [addGpu, addRam, addStorage, setSingle],
  );

  /** 移除：槽位名形如 gpu0 / ram1 / cpu / psu */
  const removeSlot = useCallback((slot: string) => {
    patch((current) => {
      const { build } = current;
      const index = Number(slot.replace(/\D/g, ''));
      if (slot.startsWith('gpu')) {
        return { ...current, build: { ...build, gpuIds: build.gpuIds.filter((_, i) => i !== index) } };
      }
      if (slot.startsWith('ram')) {
        return { ...current, build: { ...build, ramIds: build.ramIds.filter((_, i) => i !== index) } };
      }
      if (slot.startsWith('storage')) {
        return { ...current, build: { ...build, storageIds: build.storageIds.filter((_, i) => i !== index) } };
      }
      if (slot === 'cpu') return { ...current, build: { ...build, cpuId: null } };
      if (slot === 'mobo') return { ...current, build: { ...build, moboId: null } };
      if (slot === 'psu') return { ...current, build: { ...build, psuId: null } };
      if (slot === 'cooling') return { ...current, build: { ...build, coolingId: null } };
      return current;
    });
  }, [patch]);

  /* ---------------- 全局操作 ---------------- */

  const setModel = useCallback((modelId: string) => {
    // 选了内置模型，就丢掉上一次带过来的自定义 spec
    patch((current) => ({ ...current, modelId, customSpec: null }));
  }, [patch]);

  const setQuant = useCallback((quant: Quant) => {
    patch((current) => ({ ...current, quant }));
  }, [patch]);

  const setCtx = useCallback((ctx: number) => {
    patch((current) => ({ ...current, ctx }));
  }, [patch]);

  const setBudget = useCallback((budget: number) => {
    patch((current) => ({ ...current, budget }));
  }, [patch]);

  const applyPreset = useCallback((key: PresetKey) => {
    const preset = PRESETS[key];
    setState({
      build: structuredClone(preset.build) as Build,
      modelId: preset.modelId,
      customSpec: null,
      quant: preset.quant,
      ctx: preset.ctx,
      budget: DEFAULT_BUDGET,
    });
  }, []);

  const clear = useCallback(() => {
    setState((current) => ({ ...current, build: structuredClone(EMPTY_BUILD) as Build }));
  }, []);

  /** 评估面板上的建议按钮最终都落到这两个动作 */
  const autoPsu = useCallback(() => {
    patch((current) => {
      const currentStats = buildStats(current.build, catalog);
      return { ...current, build: withAutoPsu(current.build, currentStats, catalog) };
    });
  }, [patch, catalog]);

  const autoRam = useCallback(() => {
    patch((current) => {
      const currentStats = buildStats(current.build, catalog);
      const currentNeed = vramNeed(
        current.customSpec ?? modelById(current.modelId) ?? MODELS_LIST[0],
        current.quant,
        current.ctx,
      );
      return { ...current, build: withAutoRam(current.build, currentStats, currentNeed, catalog) };
    });
  }, [patch, catalog]);

  /**
   * 用远端快照覆盖当前状态。
   *
   * 只在「打开我的配置」「从分享链接复制到组装台」两处调用。
   * 必须校验模型是否存在：库里存的是快照，而目录可能已经删过某个模型，
   * 直接信就会让整个组装台渲染成空白。
   */
  const loadState = useCallback((next: BuilderState) => {
    const custom = readCustomSpec(next.customSpec);
    const modelOk = custom !== null || Boolean(modelById(next.modelId));
    if (!modelOk) return false;
    setState({
      build: {
        ...EMPTY_BUILD,
        ...next.build,
        gpuIds: (next.build.gpuIds ?? []).slice(0, MAX_GPU),
        ramIds: (next.build.ramIds ?? []).slice(0, MAX_RAM),
        storageIds: (next.build.storageIds ?? []).slice(0, MAX_STORAGE),
      } as Build,
      modelId: next.modelId,
      customSpec: custom,
      quant: next.quant ?? 'int4',
      ctx: next.ctx ?? DEFAULT_CTX,
      budget: next.budget ?? DEFAULT_BUDGET,
    });
    return true;
  }, []);

  return {
    ...state,
    model,
    modelName,
    modelRecord,
    stats,
    need,
    evaluation,
    loaded,
    addGpu,
    addRam,
    addStorage,
    placePart,
    removeSlot,
    setModel,
    setQuant,
    setCtx,
    setBudget,
    applyPreset,
    clear,
    autoPsu,
    autoRam,
    loadState,
  };
}

export type UseBuild = ReturnType<typeof useBuild>;
