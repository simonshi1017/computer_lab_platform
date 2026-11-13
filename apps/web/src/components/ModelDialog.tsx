import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Cpu, Sparkles } from 'lucide-react';
import { estimateTps, vramNeed, type Quant } from '@clab/engine';
import { GPUS_LIST, type ModelRecord } from '@/data';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented, SpecGrid } from '@/components/ui/controls';
import { fmtCtx, fmtGb, tpsToChars } from '@/lib/format';
import { modelSizeLabel } from '@/lib/modelSize';
import { t } from '@/i18n';

const QUANT_OPTIONS: Array<{ value: Quant; label: string }> = [
  { value: 'fp16', label: 'FP16' },
  { value: 'int8', label: 'INT8' },
  { value: 'int4', label: 'INT4' },
];

/** 首屏默认用 8K，这是多数对话场景的真实值，不拿满上下文吓人 */
const DEFAULT_CTX = 8192;

interface ModelDialogProps {
  model: ModelRecord | null;
  onClose: () => void;
}

export function ModelDialog({ model, onClose }: ModelDialogProps) {
  const navigate = useNavigate();
  const [quant, setQuant] = useState<Quant>('int4');
  const [ctx, setCtx] = useState(DEFAULT_CTX);

  // 切换模型时重置估算器，否则上一条的上下文会带到新模型上
  const [lastId, setLastId] = useState<string | null>(null);
  if (model && model.id !== lastId) {
    setLastId(model.id);
    setCtx(Math.min(DEFAULT_CTX, model.ctxMax));
  }

  const gpu4090 = useMemo(() => GPUS_LIST.find((g) => g.id === 'rtx4090') ?? GPUS_LIST[0], []);
  const gpu3090 = useMemo(() => GPUS_LIST.find((g) => g.id === 'rtx3090') ?? GPUS_LIST[0], []);

  if (!model) return <Dialog open={false} onClose={onClose}>{null}</Dialog>;

  const need = vramNeed(model, quant, ctx);
  const tpsSingle = estimateTps(model, [gpu4090], quant, ctx);
  const tpsDual = estimateTps(model, [gpu3090, gpu3090], quant, ctx);

  const raw = need.weights + need.kvCache;
  const seg = (value: number) => `${Math.max(1, (value / need.total) * 100)}%`;

  return (
    <Dialog open={Boolean(model)} onClose={onClose} labelledBy="model-dialog-title">
      <div className="dialog-head">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl font-mono text-[15px] font-bold"
          style={{ background: `${model.color}1F`, color: model.color, border: `1px solid ${model.color}33` }}
        >
          {modelSizeLabel(model)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="model-dialog-title" className="text-[17px] font-semibold tracking-[-0.02em]">
              {model.cn}
            </h2>
            <span className="badge badge-brand">{model.tag}</span>
          </div>
          <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
            {model.vendor} · {model.country} · {model.archLabel} · {model.releasedAt} {t("发布 ·")}{' '}
            {model.license ?? t("协议未标注")}
          </div>
        </div>
      </div>

      <div className="dialog-body">
        {/* 先比喻，后数字 —— 这是内容规范里最不该省的一条 */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-[12px] border p-3.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="field-label">{t("生活化比喻")}</div>
            <div className="text-[12.5px] leading-[1.7]">{model.metaphor}</div>
          </div>
          <div className="rounded-[12px] border p-3.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="field-label">{t("真实数字")}</div>
            <div className="text-[12.5px] leading-[1.7]">{model.real}</div>
          </div>
        </div>

        <div className="mt-3.5">
          <SpecGrid
            items={[
              { k: t("参数量"), v: `${model.paramsB}B`, mono: true },
              { k: t("层数"), v: model.layers, mono: true },
              { k: t("隐藏维度"), v: model.hiddenDim, mono: true },
              { k: t("最大上下文"), v: fmtCtx(model.ctxMax), mono: true },
              { k: t("架构"), v: model.archLabel },
              { k: t("厂商"), v: model.vendor },
              { k: t("支持语言"), v: model.languages.join(' / ') },
              { k: t("许可证"), v: model.license ?? t("未标注") },
            ]}
          />
        </div>

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {model.scenes.map((scene) => (
            <span
              key={scene}
              className="rounded-md px-2 py-1 text-[11px]"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
            >
              {scene}
            </span>
          ))}
        </div>

        <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
          <div className="note note-good">
            <div className="mb-1 font-semibold" style={{ color: 'var(--good-ink)' }}>
              {t("擅长什么")}
            </div>
            <ul className="space-y-1">
              {model.strengths.map((item) => (
                <li key={item} className="flex gap-1.5">
                  <span style={{ color: 'var(--good-ink)' }}>·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="note note-warn">
            <div className="mb-1 font-semibold" style={{ color: 'var(--warn-ink)' }}>
              {t("不适合什么")}
            </div>
            <ul className="space-y-1">
              {model.weaknesses.map((item) => (
                <li key={item} className="flex gap-1.5">
                  <span style={{ color: 'var(--warn-ink)' }}>·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ---------------- 显存估算器 ---------------- */}
        <div
          className="mt-4 rounded-[14px] border p-4"
          style={{
            borderColor: 'color-mix(in srgb, var(--accent) 22%, transparent)',
            background: 'var(--accent-soft)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12.5px] font-semibold">
              {t("显存估算器")} <span className="badge badge-mute ml-1">{t("估算值")}</span>
            </div>
            <Segmented value={quant} options={QUANT_OPTIONS} onChange={setQuant} ariaLabel={t("量化方式")} />
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="mono text-[32px] font-bold leading-none tracking-[-0.03em]">{fmtGb(need.total)}</span>
            <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>
              {t("GB 显存需求")}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <label htmlFor="ctx-range" className="shrink-0 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
              {t("上下文")}
            </label>
            <input
              id="ctx-range"
              type="range"
              min={2048}
              max={model.ctxMax}
              step={2048}
              value={ctx}
              onChange={(event) => setCtx(Number(event.target.value))}
              className="flex-1 accent-[var(--accent)]"
            />
            <span className="mono w-10 shrink-0 text-right text-[12px] font-semibold">{fmtCtx(ctx)}</span>
          </div>

          {/* 拆解条：让人看见「原来显存不是只有权重」 */}
          <div className="mt-3">
            <div className="flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
              <div style={{ width: seg(need.weights), background: 'var(--accent)' }} />
              <div style={{ width: seg(need.kvCache), background: 'var(--mint)' }} />
              <div style={{ width: seg(need.overhead + need.margin), background: 'var(--warning)' }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-2)' }}>
              <span>
                <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: 'var(--accent)' }} />
                {t("权重")} {fmtGb(need.weights)}G
              </span>
              <span>
                <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: 'var(--mint)' }} />
                KV Cache {fmtGb(need.kvCache)}G
              </span>
              <span>
                <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: 'var(--warning)' }} />
                {t("开销与余量")} {fmtGb(need.overhead + need.margin)}G
              </span>
              <span className="mono">{t("权重+KV =")} {fmtGb(raw)}G</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
            <span>
              {t("单张")} {gpu4090.name.replace(/ \d+G$/, '')} {t("约")}{' '}
              <b className="mono" style={{ color: 'var(--warn-ink)' }}>
                {tpsSingle}
              </b>{' '}
              tokens/s
            </span>
            <span>
              {t("双")} {gpu3090.name.replace(/ \d+G$/, '')} {t("约")}{' '}
              <b className="mono" style={{ color: 'var(--warn-ink)' }}>
                {tpsDual}
              </b>{' '}
              tokens/s
            </span>
            <span className="mono">≈ {tpsToChars(tpsSingle)} {t("字/秒")}</span>
          </div>
        </div>

        <div className="note note-warn mt-3.5">
          <div className="mb-1 font-semibold" style={{ color: 'var(--warn-ink)' }}>
            {t("常见误区")}
          </div>
          {model.mistake}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={() => {
              onClose();
              navigate(`/recommend?model=${model.id}`);
            }}
          >
            <Sparkles size={15} />
            {t("看要买什么硬件")}
          </button>
          <button
            type="button"
            className="btn btn-ghost flex-1"
            onClick={() => {
              onClose();
              navigate(`/builder?model=${model.id}`);
            }}
          >
            <Cpu size={15} />
            {t("拿去组装台")}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </Dialog>
  );
}
