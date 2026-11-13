import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, RotateCcw, Share2 } from 'lucide-react';
import { MODELS_LIST } from '@/data';
import { buildApi, shareApi } from '@/lib/api';
import { SaveBuildDialog } from '@/components/auth/SaveBuildDialog';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { track } from '@/lib/track';
import { useBuild, type BuilderState, type PartKind } from '@/hooks/useBuild';
import { PRESET_LIST } from '@/lib/presets';
import { PartPalette } from '@/components/builder/PartPalette';
import { MetricsBar } from '@/components/builder/MetricsBar';
import { EvalPanel } from '@/components/builder/EvalPanel';
import { Chassis } from '@/components/chassis/Chassis';
import { Segmented } from '@/components/ui/controls';
import { fmtCtx, fmtPct, fmtPrice } from '@/lib/format';
import { t } from '@/i18n';

const QUANT_OPTIONS = [
  { value: 'fp16' as const, label: 'FP16' },
  { value: 'int8' as const, label: 'INT8' },
  { value: 'int4' as const, label: 'INT4' },
];

/**
 * DIY 组装台。
 *
 * 三栏：部件库 / 机箱 / 评估。中间列自己滚动，右侧评估始终可见——
 * 用户改一个件，最想知道的就是分数和风险怎么变，不能让它滚出视野。
 */
