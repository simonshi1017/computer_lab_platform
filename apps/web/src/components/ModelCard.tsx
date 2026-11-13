import { vramNeed } from '@clab/engine';
import type { ModelRecord } from '@/data';
import { fmtCtx, fmtGb } from '@/lib/format';
import { modelSizeLabel } from '@/lib/modelSize';
import { t } from '@/i18n';

interface ModelCardProps {
  model: ModelRecord;
  onOpen: (id: string) => void;
}

/** 卡片上露出的信息按「决策顺序」排：是谁 → 干什么用 → 要多少显存 */
export function ModelCard({ model, onOpen }: ModelCardProps) {
  const need4 = vramNeed(model, 'int4', Math.min(8192, model.ctxMax));

  return (
    <button
      type="button"
      onClick={() => onOpen(model.id)}
      className="card entry-card w-full p-4 text-left"
      aria-label={`查看 ${model.cn} 详情`}
    >
      <div className="flex items-start gap-3">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] font-mono text-[12.5px] font-bold"
          style={{ background: `${model.color}1A`, color: model.color, border: `1px solid ${model.color}2E` }}
        >
          {modelSizeLabel(model)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="entry-title truncate">{model.cn}</div>
          <div className="entry-sub truncate">
            {model.vendor} · {model.archLabel}
          </div>
        </div>
        <span className="badge badge-brand shrink-0">{model.tag}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {model.scenes.slice(0, 3).map((scene) => (
          <span
            key={scene}
            className="rounded px-1.5 py-0.5 text-[10.5px]"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
          >
            {scene}
          </span>
        ))}
      </div>

      <p className="entry-desc clamp-2 mt-2.5">{model.metaphor}</p>

      <div
        className="mt-3 flex items-center justify-between border-t pt-2.5 text-[11px]"
        style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
      >
        <span className="mono">
          {fmtCtx(model.ctxMax)} {t("上下文")}
        </span>
        <span className="mono">
          {t("INT4 需")} <b style={{ color: 'var(--text)' }}>{fmtGb(need4.total)}G</b>
        </span>
      </div>
    </button>
  );
}
