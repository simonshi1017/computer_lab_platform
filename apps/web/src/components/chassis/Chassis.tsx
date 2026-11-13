import { useCallback, useState } from 'react';
import type { Build } from '@clab/engine';
import {
  DATASET,
  type CoolingRecord,
  type CpuRecord,
  type GpuRecord,
  type MoboRecord,
  type PsuRecord,
  type RamRecord,
  type StorageRecord,
} from '@clab/data';
import type { PartKind } from '@/hooks/useBuild';
import { CaseShell } from './CaseShell';
import { Board } from './Board';
import { ChassisDefs } from './primitives';
import { CoolerSlot, CpuSlot, GpuSlot, PsuSlot, RamSlot, StorageSlot, type SlotHandlers } from './slots';
import { t } from '@/i18n';

/** 拖拽时塞进 dataTransfer 的自定义类型，避免把浏览器里的文字拖进来 */
export const DRAG_MIME = 'application/x-clab-part';

export interface DragPayload {
  kind: PartKind;
  id: string;
}

/**
 * 拖拽数据的进程内兜底。
 *
 * 少数环境（自动化、部分 Safari 版本）在 dragover/drop 阶段读不到
 * dataTransfer 的自定义 MIME，表现就是「拖了半天没反应」。
 * 这里同时存一份到模块变量，drop 时优先读 dataTransfer，读不到再用它。
 */
let pendingPayload: DragPayload | null = null;

export function setPendingPayload(payload: DragPayload | null): void {
  pendingPayload = payload;
}

function takePayload(event: React.DragEvent): DragPayload | null {
  const raw = event.dataTransfer.getData(DRAG_MIME);
  if (raw) {
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      /* 落到兜底 */
    }
  }
  return pendingPayload;
}

const byId = <T extends { id: string }>(list: T[], id: string | null): T | null =>
  id ? (list.find((item) => item.id === id) ?? null) : null;

interface ChassisProps {
  build: Build;
  /** 当前部件库选中的分类，用于高亮匹配的槽位 */
  activeKind: PartKind;
  onPlace: (kind: PartKind, id: string) => void;
  onRemove: (slot: string) => void;
  /** 点击空槽时把部件库切到对应分类 */
  onFocusKind: (kind: PartKind) => void;
}

/**
 * 机箱组装区。
 *
 * 三个输入通道：
 * 1. 桌面拖拽（HTML5 DnD，零依赖）
 * 2. 点击空槽 → 部件库切到对应分类 → 点击部件装上（移动端与键盘都靠这条）
 * 3. 拖错位置时明确拒绝并说明原因，不静默失败
 *
 * 没用 dnd-kit：它对此处的价值主要在触摸与键盘，而这两条已经由「点击通道」覆盖，
 * 引一个 12KB 的库去补 SVG 的事件适配不划算。
 */
