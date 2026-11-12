import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Build } from '@clab/engine';
import { DATASET } from '@clab/data';
import type { PartKind } from '@/hooks/useBuild';
import { DRAG_MIME, setPendingPayload, type DragPayload } from '@/components/chassis/Chassis';
import { fmtPrice, shortGpuName } from '@/lib/format';

interface PartPaletteProps {
  activeKind: PartKind;
  onKindChange: (kind: PartKind) => void;
  build: Build;
  onPlace: (kind: PartKind, id: string) => void;
}

interface PaletteItem {
  id: string;
  title: string;
  meta: string;
  price: number;
  installed: boolean;
  /** 更强的「不推荐」提示，例如显存太小跑不动当前模型 */
  hint?: string;
}

const TABS: Array<{ kind: PartKind; label: string }> = [
  { kind: 'gpu', label: '显卡' },
  { kind: 'cpu', label: 'CPU' },
  { kind: 'mobo', label: '主板' },
  { kind: 'ram', label: '内存' },
  { kind: 'psu', label: '电源' },
  { kind: 'storage', label: '硬盘' },
  { kind: 'cooling', label: '散热' },
];

/**
 * 左侧部件库。
 *
 * 既是拖拽源，也是「点击通道」的唯一入口——移动端没有拖拽，
 * 全靠「点空槽 → 库切到对应分类 → 点部件」这条路径。
 */
export function PartPalette({ activeKind, onKindChange, build, onPlace }: PartPaletteProps) {
  const [query, setQuery] = useState('');

  const items = useMemo<PaletteItem[]>(() => {
    const { parts } = DATASET;
    switch (activeKind) {
      case 'gpu':
        return DATASET.gpus.map((gpu) => ({
          id: gpu.id,
          // 202px 宽的列表放不下完整型号，去前缀去容量，保留辨识度最高的部分
          title: shortGpuName(gpu.name),
          meta: `${gpu.vramGb}G · ${gpu.bandwidth}GB/s`,
          price: gpu.priceCny,
          installed: build.gpuIds.includes(gpu.id),
        }));
      case 'cpu':
        return parts.cpus.map((cpu) => ({
          id: cpu.id,
          title: cpu.name,
          meta: `${cpu.cores}`,
          price: cpu.priceCny,
          installed: build.cpuId === cpu.id,
        }));
      case 'mobo':
        return parts.mobos.map((mobo) => ({
          id: mobo.id,
          title: mobo.name,
          meta: `${mobo.gpuSlots} 卡槽 · ${mobo.ramSlots} 槽内存`,
          price: mobo.priceCny,
          installed: build.moboId === mobo.id,
        }));
      case 'ram':
        return parts.rams.map((ram) => ({
          id: ram.id,
          title: ram.name,
          meta: `${ram.capacityGb}GB ${ram.kind}`,
          price: ram.priceCny,
          installed: build.ramIds.includes(ram.id),
        }));
      case 'psu':
        return parts.psus.map((psu) => ({
          id: psu.id,
          title: psu.name,
          meta: `${psu.watt}W · ${psu.level.replace('80PLUS ', '')}`,
          price: psu.priceCny,
          installed: build.psuId === psu.id,
        }));
      case 'storage':
        return parts.storages.map((storage) => ({
          id: storage.id,
          title: storage.name,
          meta: `${storage.capacityTb}TB NVMe`,
          price: storage.priceCny,
          installed: build.storageIds.includes(storage.id),
        }));
      case 'cooling':
        return parts.coolings.map((cooling) => ({
          id: cooling.id,
          title: cooling.name,
          meta: `可压 ${cooling.capacityW}W · ${cooling.noiseDb}dB`,
          price: cooling.priceCny,
          installed: build.coolingId === cooling.id,
        }));
      default:
        return [];
    }
  }, [activeKind, build]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) => item.title.toLowerCase().includes(q) || item.meta.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div className="palette">
      <div className="palette-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            className="ptab"
            data-active={activeKind === tab.kind}
            onClick={() => onKindChange(tab.kind)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative px-2.5 pb-2">
        <Search
          size={13}
          className="pointer-events-none absolute left-[19px] top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-3)' }}
        />
        <input
          className="input h-8 pl-7 text-[12px]"
          placeholder="搜部件…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="搜索部件"
        />
      </div>

      <div className="palette-body">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11.5px]" style={{ color: 'var(--text-3)' }}>
            没有匹配的部件
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              className="pitem"
              data-installed={item.installed}
              draggable
              onDragStart={(event) => {
                const payload: DragPayload = { kind: activeKind, id: item.id };
                event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
                event.dataTransfer.effectAllowed = 'copy';
                setPendingPayload(payload);
              }}
              onDragEnd={() => setPendingPayload(null)}
              onClick={() => onPlace(activeKind, item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onPlace(activeKind, item.id);
                }
              }}
              title={`${item.title} · ${fmtPrice(item.price)}`}
            >
              {item.installed && <span className="tag">已装</span>}
              <div className="t">{item.title}</div>
              <div className="s">
                {item.meta} · {fmtPrice(item.price)}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="palette-foot">
        {activeKind === 'gpu' && (
          <span>显存决定装不装得下，带宽决定跑得快不快</span>
        )}
        {activeKind === 'psu' && <span>电源要 ≥ 整机功耗 × 1.3，不是刚好够</span>}
        {activeKind === 'ram' && <span>内存建议 ≥ 权重的 1.5 倍</span>}
        {activeKind === 'mobo' && <span>卡槽数量决定能不能上多卡</span>}
        {activeKind === 'cooling' && <span>散热要看能压多少瓦，不只是看噪音</span>}
        {(activeKind === 'cpu' || activeKind === 'storage') && <span>点击部件直接装上</span>}
      </div>
    </div>
  );
}
