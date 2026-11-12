interface RadarDatum {
  label: string;
  /** 0–100 */
  value: number;
}

interface RadarProps {
  data: RadarDatum[];
  size?: number;
}

/**
 * 六维雷达图。
 *
 * 自绘 SVG 而不是引 echarts：只有一个图表，引一个 200KB 的库不值当。
 * 颜色全部走 CSS 类（.rd-*），这样明暗主题切换不需要重新渲染。
 */
export function Radar({ data, size = 320 }: RadarProps) {
  const n = data.length;
  if (n < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 52;
  const angleOf = (index: number) => (Math.PI * 2 * index) / n - Math.PI / 2;

  const pointAt = (index: number, ratio: number) => {
    const angle = angleOf(index);
    return [cx + Math.cos(angle) * radius * ratio, cy + Math.sin(angle) * radius * ratio] as const;
  };

  const polygon = (ratio: number) =>
    data
      .map((_, index) => pointAt(index, ratio))
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');

  const valuePolygon = data
    .map((item, index) => pointAt(index, Math.max(0, Math.min(100, item.value)) / 100))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`六维评估：${data.map((d) => `${d.label} ${Math.round(d.value)} 分`).join('，')}`}
    >
      {/* 网格由外到内四层 */}
      {[1, 0.75, 0.5, 0.25].map((ratio) => (
        <polygon key={ratio} className="rd-grid" points={polygon(ratio)} />
      ))}

      {/* 轴线 */}
      {data.map((item, index) => {
        const [x, y] = pointAt(index, 1);
        return <line key={item.label} className="rd-axis" x1={cx} y1={cy} x2={x} y2={y} />;
      })}

      {/* 数据多边形 */}
      <polygon className="rd-poly" points={valuePolygon} fill="var(--accent-soft)" />

      {/* 顶点 */}
      {data.map((item, index) => {
        const [x, y] = pointAt(index, Math.max(0, Math.min(100, item.value)) / 100);
        return <circle key={item.label} className="rd-dot" cx={x} cy={y} r={2.8} />;
      })}

      {/* 标签与分值 */}
      {data.map((item, index) => {
        const angle = angleOf(index);
        const lx = cx + Math.cos(angle) * (radius + 20);
        const ly = cy + Math.sin(angle) * (radius + 20);
        const cos = Math.cos(angle);
        const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';

        return (
          <g key={item.label}>
            <text className="rd-label" x={lx} y={ly} textAnchor={anchor}>
              {item.label}
            </text>
            {/* 分值紧贴标签下方，不做水平偏移——偏移会在左右两侧顶出画布 */}
            <text className="rd-value mono" x={lx} y={ly + 13} textAnchor={anchor}>
              {Math.round(item.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 把评估维度转成雷达图数据（标签压缩到 4–5 字，否则会压线） */
export const RADAR_LABELS: Record<string, string> = {
  compat: '兼容性',
  perf: '性能',
  cost: '成本',
  thermo: '功耗散热',
  expand: '扩展性',
  match: '匹配度',
};
