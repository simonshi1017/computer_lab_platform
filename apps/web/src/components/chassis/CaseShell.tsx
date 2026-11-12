import { HW } from './primitives';

/**
 * 机箱外壳与前面板。
 * 只有装饰作用，不参与交互——所有放件热区都在槽位组件里，
 * 这样拖到外壳空白处不会误触发放置。
 */
export function CaseShell() {
  return (
    <>
      <rect x={12} y={8} width={656} height={600} rx={20} fill="url(#hwShell)" stroke="#4A5470" strokeWidth={1.5} />
      <rect x={26} y={22} width={628} height={572} rx={12} fill={HW.plate} stroke="#232A39" strokeWidth={1} />

      {/* 前面板：电源灯 / USB / 进风条 */}
      <rect x={28} y={24} width={26} height={568} rx={7} fill={HW.bezel} stroke="#2B3346" />
      <circle cx={41} cy={50} r={4.2} fill="#3DDC84" opacity={0.9} />
      <circle cx={41} cy={50} r={7} fill="none" stroke="rgba(61,220,132,.28)" />
      <rect x={35} y={68} width={12} height={3.2} rx={1.6} fill={HW.fanRing} />
      <rect x={35} y={76} width={12} height={3.2} rx={1.6} fill={HW.fanRing} />
      <rect x={33} y={96} width={16} height={440} rx={4} fill="rgba(108,140,255,.05)" stroke="#242C3C" />
      <path d="M37 120 H45 M37 240 H45 M37 360 H45 M37 480 H45" stroke="#2A3244" strokeWidth={2} />

      {/* 四角螺丝 */}
      {[
        [34, 30],
        [646, 30],
        [34, 586],
        [646, 586],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={3} fill="#5A657F" />
          <path d={`M${x - 2} ${y} h4`} stroke={HW.plate} strokeWidth={1} />
        </g>
      ))}
    </>
  );
}
