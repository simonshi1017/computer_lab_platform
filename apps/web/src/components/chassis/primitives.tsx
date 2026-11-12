import type { ReactNode, SVGProps } from 'react';

/**
 * 机箱绘制基础件。
 *
 * 这里所有颜色都是写死的硬件本色（PCB 绿、金属灰、显卡黑），
 * 不跟随明暗主题反色——真实机箱不会因为界面切到浅色就变白。
 * 主题只影响它外面的容器。
 */

export const HW = {
  shellTop: '#343C50',
  shellBottom: '#191E2B',
  plate: '#0F131C',
  bezel: '#1B2231',
  pcb: '#16332A',
  pcbEdge: '#2E5C4B',
  pcbSilk: 'rgba(190,255,220,.45)',
  metal: '#8C97AC',
  metalLight: '#B9C4D6',
  ink: '#CBD5E5',
  dim: '#64708A',
  faint: '#4C576C',
  slot: '#070B12',
  fanRing: '#39415A',
  nvGreen: '#76B900',
  amdRed: '#ED1C24',
} as const;

export function ChassisDefs() {
  return (
    <defs>
      <linearGradient id="hwShell" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={HW.shellTop} />
        <stop offset="100%" stopColor={HW.shellBottom} />
      </linearGradient>
      <linearGradient id="hwGpu" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3B4460" />
        <stop offset="100%" stopColor="#1D2432" />
      </linearGradient>
      <linearGradient id="hwPsu" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#2B3244" />
        <stop offset="100%" stopColor="#151A24" />
      </linearGradient>
      <linearGradient id="hwRad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2A3244" />
        <stop offset="100%" stopColor="#1A2030" />
      </linearGradient>
    </defs>
  );
}

/** 五片扇叶，靠 CSS 动画旋转；prefers-reduced-motion 时由 CSS 关掉 */
export function Fan({ cx, cy, r, spin = true }: { cx: number; cy: number; r: number; spin?: boolean }) {
  const blades: string[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i * 72 * Math.PI) / 180;
    const angle2 = angle + 0.62;
    const x1 = cx + Math.cos(angle) * r * 0.22;
    const y1 = cy + Math.sin(angle) * r * 0.22;
    const x2 = cx + Math.cos(angle2) * r * 0.86;
    const y2 = cy + Math.sin(angle2) * r * 0.86;
    const cx1 = cx + Math.cos(angle + 0.31) * r * 0.82;
    const cy1 = cy + Math.sin(angle + 0.31) * r * 0.82;
    blades.push(
      `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx1.toFixed(1)},${cy1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`,
    );
  }

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#0A0E16" stroke={HW.fanRing} strokeWidth={1} />
      {spin && (
        <g className="fan-blades">
          <path
            d={blades.join(' ')}
            fill="none"
            stroke="rgba(186,200,224,.55)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </g>
      )}
      <circle cx={cx} cy={cy} r={Math.max(2.4, r * 0.2)} fill={HW.fanRing} />
    </g>
  );
}

/** 移除按钮：悬停时由 CSS 显示 */
export function RemoveButton({ x, y, onRemove }: { x: number; y: number; onRemove: () => void }) {
  return (
    <g
      className="rm"
      role="button"
      aria-label="移除这个部件"
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
    >
      <circle cx={x} cy={y} r={8.5} fill="#0B0F16" stroke="#4A5568" strokeWidth={1} />
      <path
        d={`M${x - 3} ${y - 3} l6 6 M${x + 3} ${y - 3} l-6 6`}
        stroke={HW.ink}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </g>
  );
}

/** 空槽的命中层：透明矩形，负责拖放与点击 */
export function HitArea({ x, y, width, height, radius = 8 }: { x: number; y: number; width: number; height: number; radius?: number }) {
  return <rect className="hit" x={x} y={y} width={width} height={height} rx={radius} />;
}

export function EmptyHint({
  x,
  y,
  main,
  sub,
}: {
  x: number;
  y: number;
  main: string;
  sub?: string;
}) {
  return (
    <>
      <text x={x} y={y} textAnchor="middle" fontSize={12} fill={HW.dim}>
        {main}
      </text>
      {sub && (
        <text x={x} y={y + 16} textAnchor="middle" fontSize={10} fill={HW.faint}>
          {sub}
        </text>
      )}
    </>
  );
}

export function SlotGroup({
  filled,
  hovering,
  isTarget = false,
  children,
  ...rest
}: {
  filled: boolean;
  hovering: boolean;
  /** 当前部件库选中的分类与这个槽位匹配时高亮，告诉用户「可以放这里」 */
  isTarget?: boolean;
  children: ReactNode;
} & Omit<SVGProps<SVGGElement>, 'children'>) {
  return (
    <g
      className={`slot${filled ? ' filled' : ''}${hovering ? ' drop-hover' : ''}${isTarget && !filled ? ' slot-target' : ''}`}
      {...rest}
    >
      {children}
    </g>
  );
}
