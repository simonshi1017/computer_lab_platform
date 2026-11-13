import type { CoolingRecord, CpuRecord, GpuRecord, PsuRecord, RamRecord, StorageRecord } from '@clab/data';
import { shortGpuName } from '@/lib/format';
import { EmptyHint, Fan, HitArea, HW, RemoveButton, SlotGroup } from './primitives';
import { t } from '@/i18n';

/**
 * 八类槽位。
 *
 * 每个组件只关心「画成什么样」，放置逻辑由外层通过 props 注入，
 * 这样桌面拖拽和移动端点击可以复用同一套槽位。
 * 坐标集中在这个文件里，是因为它们互相咬合（CPU 压在主板左上、内存紧贴其右），
 * 拆散到八个文件反而更难对齐。
 */

export interface SlotHandlers {
  hovering: boolean;
  /** 当前部件库分类是否与这个槽位匹配（不能用 target，会和 SVG 的同名属性冲突） */
  isTarget: boolean;
  /** 键盘：让 SVG 槽位也能被 Tab 聚焦，Enter/空格等同点击 */
  tabIndex: number;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  onClick: () => void;
  onRemove: () => void;
}

const groupProps = (filled: boolean, handlers: SlotHandlers) => ({
  filled,
  hovering: handlers.hovering,
  isTarget: handlers.isTarget,
  onDragOver: handlers.onDragOver,
  onDragLeave: handlers.onDragLeave,
  onDrop: handlers.onDrop,
  onClick: handlers.onClick,
  tabIndex: handlers.tabIndex,
  onKeyDown: handlers.onKeyDown,
});

/* ---------------- 顶部冷排 ---------------- */
export function CoolerSlot({ part, ...handlers }: { part: CoolingRecord | null } & SlotHandlers) {
  return (
    <SlotGroup {...groupProps(Boolean(part), handlers)} role="button" aria-label={part ? `散热 ${part.name}` : t("空冷排位")}>
      {part ? (
        <>
          <rect x={56} y={34} width={548} height={54} rx={8} fill="url(#hwRad)" stroke="#4A5470" strokeWidth={1.2} />
          {[0, 1, 2].map((index) => (
            <Fan key={index} cx={118 + index * 150} cy={61} r={21} />
          ))}
          <text x={596} y={52} textAnchor="end" fontSize={11.5} fill={HW.ink}>
            {part.name}
          </text>
          <text x={596} y={67} textAnchor="end" fontSize={11} fill={HW.dim}>
            {part.noiseDb}{t("dB · 可压")} {part.capacityW}W
          </text>
          <HitArea x={56} y={34} width={548} height={54} />
          <RemoveButton x={42} y={44} onRemove={handlers.onRemove} />
        </>
      ) : (
        <>
          <rect
            x={56}
            y={34}
            width={548}
            height={54}
            rx={8}
            fill="rgba(108,140,255,.04)"
            stroke="#3B465C"
            strokeDasharray="7 5"
          />
          <EmptyHint x={330} y={66} main={t("散热冷排 · 拖入或点击")} />
          <HitArea x={56} y={34} width={548} height={54} />
        </>
      )}
    </SlotGroup>
  );
}

/* ---------------- CPU ---------------- */
export function CpuSlot({ part, ...handlers }: { part: CpuRecord | null } & SlotHandlers) {
  return (
    <SlotGroup {...groupProps(Boolean(part), handlers)} role="button" aria-label={part ? `CPU ${part.name}` : t("空 CPU 插槽")}>
      {part ? (
        <>
          <rect x={86} y={120} width={80} height={80} rx={4} fill="#20283A" stroke="#4A5470" />
          <rect x={94} y={128} width={64} height={64} rx={3} fill={HW.metal} stroke={HW.metalLight} strokeWidth={1.2} />
          <text x={126} y={157} textAnchor="middle" fontSize={9.5} fill="#1A1F2B" fontWeight={700}>
            CPU
          </text>
          <text x={126} y={171} textAnchor="middle" fontSize={9} fill="#2B3244">
            {part.name.split(' ')[0]}
          </text>
          <text x={126} y={214} textAnchor="middle" fontSize={11} fill={HW.dim}>
            {part.cores}
          </text>
          <HitArea x={84} y={118} width={84} height={84} radius={5} />
          <RemoveButton x={158} y={128} onRemove={handlers.onRemove} />
        </>
      ) : (
        <>
          <rect x={86} y={120} width={80} height={80} rx={4} fill="#0C1119" stroke="#3B465C" strokeDasharray="6 4" />
          <rect x={94} y={128} width={64} height={64} rx={2} fill="none" stroke="#2E3648" />
          <path d="M94 128 h10 M94 128 v10" stroke={HW.faint} strokeWidth={1.4} />
          <text x={126} y={167} textAnchor="middle" fontSize={12} fill={HW.dim}>
            CPU
          </text>
          <HitArea x={84} y={118} width={84} height={84} radius={5} />
        </>
      )}
    </SlotGroup>
  );
}

