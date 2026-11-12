import type { BuildStats, VramBreakdown } from '@clab/engine';
import { fmtNum } from '@/lib/format';

interface MetricsBarProps {
  stats: BuildStats;
  need: VramBreakdown;
  /** 目标模型尺寸标签，如「14B INT4」，用于显存格的副标题 */
  modelName: string;
}

/**
 * 实时指标条。
 *
 * 故意把「你有多少 / 需要多少」并排放：只显示一个总数，用户无法判断够不够。
 */
export function MetricsBar({ stats, need, modelName }: MetricsBarProps) {
  const vramShort = stats.vramGb > 0 && need.total > stats.vramGb;

  const items = [
    {
      key: '显存',
      value: `${stats.vramGb}`,
      unit: 'GB',
      sub: `${modelName} 需 ${need.total.toFixed(1)}G`,
      danger: vramShort,
    },
    { key: '内存', value: `${stats.ramGb}`, unit: 'GB', sub: `权重 ${need.weights.toFixed(1)}G` },
    {
      key: '整机功耗',
      value: `${stats.powerW}`,
      unit: 'W',
      sub: stats.psu ? `电源 ${stats.psu.watt}W · 负载 ${Math.round((stats.powerW / stats.psu.watt) * 100)}%` : '还没选电源',
      danger: Boolean(stats.psu && stats.powerW > stats.psu.watt),
    },
    { key: '整机价格', value: fmtNum(stats.priceCny), unit: '元', sub: '硬件一次性投入' },
    { key: '月电费', value: fmtNum(stats.elecMonthlyCny), unit: '元', sub: '按每天 8 小时 · 0.6 元/度' },
  ];

  return (
    <div className="metrics">
      {items.map((item) => (
        <div className="metric" key={item.key}>
          <div className="k">{item.key}</div>
          <div className="v" style={item.danger ? { color: 'var(--danger-ink)' } : undefined}>
            {item.value}
            <small>{item.unit}</small>
          </div>
          <div className="s" title={item.sub}>
            {item.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
