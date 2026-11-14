import type { BuildStats, ModelSpec, Quant } from '@clab/engine';
import { DDR5_DUAL_CHANNEL_GBPS, NVME_READ_GBPS, describeTopology } from '@clab/engine';
import { t, tf } from '@/i18n';
import { fmtGb, fmtPct } from '@/lib/format';

/** 把内核的结构化结论翻成一句话。模板放 UI 层，字典才能覆盖到。 */
function verdictText(verdict: ReturnType<typeof describeTopology>['verdict']): string {
  switch (verdict.key) {
    case 'no-gpu':
      return t('还没装显卡：拓扑里 GPU 那一路是空的，整机跑不了模型。');
    case 'weak-psu':
      return t('电源带不动：链路还没跑满，先换更大瓦数的电源。');
    case 'weak-cooling':
      return t('散热压不住整机功耗：持续满载会降频，速度比估算更低。');
    case 'multi-gpu':
      return tf('多卡要靠 {lanes} 条 PCIe 通道通信：链路带宽只有显存带宽的 1/{ratio}，张量并行的扩展效率会明显低于卡数。', {
        lanes: verdict.vars.lanes,
        ratio: verdict.vars.ratio,
      });
    case 'mixed-gpu':
      return t('混插了不同型号的显卡：可用显存按最小那张卡计算，别按总和估。');
    case 'single-gpu':
    default:
      return t('单卡推理几乎不过 PCIe：模型常驻显存后，瓶颈在显存带宽，不在这条链路。');
  }
}

interface TopologyViewProps {
  stats: BuildStats;
  model: ModelSpec | null;
  quant: Quant;
  ctx: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  metric: string;
  detail: string;
  tone: 'ok' | 'missing' | 'hot';
}

const W = 680;
const H = 402;

/**
 * 硬件拓扑视图。
 *
 * 和机箱视图的分工：机箱回答「件装在哪」，拓扑回答「数据怎么走、卡在哪」。
 * 所以这张图不画外观，只画节点和链路。
 *
 * 带宽标签不放在连线上：中间栏只有三百多像素宽，任何一句「PCIe 5.0 ×16 ·
 * 63GB/s」都会压到节点。改成「节点里写结果、图下方一条对照带」——
 * 显存带宽和 PCIe 带宽并排摆着，「多卡不是插上就能翻倍」就不用解释了。
 */
