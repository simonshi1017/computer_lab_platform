import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Cloud, Gauge, Sparkles } from 'lucide-react';
import { recommend, vramNeed, type ModelSpec, type Quant, type RecommendPref, type Tier } from '@clab/engine';
import { MODELS_LIST, modelById } from '@clab/data';
import { useRuntimeCatalog } from '@/hooks/usePrices';
import { track } from '@/lib/track';
import { TierCard } from '@/components/recommend/TierCard';
import { Chip, Segmented } from '@/components/ui/controls';
import { saveBuilderState } from '@/lib/builderStorage';
import { fmtCtx, fmtGb, fmtPrice } from '@/lib/format';
import { PAGE_BY_PATH } from '@/navigation';

const QUANT_OPTIONS: Array<{ value: Quant; label: string }> = [
  { value: 'fp16', label: 'FP16' },
  { value: 'int8', label: 'INT8' },
  { value: 'int4', label: 'INT4' },
];

const PREF_OPTIONS: Array<{ value: RecommendPref; label: string }> = [
  { value: 'save', label: '省钱优先' },
  { value: 'balance', label: '均衡' },
  { value: 'perf', label: '性能优先' },
  { value: 'quiet', label: '静音优先' },
];

const CTX_OPTIONS = [4096, 8192, 16384, 32768, 65536];

/**
 * 自定义尺寸的层数与隐藏维度按同档位真实模型的中位数估算。
 * 用户给的信息只有参数量，再精确就是编造了。
 */
function estimateArch(paramsB: number): { layers: number; hiddenDim: number } {
  if (paramsB <= 10) return { layers: 32, hiddenDim: 4096 };
  if (paramsB <= 20) return { layers: 48, hiddenDim: 5120 };
  if (paramsB <= 40) return { layers: 64, hiddenDim: 5120 };
  if (paramsB <= 80) return { layers: 80, hiddenDim: 8192 };
  return { layers: 96, hiddenDim: 8192 };
}

function customSpec(paramsB: number): ModelSpec {
  const { layers, hiddenDim } = estimateArch(paramsB);
  return {
    id: `custom-${paramsB}b`,
    name: `自定义 ${paramsB}B`,
    vendor: '自定义',
    arch: 'dense',
    paramsB,
    layers,
    hiddenDim,
    ctxMax: 32768,
  };
}