/* ---------------- 内存 ---------------- */
export function RamSlot({ index, part, ...handlers }: { index: number; part: RamRecord | null } & SlotHandlers) {
  const x = 204 + index * 24;

  return (
    <SlotGroup {...groupProps(Boolean(part), handlers)} role="button" aria-label={part ? `内存 ${part.name}` : `空内存槽 DIMM${index + 1}`}>
      {part ? (
        <>
          <rect x={x} y={122} width={15} height={176} rx={3} fill="#2A3450" stroke="#54608A" />
          <rect x={x + 2} y={128} width={11} height={164} rx={2} fill="#3C4A6E" />
          {[0, 1, 2, 3].map((chip) => (
            <rect
              key={chip}
              x={x + 3}
              y={140 + chip * 38}
              width={9}
              height={26}
              rx={1.5}
              fill="rgba(255,255,255,.07)"
            />
          ))}
          <text
            transform={`rotate(-90 ${x + 7.5} 244)`}
            x={x + 7.5}
            y={244}
            textAnchor="middle"
            fontSize={11.5}
            fill="#C9D6F0"
          >
            {part.capacityGb}G
          </text>
          <rect x={x} y={298} width={15} height={4} rx={2} fill="#6C8CFF" opacity={0.7} />
          <HitArea x={x - 3} y={118} width={21} height={184} radius={4} />
          <RemoveButton x={x + 18} y={128} onRemove={handlers.onRemove} />
        </>
      ) : (
        <>
          <rect x={x} y={122} width={15} height={176} rx={3} fill="#0A0E16" stroke="#33405A" />
          <rect x={x + 1.5} y={126} width={12} height={168} rx={2} fill="none" stroke="#232C3E" />
          <text
            transform={`rotate(-90 ${x + 7.5} 226)`}
            x={x + 7.5}
            y={226}
            textAnchor="middle"
            fontSize={9.5}
            fill={HW.faint}
          >
            DIMM{index + 1}
          </text>
          <HitArea x={x - 3} y={118} width={21} height={184} radius={4} />
        </>
      )}
    </SlotGroup>
  );
}

/* ---------------- 显卡 ---------------- */
export function GpuSlot({ index, part, ...handlers }: { index: number; part: GpuRecord | null } & SlotHandlers) {
  const y = 316 + index * 48;

  return (
    <SlotGroup {...groupProps(Boolean(part), handlers)} role="button" aria-label={part ? `显卡 ${part.name}` : `空 PCIe ${index + 1}`}>
      {part ? (
        <>
          <rect x={64} y={y + 13} width={96} height={9} rx={2} fill="#05080D" stroke="#2E3648" />
          <rect x={70} y={y} width={332} height={38} rx={6} fill="url(#hwGpu)" stroke="#5A6580" strokeWidth={1.2} />
          <rect x={70} y={y} width={332} height={38} rx={6} fill="none" stroke="rgba(255,255,255,.07)" />
          <Fan cx={104} cy={y + 19} r={11.5} />
          <Fan cx={140} cy={y + 19} r={11.5} />
          <Fan cx={176} cy={y + 19} r={11.5} />
          <rect
            x={204}
            y={y + 8}
            width={2.5}
            height={22}
            rx={1.2}
            fill={part.vendor === 'AMD' ? HW.amdRed : HW.nvGreen}
            opacity={0.9}
          />
          <text x={217} y={y + 17} fontSize={13} fill={HW.ink} fontWeight={600}>
            {shortGpuName(part.name)}
          </text>
          <text x={217} y={y + 31} fontSize={10.5} fill={HW.dim}>
            {part.vramGb}GB · {part.bandwidth}GB/s · {part.tdpW}W
          </text>
          <rect x={70} y={y + 34} width={332} height={4} rx={2} fill="#0B0F16" />
          <HitArea x={66} y={y - 4} width={340} height={46} />
          <RemoveButton x={396} y={y + 5} onRemove={handlers.onRemove} />
        </>
      ) : (
        <>
          <rect x={64} y={y + 13} width={96} height={9} rx={2} fill="#05080D" stroke="#2E3648" />
          <rect
            x={66}
            y={y + 1}
            width={336}
            height={36}
            rx={6}
            fill="rgba(108,140,255,.03)"
            stroke="#3B465C"
            strokeDasharray="6 5"
          />
          <EmptyHint x={284} y={y + 24} main={`PCIe ${index + 1} · 空槽`} />
          <HitArea x={62} y={y - 4} width={344} height={46} />
        </>
      )}
    </SlotGroup>
  );
}

