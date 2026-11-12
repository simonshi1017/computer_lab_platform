import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Catalog, GpuSpec } from '@clab/engine';
import { CATALOG } from '@clab/data';
import { api } from '@/lib/api';

/**
 * 运行时价格。
 *
 * 为什么需要它：内置目录里的价格是构建时写死的，只能写「参考价 ¥15,000」。
 * 产品承诺是「所有估算值可追溯」，那就必须能说出「哪天的价、哪来的」。
 *
 * 三条约束：
 * 1. **失败不影响使用**：后端不可达就退回内置价，卡片照常渲染（静态站的
 *    体验不能被账号体系拖累）。
 * 2. **只请求一次**：16 张卡几十字节，在模块级缓存 + 全局订阅，
 *    不让 16 个卡片各发一次请求。
 * 3. **替换的是价格，不是目录**：显卡的其他规格仍来自内置数据，
 *    避免「接口少一个字段就让页面塌掉」。
 */

export interface PriceInfo {
  gpuId: string;
  priceCny: number;
  channel: string;
  source: string | null;
  capturedAt: string | null;
  ageDays: number | null;
  /** 超过阈值没更新：界面上标黄提示 */
  stale: boolean;
  /** 内置目录的估算价（非真实采集），文案要说「参考价」而不是「采集于」 */
  estimated: boolean;
}

type PriceTable = Map<string, PriceInfo>;

let table: PriceTable | null = null;
let loading: Promise<PriceTable | null> | null = null;
let failed = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): PriceTable | null {
  return table;
}

/** 主动刷新（导入新价后 admin 页面用得到） */
export function reloadPrices(): Promise<PriceTable | null> {
  loading = null;
  failed = false;
  return ensurePrices();
}

export async function ensurePrices(): Promise<PriceTable | null> {
  if (table) return table;
  if (loading) return loading;

  loading = (async () => {
    try {
      const rows = await api<PriceInfo[]>('/prices/latest');
      const next: PriceTable = new Map();
      for (const row of rows) next.set(row.gpuId, row);
      table = next;
      emit();
      return next;
    } catch {
      // 后端没起 / 网络断了：标记失败但不再重试，避免每次渲染都打一个失败请求
      failed = true;
      return null;
    }
  })();

  return loading;
}

export function usePrices(): PriceTable | null {
  const prices = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (!prices && !failed) void ensurePrices();
  }, [prices]);

  return prices;
}

/**
 * 把最新价合进目录，供 engine 计算。
 *
 * 必须让**计算也吃新价**：如果只在卡片上显示新价、组装台总价还用内置价，
 * 同一张卡在站内会出现两个价格——这比不更新更糟。
 */
export function useRuntimeCatalog(): Catalog {
  const prices = usePrices();
  return useMemo(() => {
    if (!prices || prices.size === 0) return CATALOG;
    return {
      ...CATALOG,
      gpus: CATALOG.gpus.map((gpu: GpuSpec) => {
        const info = prices.get(gpu.id);
        return info ? { ...gpu, priceCny: info.priceCny } : gpu;
      }),
    };
  }, [prices]);
}

/** 单个部件的价格（组装台算清单用） */
export function usePriceOf(): (gpuId: string) => PriceInfo | undefined {
  const prices = usePrices();
  return (gpuId: string) => prices?.get(gpuId);
}

const CHANNEL_LABEL: Record<string, string> = {
  jd: '京东',
  tmall: '天猫',
  taobao: '淘宝',
  offline: '线下',
  quote: '报价单',
  manual: '人工录入',
  catalog: '目录估算',
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel;
}

/**
 * 一行「来源 + 时间」文案。
 *
 * 三种状态必须说清，不能糊成一句「参考价」：
 * - 真实采集：京东 · 1 天前
 * - 采集偏旧：京东 · 68 天前（标黄）
 * - 内置估算：目录估算价（无时间）
 */
export function priceProvenance(info: PriceInfo | undefined): { text: string; stale: boolean } {
  if (!info) return { text: '', stale: false };

  if (info.estimated) {
    return { text: '目录估算价 · 无采集时间', stale: true };
  }

  const channel = channelLabel(info.channel);
  if (info.ageDays === null) {
    return { text: `${channel} · 时间未知`, stale: true };
  }
  if (info.ageDays < 1) {
    return { text: `${channel} · 今天`, stale: info.stale };
  }
  return { text: `${channel} · ${Math.round(info.ageDays)} 天前`, stale: info.stale };
}