export function BuilderPage() {
  const [params] = useSearchParams();
  // 只在首次渲染取 URL 参数：之后用户自己的调整不能被它反复覆盖
  const override = useMemo(
    () => ({ modelId: params.get('model') ?? undefined, gpuId: params.get('gpu') ?? undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const builder = useBuild(override);
  const [activeKind, setActiveKind] = useState<PartKind>('gpu');
  const [saveOpen, setSaveOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  // 登录成功后自动回到保存框：用户点「保存」→ 被要求登录 → 登录完还要再点一次，
  // 这一步多余的点击足够让人以为「保存没成功」。
  const [resumeSave, setResumeSave] = useState(false);
  const [notice, setNotice] = useState('');
  const { model, modelName, customSpec, quant, ctx, budget } = builder;
  const overflow = builder.need.total > builder.stats.vramGb && builder.stats.vramGb > 0;

  // 从「我的配置」(?build=1) 或分享链接 (?share=token) 载入。
  // 必须等本地存档读完再执行，否则刚载入的远端配置会被 localStorage 里的旧值盖掉。
  const urlTarget = useMemo(
    () => ({ build: params.get('build'), share: params.get('share') }),
    // 只在首次取：用户之后在页面里的调整不该被 URL 反复拉回
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 解构出来单独引用：直接写 builder.xxx 会让 lint 认为整个 builder 都是依赖
  const { loaded: buildLoaded, loadState } = builder;

  useEffect(() => {
    if (!buildLoaded) return;
    if (!urlTarget.build && !urlTarget.share) return;

    let alive = true;
    void (async () => {
      try {
        const detail = urlTarget.build
          ? await buildApi.get(Number(urlTarget.build))
          : (await shareApi.resolve(urlTarget.share as string)).build;
        if (!alive) return;
        const ok = loadState(detail.state as unknown as BuilderState);
        if (ok) track('build_load', { buildId: detail.id, via: urlTarget.build ? 'mine' : 'share' });
        setNotice(
          ok
            ? `已载入「${detail.name}」· 可以继续改，改完是你自己的副本`
            : t("这套配置引用的模型已不在目录里，无法载入"),
        );
      } catch {
        if (alive) setNotice(t("载入失败：配置可能已被删除，或链接已过期"));
      }
    })();

    return () => {
      alive = false;
    };
    // 只依赖稳定的 loadState 与 buildLoaded：把整个 builder 放进依赖会让
    // 每次拖拽都重新拉一次远端配置
  }, [buildLoaded, urlTarget, loadState]);

  return (
    <div className="builder-page">
      {/* ---------------- 顶部控制条 ---------------- */}
      <div className="builder-toolbar card">
        <div className="tb-field" style={{ minWidth: 190 }}>
          <label htmlFor="builder-model" className="field-label">
            {t("目标模型")}
          </label>
          <select
            id="builder-model"
            className="input h-8 text-[12px]"
            value={customSpec ? 'custom' : model.id}
            onChange={(event) => builder.setModel(event.target.value)}
          >
            {customSpec && <option value="custom">{customSpec.name}{t("（来自推荐）")}</option>}
            {MODELS_LIST.map((item) => (
              <option key={item.id} value={item.id}>
                {item.cn} · {item.paramsB}B
              </option>
            ))}
          </select>
        </div>

        <div className="tb-field" style={{ flex: '0 0 auto' }}>
          <span className="field-label">{t("量化")}</span>
          <Segmented value={quant} options={QUANT_OPTIONS} onChange={builder.setQuant} ariaLabel={t("量化方式")} />
        </div>

        <div className="tb-field tb-ctx">
          <label htmlFor="builder-ctx" className="field-label">
            {t("上下文")} {fmtCtx(ctx)}
          </label>
          <input
            id="builder-ctx"
            type="range"
            min={2048}
            max={model.ctxMax}
            step={2048}
            value={ctx}
            onChange={(event) => builder.setCtx(Number(event.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>

        <div className="tb-field" style={{ flex: '0 0 108px' }}>
          <label htmlFor="builder-budget" className="field-label">
            {t("预算")}
          </label>
          <input
            id="builder-budget"
            type="number"
            className="input h-8 text-[12px]"
            value={budget}
            min={2000}
            step={1000}
            onChange={(event) => builder.setBudget(Math.max(2000, Number(event.target.value) || 2000))}
          />
        </div>

        <div className="tb-presets">
          {PRESET_LIST.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="preset-btn"
              onClick={() => builder.applyPreset(preset.key)}
              title={preset.desc}
            >
              <span className="n">{preset.name}</span>
            </button>
          ))}
          <button type="button" className="icon-btn" onClick={builder.clear} title={t("清空机箱")} aria-label={t("清空机箱")}>
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ marginLeft: 6 }}
            onClick={() => setSaveOpen(true)}
            title={t("保存到账号并生成分享链接")}
          >
            <Share2 size={13} />
            {t("保存 / 分享")}
          </button>
        </div>
      </div>

      {notice && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 14px',
            fontSize: 12,
            color: 'var(--text-2)',
          }}
        >
          <CheckCircle2 size={14} style={{ color: 'var(--good-ink)', flex: 'none' }} />
          <span style={{ flex: 1 }}>{notice}</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setNotice('')}
            aria-label={t("关闭提示")}
            style={{ width: 22, height: 22 }}
          >
            ×
          </button>
        </div>
      )}

      {/* ---------------- 三栏 ---------------- */}
      <div className="builder">
        <PartPalette
          activeKind={activeKind}
          onKindChange={setActiveKind}
          build={builder.build}
          onPlace={builder.placePart}
        />

        <div className="board-col card">
          <Chassis
            build={builder.build}
            activeKind={activeKind}
            onPlace={builder.placePart}
            onRemove={builder.removeSlot}
            onFocusKind={setActiveKind}
          />
          <MetricsBar stats={builder.stats} need={builder.need} modelName={`${model.paramsB.toFixed(0)}B ${quant.toUpperCase()}`} />
          <div className="board-hint">
            {t("目标")} {modelName} · {quant.toUpperCase()} · {fmtCtx(ctx)} {t("上下文 · 需")} {builder.need.total.toFixed(1)}G
            {builder.stats.vramGb > 0 &&
              (overflow ? (
                <span style={{ color: 'var(--danger-ink)' }}>
                  {' '}
                  {t("· 还差")} {(builder.need.total - builder.stats.vramGb).toFixed(1)}G
                </span>
              ) : (
                <span style={{ color: 'var(--good-ink)' }}> {t("· 余量")} {fmtPct(builder.evaluation.headroom)}</span>
              ))}
            <span style={{ color: 'var(--text-3)' }}> {t("· 整机")} {fmtPrice(builder.stats.priceCny)}</span>
          </div>
        </div>

        <EvalPanel builder={builder} />
      </div>

      <SaveBuildDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        builder={builder}
        onRequestLogin={() => {
          setSaveOpen(false);
          setResumeSave(true);
          setLoginOpen(true);
        }}
      />
      <LoginDialog
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          if (resumeSave) {
            setResumeSave(false);
            setSaveOpen(true);
          }
        }}
      />
    </div>
  );
}