/* ---------------- 电源 ---------------- */
export function PsuSlot({ part, ...handlers }: { part: PsuRecord | null } & SlotHandlers) {
  return (
    <SlotGroup {...groupProps(Boolean(part), handlers)} role="button" aria-label={part ? `电源 ${part.name}` : t("空电源仓")}>
      {part ? (
        <>
          <rect x={60} y={522} width={204} height={56} rx={7} fill="url(#hwPsu)" stroke="#4A5470" strokeWidth={1.2} />
          <Fan cx={100} cy={550} r={19} spin={false} />
          <text x={132} y={547} fontSize={13} fill={HW.ink} fontWeight={600}>
            {part.watt}W
          </text>
          <text x={132} y={562} fontSize={11} fill={HW.dim}>
            {part.level}
          </text>
          <HitArea x={58} y={520} width={208} height={60} />
          <RemoveButton x={252} y={530} onRemove={handlers.onRemove} />
        </>
      ) : (
        <>
          <rect
            x={60}
            y={522}
            width={204}
            height={56}
            rx={7}
            fill="rgba(108,140,255,.035)"
            stroke="#3B465C"
            strokeDasharray="6 5"
          />
          <EmptyHint x={162} y={556} main={t("电源 · 拖入或点击")} />
          <HitArea x={58} y={520} width={208} height={60} />
        </>
      )}
    </SlotGroup>
  );
}

/* ---------------- 硬盘 ---------------- */
export function StorageSlot({ index, part, ...handlers }: { index: number; part: StorageRecord | null } & SlotHandlers) {
  const y = 130 + index * 52;

  return (
    <SlotGroup {...groupProps(Boolean(part), handlers)} role="button" aria-label={part ? `硬盘 ${part.name}` : `空盘位 ${index + 1}`}>
      {part ? (
        <>
          <rect x={548} y={y} width={88} height={42} rx={5} fill="#232B3C" stroke="#4A5470" />
          <rect x={552} y={y + 3} width={80} height={36} rx={3} fill="#2E3850" />
          <text x={592} y={y + 19} textAnchor="middle" fontSize={11.5} fill={HW.ink} fontWeight={600}>
            {part.capacityTb}TB
          </text>
          <text x={592} y={y + 32} textAnchor="middle" fontSize={10.5} fill={HW.dim}>
            NVMe
          </text>
          <circle cx={630} cy={y + 7} r={2} fill="#3DDC84" />
          <HitArea x={546} y={y - 3} width={92} height={48} radius={6} />
          <RemoveButton x={544} y={y + 4} onRemove={handlers.onRemove} />
        </>
      ) : (
        <>
          <rect
            x={548}
            y={y}
            width={88}
            height={42}
            rx={5}
            fill="rgba(108,140,255,.03)"
            stroke="#3B465C"
            strokeDasharray="5 4"
          />
          <EmptyHint x={592} y={y + 26} main={`SSD ${index + 1}`} />
          <HitArea x={546} y={y - 3} width={92} height={48} radius={6} />
        </>
      )}
    </SlotGroup>
  );
}
