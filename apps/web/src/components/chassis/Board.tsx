import type { MoboRecord } from '@clab/data';
import { EmptyHint, HitArea, HW, RemoveButton, SlotGroup } from './primitives';

interface BoardProps {
  mobo: MoboRecord | null;
  hovering: boolean;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  onClick: () => void;
  onRemove: () => void;
}

/**
 * 主板 PCB。
 *
 * 空状态时它同时是放置区；装了主板之后，CPU/内存/显卡都落在它上面，
 * 所以这里把 VRM、芯片组、24pin、M.2 这些细节画出来，
 * 让用户能看出「部件是插在主板上的」而不是飘在机箱里。
 */
export function Board({ mobo, hovering, onDragOver, onDragLeave, onDrop, onClick, onRemove }: BoardProps) {
  return (
    <SlotGroup
      filled={Boolean(mobo)}
      hovering={hovering}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      role="button"
      aria-label={mobo ? `主板 ${mobo.name}` : '空的主板位，点击选择主板'}
    >
      {mobo ? (
        <>
          <rect x={60} y={96} width={460} height={414} rx={9} fill={HW.pcb} stroke={HW.pcbEdge} strokeWidth={1.3} />
          <rect x={60} y={96} width={460} height={414} rx={9} fill="none" stroke="rgba(255,255,255,.05)" />

          {/* 走线纹理 */}
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <path
              key={index}
              d={`M${92 + index * 58} 108 V498`}
              stroke="rgba(190,255,220,.045)"
              strokeWidth={1}
            />
          ))}

          {/* VRM 散热片 */}
          <rect x={88} y={214} width={74} height={26} rx={3} fill="#24382F" stroke="#3E5C4F" />
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <path key={index} d={`M${96 + index * 11} 218 V236`} stroke="#335145" strokeWidth={2} />
          ))}

          {/* 芯片组散热片 */}
          <rect x={418} y={398} width={86} height={66} rx={5} fill="#24382F" stroke="#3E5C4F" />
          <path d="M424 410 h74 M424 422 h74 M424 434 h74 M424 446 h74" stroke="#335145" strokeWidth={1.6} />

          {/* 24pin 供电 */}
          <rect x={492} y={128} width={17} height={76} rx={2} fill="#1E2B26" stroke="#3E5C4F" />
          {Array.from({ length: 8 }, (_, index) => (
            <rect
              key={index}
              x={495}
              y={133 + index * 9}
              width={11}
              height={5}
              rx={1}
              fill="rgba(190,255,220,.18)"
            />
          ))}

          {/* M.2 插槽 */}
          <rect x={300} y={176} width={150} height={11} rx={2} fill="#0E1F1A" stroke="#3E5C4F" />
          <rect x={306} y={179} width={138} height={5} rx={1} fill="rgba(190,255,220,.1)" />
          <text x={300} y={172} fontSize={7.5} fill="rgba(190,255,220,.4)">
            M.2 NVMe
          </text>

          {/* 滤波电容与定位孔 */}
          {[
            [300, 128],
            [320, 128],
            [340, 128],
            [470, 300],
            [470, 316],
            [470, 332],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={4.2} fill="#1B2A24" stroke="#3E5C4F" />
          ))}
          {[
            [76, 112],
            [504, 112],
            [76, 494],
            [504, 494],
          ].map(([x, y]) => (
            <circle key={`hole-${x}-${y}`} cx={x} cy={y} r={3.4} fill="none" stroke="#4A7A66" strokeWidth={1.2} />
          ))}

          <text x={74} y={503} fontSize={10} fill={HW.pcbSilk}>
            {mobo.name}
          </text>
          <HitArea x={60} y={96} width={460} height={414} radius={9} />
          <RemoveButton x={512} y={104} onRemove={onRemove} />
        </>
      ) : (
        <>
          <rect
            x={60}
            y={96}
            width={460}
            height={414}
            rx={9}
            fill="rgba(108,140,255,.035)"
            stroke="#3B465C"
            strokeDasharray="7 5"
          />
          {/* 空态提示放在右侧空白，避开内存槽位置 */}
          <EmptyHint x={402} y={194} main="主板 · 先装底板" sub="CPU、内存、显卡都插在它上面" />
          <HitArea x={60} y={96} width={460} height={414} radius={9} />
        </>
      )}
    </SlotGroup>
  );
}
