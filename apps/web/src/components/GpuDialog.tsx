import { useNavigate } from 'react-router-dom';
import { Cpu } from 'lucide-react';
import type { GpuRecord } from '@clab/data';
import { Dialog } from '@/components/ui/Dialog';
import { SpecGrid } from '@/components/ui/controls';
import { FIT_CTX, VERDICT_COLOR, VERDICT_LABEL, modelsFitForGpu } from '@/lib/fit';
import { fmtCtx, fmtGb, fmtPrice } from '@/lib/format';
import { modelSizeLabel } from '@/lib/modelSize';
import { priceProvenance, usePrices } from '@/hooks/usePrices';
import { t } from '@/i18n';

interface GpuDialogProps {
  gpu: GpuRecord | null;
  onClose: () => void;
}

export function GpuDialog({ gpu, onClose }: GpuDialogProps) {
  const navigate = useNavigate();
  // hook 必须在提前 return 之前调用，否则 gpu 从有到无时 hook 数量会变
  const prices = usePrices();
  if (!gpu) return null;

  const info = prices?.get(gpu.id);
  const provenance = priceProvenance(info);

  const fits = modelsFitForGpu(gpu);
  const runnable = fits.filter((fit) => fit.verdict !== 'no');
  const blocked = fits.filter((fit) => fit.verdict === 'no');

  return (
    <Dialog open onClose={onClose} labelledBy="gpu-dialog-title">
      <div className="dialog-head">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
        >
          <Cpu size={19} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="gpu-dialog-title" className="text-[17px] font-semibold tracking-[-0.02em]">
              {gpu.name}
            </h2>
            <span className="badge badge-mute">{gpu.gpuClass}</span>
          </div>
          <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
            {gpu.vendor} · {gpu.arch} · {gpu.memoryType} {gpu.busWidth}bit
          </div>
        </div>
      </div>

      <div className="dialog-body">
        <SpecGrid
          items={[
            { k: t("显存"), v: `${gpu.vramGb} GB`, mono: true },
            { k: t("带宽"), v: `${gpu.bandwidth} GB/s`, mono: true },
            { k: t("功耗"), v: `${gpu.tdpW} W`, mono: true },
            { k: t("参考价"), v: fmtPrice(info?.priceCny ?? gpu.priceCny), mono: true },
            { k: t("显存类型"), v: gpu.memoryType },
            { k: t("位宽"), v: `${gpu.busWidth} bit`, mono: true },
            { k: t("供电"), v: gpu.powerConnector },
            { k: t("卡长"), v: gpu.lengthMm > 0 ? `${gpu.lengthMm} mm` : t("板载模组") },
            {
              k: t("货源"),
              v: gpu.condition === 'used' ? t("二手") : gpu.condition === 'channel' ? t("渠道 / 整机") : t("全新零售"),
            },
          ]}
        />

        <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
          <div className="note note-info">
            <div className="mb-1 font-semibold" style={{ color: 'var(--accent-ink)' }}>
              {t("适合什么场景")}
            </div>
            {gpu.scene}
          </div>
          <div className="note">
            <div className="mb-1 font-semibold">{t("一句话点评")}</div>
            {gpu.note}
            <div className="mt-1.5 text-[11px]" style={{ color: provenance.stale ? 'var(--warn-ink)' : 'var(--text-3)' }}>
              {t("价格来源：")}{provenance.text || t("未采集")}
              {provenance.stale && t("· 建议下单前重新核对")}
            </div>
            <div className="mt-1 text-[10.5px]" style={{ color: 'var(--text-3)' }}>
              {t("目录说明：")}{gpu.priceNote}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-[12.5px] font-semibold">{t("单卡能跑哪些模型")}</div>
            <span className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>
              {t("按 INT4 ·")} {fmtCtx(FIT_CTX)} {t("上下文估算")}
            </span>
          </div>

          <div className="overflow-hidden rounded-[10px] border" style={{ borderColor: 'var(--border)' }}>
            {runnable.length === 0 && (
              <div className="p-3 text-[12px]" style={{ color: 'var(--text-2)' }}>
                {t("这张卡连最小的 7B INT4 都放不下，不建议用来跑模型。")}
              </div>
            )}
            {runnable.map((fit, index) => (
              <div
                key={fit.model.id}
                className="flex items-center gap-3 px-3 py-2"
                style={{
                  borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                  background: 'var(--surface)',
                }}
              >
                <span className="mono w-8 shrink-0 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {modelSizeLabel(fit.model)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{fit.model.cn}</span>
                <span className="mono shrink-0 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {fmtGb(fit.needGb)}G / {gpu.vramGb}G
                </span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ color: VERDICT_COLOR[fit.verdict], background: 'var(--surface-2)' }}
                >
                  {VERDICT_LABEL[fit.verdict]}
                </span>
              </div>
            ))}
          </div>

          {blocked.length > 0 && (
            <div className="mt-2 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
              {t("放不下：")}{blocked.map((fit) => modelSizeLabel(fit.model)).join('、')}
              {t("—— 需要更大显存或多卡。")}
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary mt-4 w-full"
          onClick={() => {
            onClose();
            navigate(`/builder?gpu=${gpu.id}`);
          }}
        >
          <Cpu size={15} />
          {t("把这张卡放进机箱")}
        </button>
      </div>
    </Dialog>
  );
}