export function TopologyView({ stats, model, quant, ctx }: TopologyViewProps) {
  const topo = describeTopology({ stats, model, quant, ctx });

  const gpuCount = stats.gpus.length;
  const slots = Math.min(gpuCount, 4);
  const gpuH = slots <= 1 ? 86 : 66;
  const gpuGap = 12;
  const gpuTotalH = slots * gpuH + Math.max(0, slots - 1) * gpuGap;
  const gpuTop = 96 + Math.max(0, (196 - gpuTotalH) / 2);

  const cpu: Box = {
    x: 246,
    y: 152,
    w: 182,
    h: 92,
    title: stats.cpu?.name ?? t('未选 CPU'),
    metric: stats.cpu ? stats.cpu.cores : '—',
    detail: stats.cpu ? `TDP ${stats.cpu.tdpW}W` : '',
    tone: stats.cpu ? 'ok' : 'missing',
  };

  const ram: Box = {
    x: 24,
    y: 52,
    w: 196,
    h: 86,
    title: stats.rams.length > 0 ? tf('{n} 条内存', { n: stats.rams.length }) : t('未装内存'),
    metric: stats.ramGb > 0 ? `${stats.ramGb}GB` : '—',
    detail: tf('双通道 DDR5 ≈ {b}GB/s（估算）', { b: DDR5_DUAL_CHANNEL_GBPS }),
    tone: stats.rams.length > 0 ? 'ok' : 'missing',
  };

  const storage: Box = {
    x: 24,
    y: 252,
    w: 196,
    h: 86,
    title: stats.storages[0]?.name ?? t('未装硬盘'),
    metric: stats.storages[0] ? `${stats.storages[0].capacityTb}TB` : '—',
    detail: tf('NVMe ≈ {b}GB/s', { b: NVME_READ_GBPS }),
    tone: stats.storages.length > 0 ? 'ok' : 'missing',
  };

  const psu: Box = {
    x: 246,
    y: 286,
    w: 182,
    h: 82,
    title: stats.psu?.name ?? t('未选电源'),
    metric: stats.psu ? `${stats.psu.watt}W` : '—',
    detail: stats.psu ? tf('整机约 {w}W', { w: Math.round(stats.powerW) }) : '',
    tone: !stats.psu ? 'missing' : topo.powerHeadroom < 0 ? 'hot' : 'ok',
  };

  const cooling: Box = {
    x: 470,
    y: 300,
    w: 186,
    h: 68,
    title: stats.cooling?.name ?? t('未选散热'),
    metric: stats.cooling ? `${stats.cooling.capacityW}W` : '—',
    detail: stats.cooling ? tf('噪声 {n}dB', { n: stats.cooling.noiseDb }) : '',
    tone: !stats.cooling ? 'missing' : topo.coolingHeadroom < 0 ? 'hot' : 'ok',
  };

  const gpuBoxes: Box[] = stats.gpus.slice(0, 4).map((gpu, index) => ({
    x: 470,
    y: gpuTop + index * (gpuH + gpuGap),
    w: 186,
    h: gpuH,
    title: gpu.name,
    metric: `${gpu.vramGb}GB · ${gpu.bandwidth}GB/s`,
    detail: `PCIe ${gpu.pcieGen ?? 4}.0 ×${gpuCount > 1 ? 8 : 16}`,
    tone: 'ok',
  }));

  const boxes = [cpu, ram, storage, psu, cooling, ...gpuBoxes];

  // 折线而不是斜线：主板走线本就横平竖直，斜线在缩略图里像「网」不像「链路」
  const elbows: Array<{ d: string; hot: boolean }> = [];
  if (stats.rams.length > 0) {
    elbows.push({ d: `M ${cpu.x} ${cpu.y + 26} H 234 V ${ram.y + 43} H 220`, hot: false });
  }
  if (stats.storages.length > 0) {
    elbows.push({ d: `M ${cpu.x} ${cpu.y + cpu.h - 26} H 234 V ${storage.y + 43} H 220`, hot: false });
  }
  gpuBoxes.forEach((box, index) => {
    const fromY = cpu.y + 26 + index * 18;
    const toY = box.y + box.h / 2;
    elbows.push({
      d: `M ${cpu.x + cpu.w} ${fromY} H 446 V ${toY} H ${box.x}`,
      hot: gpuCount > 1,
    });
  });

  // 通道数、链路带宽、带宽比全部来自内核，页面不再自己算一遍
  const { lanes, pcieGbps, hbmGbps: hbm, ratio } = topo;
  const gen = stats.gpus[0]?.pcieGen ?? 4;

  return (
    <div className="topo-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="topo-svg" role="img" aria-label={t('硬件拓扑图')}>
        <defs>
          <pattern id="topo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="var(--border)" strokeWidth="0.5" opacity="0.55" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#topo-grid)" opacity="0.5" />

        {/* 电源 → CPU 的供电线，虚线表示「不是数据链路」 */}
        {stats.psu && (
          <path
            d={`M 337 ${psu.y} V ${cpu.y + cpu.h}`}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth="1.4"
            strokeDasharray="4 4"
            opacity="0.7"
          />
        )}

        {elbows.map((link, index) => (
          <path
            key={`link-${index}`}
            d={link.d}
            fill="none"
            stroke={link.hot ? 'var(--danger)' : 'var(--border-strong)'}
            strokeWidth={link.hot ? 2 : 1.4}
            strokeLinejoin="round"
            strokeDasharray={link.hot ? '6 3' : undefined}
            opacity={link.hot ? 0.95 : 0.9}
          />
        ))}

        {boxes.map((box, index) => (
          <g key={`box-${index}`} className={`topo-node tone-${box.tone}`}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} />
            <text x={box.x + 12} y={box.y + 23} className="topo-title">
              {box.title}
            </text>
            <text x={box.x + 12} y={box.y + 45} className="topo-metric">
              {box.metric}
            </text>
            {box.detail && (
              <text x={box.x + 12} y={box.y + 64} className="topo-detail">
                {box.detail}
              </text>
            )}
          </g>
        ))}
      </svg>

      <div className="topo-tape">
        <span className="topo-tape-item">
          {t('显存带宽')} <b>{hbm > 0 ? `${hbm}GB/s` : '—'}</b>
        </span>
        <span className="topo-tape-vs">vs</span>
        <span className={`topo-tape-item ${ratio >= 20 ? 'is-hot' : ''}`}>
          {t('PCIe 链路')} <b>{pcieGbps > 0 ? `${gen}.0 ×${lanes} · ${pcieGbps.toFixed(1)}GB/s` : '—'}</b>
        </span>
        {ratio > 0 && <span className="topo-tape-ratio">{tf('相差 {n} 倍', { n: ratio })}</span>}
      </div>

      <div className="topo-foot">
        <p className="topo-verdict">{verdictText(topo.verdict)}</p>
        <div className="topo-chips">
          <span className="topo-chip">
            {t('供电余量')} <b>{fmtPct(topo.powerHeadroom)}</b>
          </span>
          <span className="topo-chip">
            {t('散热余量')} <b>{fmtPct(topo.coolingHeadroom)}</b>
          </span>
          {topo.loadSeconds !== null && (
            <span className="topo-chip">
              {t('模型加载')} <b>{topo.loadSeconds.toFixed(1)}s</b>
            </span>
          )}
          <span className="topo-chip">
            {t('单卡显存')} <b>{fmtGb(stats.vramGb)}GB</b>
          </span>
        </div>
      </div>
    </div>
  );
}
