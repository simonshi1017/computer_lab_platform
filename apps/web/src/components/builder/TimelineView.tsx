import { describeTimeline, type BuildStats, type ModelSpec, type Quant } from '@clab/engine';
import { t, tf } from '@/i18n';
import { fmtGb } from '@/lib/format';

interface TimelineViewProps {
  stats: BuildStats;
  model: ModelSpec;
  quant: Quant;
  ctx: number;
}

const W = 680;
const H = 262;
const PAD = { left: 46, right: 14, top: 22, bottom: 34 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

/**
 * 推理时序视图。
 *
 * 这条曲线回答的是评估面板回答不了的问题：**时间花在哪、显存在什么时候涨**。
 * 两段结构（预填充 / 解码）在图上用底色区分，因为它们的瓶颈完全不同：
 * 前者算力密集，后者访存密集。用户看到「预填充只占 5% 的时间」，
 * 就自然理解为什么长上下文慢在首字而不是吐字。
 */
export function TimelineView({ stats, model, quant, ctx }: TimelineViewProps) {
  const line = describeTimeline({ model, quant, ctx, gpus: stats.gpus });
  const hasGpu = stats.gpus.length > 0;

  // 纵轴不从 0 起：权重是「地平线」，真正想让人看见的是它上面涨出来的那层 KV。
  // 从 0 起画的话，16GB → 18.6GB 的变化会被压成一条直线，图就白画了。
  const baseline = line.weights;
  const yMin = Math.max(0, baseline * 0.94);
  const over = stats.vramGb > 0 && line.peakVram > stats.vramGb;
  // 只有「放不下」时才把可用线拉进视野：正常情况按峰值缩放，
  // 否则一条 32G 的参考线会把 16→18.6G 的增长压成一条平线。
  const yMax = over
    ? Math.max(line.peakVram * 1.08, stats.vramGb * 1.02)
    : Math.max(line.peakVram * 1.18, yMin + 0.5);
  const x = (ms: number) => PAD.left + (line.totalMs > 0 ? (ms / line.totalMs) * PLOT_W : 0);
  const y = (gb: number) => PAD.top + PLOT_H - ((gb - yMin) / (yMax - yMin)) * PLOT_H;

  const path = line.series.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.t).toFixed(2)} ${y(point.vram).toFixed(2)}`).join(' ');
  const area = `${path} L ${x(line.totalMs).toFixed(2)} ${y(yMin).toFixed(2)} L ${x(0).toFixed(2)} ${y(yMin).toFixed(2)} Z`;

  const prefillX = x(line.prefillMs);
  const vramLineY = over ? y(stats.vramGb) : null;

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div className="timeline-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" role="img" aria-label={t('推理时序曲线')}>
        {/* 两段底色：预填充 / 解码 */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={Math.max(0, prefillX - PAD.left)}
          height={PLOT_H}
          fill="var(--accent-soft, rgba(79,111,255,.08))"
        />
        <rect
          x={prefillX}
          y={PAD.top}
          width={Math.max(0, PAD.left + PLOT_W - prefillX)}
          height={PLOT_H}
          fill="var(--surface-2)"
          opacity="0.6"
        />
        <text x={PAD.left + 8} y={PAD.top + 14} className="timeline-zone">
          {t('预填充 prefill')}
        </text>
        <text x={prefillX + 8} y={PAD.top + 14} className="timeline-zone">
          {t('逐 token 解码')}
        </text>

        {/* 坐标轴 */}
        <line x1={PAD.left} y1={y(yMin)} x2={PAD.left + PLOT_W} y2={y(yMin)} stroke="var(--border-strong)" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={y(yMin)} stroke="var(--border-strong)" strokeWidth="1" />
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left - 4} y1={y(tick)} x2={PAD.left} y2={y(tick)} stroke="var(--border-strong)" />
            <text x={PAD.left - 8} y={y(tick) + 3} textAnchor="end" className="timeline-tick">
              {fmtGb(tick)}G
            </text>
          </g>
        ))}
        <text x={PAD.left + PLOT_W} y={y(yMin) + 18} textAnchor="end" className="timeline-tick">
          {fmtMs(line.totalMs)}
        </text>
        <text x={PAD.left} y={y(yMin) + 18} textAnchor="start" className="timeline-tick">
          0
        </text>

        {/* 权重基线：这条线是常数，曲线在它上面的部分就是 KV Cache */}
        <line
          x1={PAD.left}
          y1={y(baseline)}
          x2={PAD.left + PLOT_W}
          y2={y(baseline)}
          stroke="var(--text-3)"
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity="0.7"
        />
        <text x={PAD.left + 4} y={y(baseline) + 12} className="timeline-ref">
          {tf('权重 {w}G', { w: fmtGb(baseline) })}
        </text>

        {/* 显存曲线 */}
        <path d={area} fill="var(--accent)" opacity="0.1" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />

        {/* 可用显存参考线：超过就是跑不动 */}
        {vramLineY !== null && (
          <g>
            <line
              x1={PAD.left}
              y1={vramLineY}
              x2={PAD.left + PLOT_W}
              y2={vramLineY}
              stroke={over ? 'var(--danger)' : 'var(--good-ink)'}
              strokeWidth="1.2"
              strokeDasharray="6 3"
            />
            <text
              x={PAD.left + PLOT_W - 2}
              y={vramLineY - 5}
              textAnchor="end"
              className="timeline-ref"
              fill={over ? 'var(--danger-ink)' : 'var(--good-ink)'}
            >
              {tf('可用 {v}G', { v: fmtGb(stats.vramGb) })}
            </text>
          </g>
        )}
      </svg>

      <div className="timeline-foot">
        {hasGpu ? (
          <>
            <span className="timeline-chip">
              {t('首字延迟')} <b>{fmtMs(line.prefillMs)}</b>
            </span>
            <span className="timeline-chip">
              {t('解码耗时')} <b>{fmtMs(line.decodeMs)}</b>
            </span>
            <span className="timeline-chip">
              {t('峰值显存')} <b className={over ? 'is-hot' : undefined}>{fmtGb(line.peakVram)}G</b>
            </span>
            {stats.vramGb > 0 && (
              <span className="timeline-chip">
                {t('可用显存')} <b>{fmtGb(stats.vramGb)}G</b>
              </span>
            )}
            <span className="timeline-chip">
              {tf('KV 占 {n}%', { n: Math.round((line.kvEnd / Math.max(line.peakVram, 0.001)) * 100) })}
            </span>
            <span className="timeline-chip">
              {tf('{p} 提示 · {o} 输出', { p: line.promptTokens, o: line.outputTokens })}
            </span>
          </>
        ) : (
          <span className="timeline-chip is-hot">{t('先装一张显卡，才有可算的时序')}</span>
        )}
      </div>
    </div>
  );
}