export function Chassis({ build, activeKind, onPlace, onRemove, onFocusKind }: ChassisProps) {
  const [hovering, setHovering] = useState<string | null>(null);
  const [reject, setReject] = useState<{ slot: string; message: string } | null>(null);

  const showReject = useCallback((slot: string, message: string) => {
    setReject({ slot, message });
    window.setTimeout(() => setReject((current) => (current?.slot === slot ? null : current)), 2200);
  }, []);

  /** 生成某个槽位的事件处理器：kind 是它接受的部件类型 */
  const handlers = (slot: string, kind: PartKind, filled: boolean): SlotHandlers => ({
    hovering: hovering === slot,
    isTarget: activeKind === kind,
    // 键盘用户 Tab 到槽位后，Enter / 空格等价于点击
    tabIndex: 0,
    onKeyDown: (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (!filled) onFocusKind(kind);
    },
    onDragOver: (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (hovering !== slot) setHovering(slot);
    },
    onDragLeave: () => {
      setHovering((current) => (current === slot ? null : current));
    },
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      setHovering(null);

      const payload = takePayload(event);
      if (!payload) {
        showReject(slot, t("没读到这个部件，改用点击：先点空槽，再在左侧点部件"));
        return;
      }

      if (payload.kind !== kind) {
        showReject(slot, `这里放不了${kindLabel(payload.kind)}，应该放进${kindLabel(kind)}的位置`);
        return;
      }
      onPlace(kind, payload.id);
      setPendingPayload(null);
    },
    onClick: () => {
      if (filled) return;
      onFocusKind(kind);
    },
    onRemove: () => onRemove(slot),
  });

  const cpu = byId<CpuRecord>(DATASET.parts.cpus, build.cpuId);
  const mobo = byId<MoboRecord>(DATASET.parts.mobos, build.moboId);
  const psu = byId<PsuRecord>(DATASET.parts.psus, build.psuId);
  const cooling = byId<CoolingRecord>(DATASET.parts.coolings, build.coolingId);
  const rams = build.ramIds.map((id) => byId<RamRecord>(DATASET.parts.rams, id));
  const storages = build.storageIds.map((id) => byId<StorageRecord>(DATASET.parts.storages, id));
  const gpus = build.gpuIds
    .map((id) => byId<GpuRecord>(DATASET.gpus, id))
    .filter((gpu): gpu is GpuRecord => Boolean(gpu));

  const moboHandlers = handlers('mobo', 'mobo', Boolean(mobo));

  return (
    <div className="chassis">
      <svg
        className="chassis-svg"
        viewBox="0 0 680 620"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={t("开盖机箱示意图，可拖入或点击添加部件")}
      >
        <ChassisDefs />
        <CaseShell />

        <CoolerSlot part={cooling} {...handlers('cooling', 'cooling', Boolean(cooling))} />
        <Board
          mobo={mobo}
          hovering={moboHandlers.hovering}
          onDragOver={moboHandlers.onDragOver}
          onDragLeave={moboHandlers.onDragLeave}
          onDrop={moboHandlers.onDrop}
          onClick={moboHandlers.onClick}
          onRemove={moboHandlers.onRemove}
        />

        <CpuSlot part={cpu} {...handlers('cpu', 'cpu', Boolean(cpu))} />

        {[0, 1, 2, 3].map((index) => (
          <RamSlot
            key={`ram${index}`}
            index={index}
            part={rams[index] ?? null}
            {...handlers(`ram${index}`, 'ram', Boolean(rams[index]))}
          />
        ))}

        {[0, 1, 2, 3].map((index) => (
          <GpuSlot
            key={`gpu${index}`}
            index={index}
            part={gpus[index] ?? null}
            {...handlers(`gpu${index}`, 'gpu', Boolean(gpus[index]))}
          />
        ))}

        <PsuSlot part={psu} {...handlers('psu', 'psu', Boolean(psu))} />

        {[0, 1].map((index) => (
          <StorageSlot
            key={`storage${index}`}
            index={index}
            part={storages[index] ?? null}
            {...handlers(`storage${index}`, 'storage', Boolean(storages[index]))}
          />
        ))}

        {/* 走线槽 */}
        <path d="M536 108 V500" stroke="#1E2533" strokeWidth={3} strokeLinecap="round" />
      </svg>

      <div className="chassis-hint">
        {reject ? (
          <span style={{ color: 'var(--warn-ink)' }}>{reject.message}</span>
        ) : (
          <>
            {t("拖动左侧部件到对应槽位，或点击空槽再选件 · 悬停已装部件可移除 · 目标槽位会亮起")}
          </>
        )}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<PartKind, string> = {
  gpu: t("显卡"),
  cpu: 'CPU',
  mobo: t("主板"),
  ram: t("内存"),
  psu: t("电源"),
  storage: t("硬盘"),
  cooling: t("散热"),
};

function kindLabel(kind: PartKind): string {
  return KIND_LABEL[kind];
}