export function RecommendPage() {
  const meta = PAGE_BY_PATH['/recommend'];
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [modelId, setModelId] = useState(() => {
    const fromUrl = params.get('model');
    return fromUrl && modelById(fromUrl) ? fromUrl : 'qwen25-14b';
  });
  const [customParams, setCustomParams] = useState(27);
  const [quant, setQuant] = useState<Quant>('int4');
  const [ctx, setCtx] = useState(8192);
  const [budget, setBudget] = useState(20000);
  const [pref, setPref] = useState<RecommendPref>('balance');

  const model: ModelSpec = useMemo(
    () => (modelId === 'custom' ? customSpec(customParams) : (modelById(modelId) ?? MODELS_LIST[0])),
    [modelId, customParams],
  );

  const isCustom = modelId === 'custom';

  // 换模型时把上下文收进合法范围
  useEffect(() => {
    if (ctx > model.ctxMax) setCtx(Math.min(8192, model.ctxMax));
  }, [model.ctxMax, ctx]);

  const need = useMemo(() => vramNeed(model, quant, ctx), [model, quant, ctx]);

  // 推荐必须用运行时价格：三档方案的核心卖点是「多少钱能落地」，
  // 拿内置价算出来的预算会与实际采购价差出一个档位
  const catalog = useRuntimeCatalog();

  const rec = useMemo(
    () => recommend({ model, quant, ctx, budget, pref, catalog }),
    [model, quant, ctx, budget, pref, catalog],
  );

  const cheapest = rec.tiers.length > 0 ? Math.min(...rec.tiers.map((tier) => tier.priceCny)) : 0;
  const overBudget = rec.tiers.length > 0 && cheapest > budget;

  // 采纳率的分母就是这里的 view。
  // 只在首次进入页面时上报一次：用户换模型/改预算不该重复计数，
  // 否则分母被自身操作刷高，采纳率会显得莫名其妙地低。
  // 用 ref 而不是空依赖数组——空依赖会让 lint 一直报「缺少依赖」，
  // 而把依赖补全又会被触发多次，ref 两个问题都解决。
  const viewLogged = useRef(false);
  useEffect(() => {
    if (viewLogged.current) return;
    viewLogged.current = true;
    track('recommend_view', { modelId, quant, budget });
  }, [modelId, quant, budget]);

  const loadTier = (tier: Tier) => {
    track('recommend_apply', { modelId, tier: tier.key, priceCny: tier.priceCny });
    saveBuilderState({
      build: {
        gpuIds: Array.from({ length: tier.gpuCount }, () => tier.gpu.id),
        cpuId: tier.cpu.id,
        moboId: tier.mobo.id,
        ramIds: [...tier.ramIds],
        psuId: tier.psu.id,
        storageIds: [tier.storage.id],
        coolingId: tier.cooling.id,
      },
      modelId: isCustom ? 'custom' : model.id,
      customSpec: isCustom ? model : null,
      quant,
      ctx,
      budget,
    });
    navigate('/builder');
  };

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{meta.title}</h1>
          <p className="page-sub">{meta.subtitle}</p>
        </div>
        <div className="note note-info max-w-[300px] text-[11.5px]">
          先算显存，再选卡。三档方案都经过电源与主板可行性校验，不会给出「纸面能跑、开机跳闸」的配置。
        </div>
      </div>

      {/* ---------------- 表单 ---------------- */}
      <div className="card rec-form">
        <div className="rec-field" style={{ gridColumn: 'span 2' }}>
          <label className="field-label" htmlFor="rec-model">
            要跑什么模型
          </label>
          <select
            id="rec-model"
            className="input"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
          >
            {MODELS_LIST.map((item) => (
              <option key={item.id} value={item.id}>
                {item.cn} · {item.paramsB}B
              </option>
            ))}
            <option value="custom">自定义参数量…</option>
          </select>
        </div>

        {isCustom && (
          <div className="rec-field">
            <label className="field-label" htmlFor="rec-params">
              参数量 (B)
            </label>
            <input
              id="rec-params"
              className="input"
              type="number"
              min={1}
              max={1000}
              value={customParams}
              onChange={(event) =>
                setCustomParams(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))
              }
            />
          </div>
        )}

        <div className="rec-field">
          <span className="field-label">量化方式</span>
          <Segmented value={quant} options={QUANT_OPTIONS} onChange={setQuant} ariaLabel="量化方式" />
        </div>

        <div className="rec-field">
          <label className="field-label" htmlFor="rec-ctx">
            上下文
          </label>
          <select id="rec-ctx" className="input" value={ctx} onChange={(event) => setCtx(Number(event.target.value))}>
            {CTX_OPTIONS.filter((option) => option <= model.ctxMax).map((option) => (
              <option key={option} value={option}>
                {fmtCtx(option)}
              </option>
            ))}
          </select>
        </div>

        <div className="rec-field">
          <label className="field-label" htmlFor="rec-budget">
            预算 (元)
          </label>
          <input
            id="rec-budget"
            className="input"
            type="number"
            min={2000}
            step={1000}
            value={budget}
            onChange={(event) => setBudget(Math.max(2000, Number(event.target.value) || 2000))}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
          偏好
        </span>
        {PREF_OPTIONS.map((option) => (
          <Chip key={option.value} active={pref === option.value} onClick={() => setPref(option.value)}>
            {option.label}
          </Chip>
        ))}
      </div>

      {/* ---------------- 需求摘要 ---------------- */}
      <div className="rec-summary">
        <div className="sum-pill hot">
          显存需求 <b>{fmtGb(need.total)}</b> GB
        </div>
        <div className="sum-pill">
          权重 <b>{fmtGb(need.weights)}</b>G · KV Cache <b>{fmtGb(need.kvCache)}</b>G
        </div>
        <div className="sum-pill">
          预算 <b>{fmtPrice(budget)}</b>
        </div>
        <div className="sum-pill">
          可行方案 <b>{rec.tiers.length}</b> 套
        </div>
        {overBudget && (
          <div
            className="sum-pill"
            style={{
              borderColor: 'rgba(217,119,6,.4)',
              background: 'rgba(217,119,6,.08)',
              color: 'var(--warn-ink)',
            }}
          >
            <AlertTriangle size={12} /> 最便宜的方案也超预算 {fmtPrice(cheapest - budget)}
          </div>
        )}
        {isCustom && (
          <div className="sum-pill" style={{ color: 'var(--text-3)' }}>
            按 {model.layers} 层 / 隐藏维度 {model.hiddenDim} 估算，精度有限
          </div>
        )}
      </div>

      {/* ---------------- 结果 ---------------- */}
      {rec.tiers.length === 0 ? (
        <div className="card mt-4 p-6">
          <div className="flex items-start gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
              style={{ background: 'rgba(220,38,38,.1)', color: 'var(--danger-ink)' }}
            >
              <AlertTriangle size={17} />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold">当前条件下没有可行方案</div>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                {model.name} 在 {quant.toUpperCase()} · {fmtCtx(ctx)} 下需要{' '}
                <b className="mono">{fmtGb(need.total)}GB</b> 显存，即使插满四张最顶级的卡也装不下，
                或者配出来的电源会在满载时跳闸。这不是预算问题，是物理限制。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {quant !== 'int4' && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuant('int4')}>
                    量化降到 INT4
                  </button>
                )}
                {ctx > 4096 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCtx(4096)}>
                    上下文降到 4K
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setModelId('qwen25-32b');
                    setQuant('int4');
                    setCtx(8192);
                  }}
                >
                  换成 32B 试试
                </button>
              </div>
              <div className="note note-info mt-3">
                <Cloud size={12} className="mr-1 inline" />
                如果只是要用这个模型，租云 API 通常比自建更划算——先跑通业务，再决定要不要买机器。
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="tier-grid">
            {rec.tiers.map((tier) => (
              <TierCard key={tier.key} tier={tier} budget={budget} onLoad={() => loadTier(tier)} />
            ))}
            {rec.limited && (
              <div className="card tier-note">
                <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--warn-ink)' }}>
                  <Gauge size={15} />只有 {rec.tiers.length} 套可行方案
                </div>
                <p className="mt-2 text-[12px] leading-[1.75]" style={{ color: 'var(--text-2)' }}>
                  {model.name} 在 {quant.toUpperCase()} · {fmtCtx(ctx)} 下需要{' '}
                  <b className="mono">{fmtGb(need.total)}GB</b> 显存。其余组合要么装不下，要么价格翻好几倍、
                  没有推荐价值——宁可不给，也不拿「更贵更慢」的方案凑数。
                </p>
                <ul className="mt-2 space-y-1 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                  <li>· 降一档量化，显存能省将近一半</li>
                  <li>· 上下文从 {fmtCtx(ctx)} 降到 8K，KV Cache 会小很多</li>
                  <li>· 提高预算，多卡方案才有意义</li>
                </ul>
              </div>
            )}
          </div>

          <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
            <Sparkles size={11} className="mt-0.5 shrink-0" />
            价格为估算值；显存与速度由规则计算，不等于实测跑分。点「用这套去组装」会把这套配置原样送进组装台，可以继续改。
          </p>
        </>
      )}
    </section>
  );
}
