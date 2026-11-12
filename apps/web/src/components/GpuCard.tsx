import type { GpuRecord } from '@clab/data';
import { maxModelForGpu } from '@/lib/fit';
import { fmtPrice } from '@/lib/format';
import { modelSizeLabel } from '@/lib/modelSize';
import { priceProvenance, usePrices } from '@/hooks/usePrices';

const VENDOR_STYLE: Record<string, { bg: string; fg: string }> = {
  NVIDIA: { bg: 'rgba(118,185,0,.12)', fg: '#5E9400' },
  AMD: { bg: 'rgba(237,28,36,.1)', fg: '#C81E27' },
  Intel: { bg: 'rgba(0,113,197,.1)', fg: '#0068B5' },
};

interface GpuCardProps {
  gpu: GpuRecord;
  onOpen: (id: string) => void;
  onBuild?: (id: string) => void;
}

export function GpuCard({ gpu, onOpen, onBuild }: GpuCardProps) {
  const best = maxModelForGpu(gpu);
  const vendor = VENDOR_STYLE[gpu.vendor] ?? VENDOR_STYLE.NVIDIA;
  // 价格来自后端（若可用），其余规格仍用内置数据
  const info = usePrices()?.get(gpu.id);
  const price = info?.priceCny ?? gpu.priceCny;
  const provenance = priceProvenance(info);

  return (
    <div className="card entry-card flex flex-col">
      <button type="button" className="flex-1 p-4 text-left" onClick={() => onOpen(gpu.id)}>
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="entry-title truncate" title={gpu.name}>
              {gpu.name}
            </div>
            <div className="entry-sub truncate">
              {gpu.vendor} · {gpu.arch} · {gpu.gpuClass}
            </div>
          </div>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.04em]"
            style={{ background: vendor.bg, color: vendor.fg }}
          >
            {gpu.vendor}
          </span>
        </div>

        <div
          className="mt-3 grid grid-cols-3 gap-1 overflow-hidden rounded-lg"
          style={{ background: 'var(--border)' }}
        >
          {[
            { k: '显存 GB', v: `${gpu.vramGb}` },
            { k: '带宽 GB/s', v: `${gpu.bandwidth}` },
            { k: '功耗 W', v: `${gpu.tdpW}` },
          ].map((item) => (
            <div key={item.k} style={{ background: 'var(--surface)' }} className="px-2 py-1.5">
              <div className="text-[9.5px]" style={{ color: 'var(--text-3)' }}>
                {item.k}
              </div>
              <div className="mono text-[12.5px] font-semibold">{item.v}</div>
            </div>
          ))}
        </div>

        <p className="entry-desc clamp-2 mt-2.5">{gpu.note}</p>
      </button>

      <div
        className="flex items-center justify-between gap-2 border-t px-4 py-2.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0">
          <div className="mono text-[13.5px] font-bold leading-tight">{fmtPrice(price)}</div>
          {/* 说得出「哪天、哪来的」，这个价格才值得被拿去和电商页面对账 */}
          <div
            className="truncate text-[10px]"
            style={{ color: provenance.stale ? 'var(--warn-ink)' : 'var(--text-3)' }}
            title={gpu.priceNote}
          >
            {provenance.text || gpu.priceNote}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {best ? (
            <span className="badge badge-good" title="按 INT4 · 8K 上下文估算，留 15% 显存余量">
              最大 {modelSizeLabel(best.model)}
            </span>
          ) : (
            <span className="badge badge-mute">跑不动 7B</span>
          )}
          {onBuild && (
            <button type="button" className="chip" onClick={() => onBuild(gpu.id)}>
              装机
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
