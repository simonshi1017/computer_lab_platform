import type { Tier } from '@clab/engine';
import { gpuById } from '@/data';
import { ArrowRight, Volume2 } from 'lucide-react';
import { fmtGb, fmtPct, fmtPrice, tpsToChars } from '@/lib/format';
import { t } from '@/i18n';

interface TierCardProps {
  tier: Tier;
  budget: number;
  onLoad: () => void;
}

/** 同型号多条内存折叠成「2 × 64GB」，堆六个型号名会把清单撑爆 */
function ramLabel(tier: Tier): string {
  const first = tier.rams[0];
  if (!first) return t("未配");
  const same = tier.rams.every((ram) => ram.id === first.id);
  return same && tier.rams.length > 1 ? `${tier.rams.length} × ${first.name}` : tier.rams.map((ram) => ram.name).join(' + ');
}

export function TierCard({ tier, budget, onLoad }: TierCardProps) {
  const load = Math.round((tier.powerW / tier.psu.watt) * 100);
  const overBudget = tier.priceCny > budget;
  const quiet = tier.cooling.noiseDb <= 36;
  // engine 只认计算字段，货源状态属于数据层，这里按 id 回查
  const condition = gpuById(tier.gpu.id)?.condition ?? 'new';

  const bom = [
    { k: t("显卡"), v: `${tier.gpu.name} × ${tier.gpuCount}`, p: tier.gpu.priceCny * tier.gpuCount },
    { k: 'CPU', v: `${tier.cpu.name} · ${tier.cpu.cores}`, p: tier.cpu.priceCny },
    { k: t("主板"), v: tier.mobo.name, p: tier.mobo.priceCny },
    { k: t("内存"), v: ramLabel(tier), p: tier.rams.reduce((sum, ram) => sum + ram.priceCny, 0) },
    { k: t("电源"), v: `${tier.psu.watt}W`, p: tier.psu.priceCny },
    { k: t("硬盘"), v: tier.storage.name, p: tier.storage.priceCny },
    { k: t("散热"), v: tier.cooling.name, p: tier.cooling.priceCny },
  ];

  return (
    <div className="tier-card card" data-picked={tier.picked}>
      {tier.picked && <span className="tier-flag">{t("推荐")}</span>}

      <div className="tier-head">
        <div className="tier-name">{t(tier.name)}</div>
        <div className="tier-desc">{t(tier.desc)}</div>
        <div className="tier-price">
          {fmtPrice(tier.priceCny)}
          <small>{t("整机")}</small>
        </div>
        {overBudget && (
          <div className="tier-over">{t("超预算")} {fmtPrice(tier.priceCny - budget)}</div>
        )}
      </div>

      <div className="tier-body">
        <div className="tier-gpu">
          <span className={`vendor${tier.gpu.vendor === 'AMD' ? ' amd' : ''}`}>{tier.gpu.vendor}</span>
          <span className="truncate">{tier.gpu.name}</span>
          {condition === 'used' && <span className="cond">{t("二手")}</span>}
          <span className="count">× {tier.gpuCount}</span>
        </div>

        <div className="bom">
          {bom.map((row) => (
            <div className="bom-row" key={row.k}>
              <span className="k">{row.k}</span>
              <span className="v" title={row.v}>
                {row.v}
              </span>
              <span className="p">{fmtPrice(row.p)}</span>
            </div>
          ))}
        </div>

        <div className="tier-metrics">
          <div>
            <div className="k">{t("显存")}</div>
            <div className="v mono">{fmtGb(tier.vramGb)}G</div>
          </div>
          <div>
            <div className="k">{t("余量")}</div>
            <div className="v mono">{fmtPct(tier.headroom)}</div>
          </div>
          <div>
            <div className="k">{t("速度")}</div>
            <div className="v mono">{tier.tps} t/s</div>
          </div>
        </div>

        <div className="tier-why">
          {t("显存")} {fmtGb(tier.vramGb)}{t("G 装得下，还剩")} <b>{fmtPct(tier.headroom)}</b>{t("；整机")} {tier.powerW}{t("W 配")} {tier.psu.watt}{t("W 电源（负载")} {load}{t("%）。按")} {tier.tps} {t("tokens/s 算约合")}{' '}
          <b>{tpsToChars(tier.tps)} {t("字/秒")}</b>。
          {quiet && (
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--good-ink)' }}>
              {' '}
              <Volume2 size={10} /> {t("满载约")} {tier.cooling.noiseDb}dB
            </span>
          )}
          {tier.gpu.vendor === 'AMD' && (
            <span style={{ color: 'var(--warn-ink)' }}> {t("AMD 走 ROCm，生态不如 CUDA，新手更建议 NVIDIA。")}</span>
          )}
          {condition === 'used' && (
            <span style={{ color: 'var(--warn-ink)' }}>
              {' '}
              {t("这张卡是二手行情价，无全新货源；矿卡风险与成色差异要自己判断。")}
            </span>
          )}
        </div>
      </div>

      <div className="tier-foot">
        <button type="button" className="btn btn-primary w-full" onClick={onLoad}>
          {t("用这套去组装")}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
