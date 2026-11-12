import type { Build, BuildStats, Catalog, GpuSpec } from './types.js';

/** 整机功耗的保守系数：电源不能只按 TDP 之和选 */
export const POWER_OVERHEAD_RATIO = 1.2;

export interface ElecOptions {
  hoursPerDay: number;
  pricePerKwh: number;
  daysPerMonth: number;
}

export const DEFAULT_ELEC: ElecOptions = {
  hoursPerDay: 8,
  pricePerKwh: 0.6,
  daysPerMonth: 30,
};

function pick<T extends { id: string }>(list: T[], id: string | null): T | null {
  if (!id) return null;
  return list.find((item) => item.id === id) ?? null;
}

/**
 * 把一套配置折算成「多少显存、多少内存、多大功耗、多少钱、多少电费」。
 * 纯函数，不依赖任何全局状态。
 */
export function buildStats(
  build: Build,
  catalog: Catalog,
  elec: ElecOptions = DEFAULT_ELEC,
): BuildStats {
  const gpus = build.gpuIds
    .map((id) => catalog.gpus.find((gpu) => gpu.id === id))
    .filter((gpu): gpu is GpuSpec => Boolean(gpu));

  const cpu = pick(catalog.cpus, build.cpuId);
  const mobo = pick(catalog.mobos, build.moboId);
  const rams = build.ramIds
    .map((id) => catalog.rams.find((ram) => ram.id === id))
    .filter((ram): ram is NonNullable<typeof ram> => Boolean(ram));
  const psu = pick(catalog.psus, build.psuId);
  const storages = build.storageIds
    .map((id) => catalog.storages.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const cooling = pick(catalog.coolings, build.coolingId);

  // 混插不同型号时，多卡并行只能按最小那张卡切分片
  const mixed = gpus.length > 1 && new Set(gpus.map((gpu) => gpu.id)).size > 1;
  const vramGb = mixed
    ? Math.min(...gpus.map((gpu) => gpu.vramGb)) * gpus.length
    : gpus.reduce((sum, gpu) => sum + gpu.vramGb, 0);

  const ramGb = rams.reduce((sum, ram) => sum + ram.capacityGb, 0);

  const tdpSum =
    gpus.reduce((sum, gpu) => sum + gpu.tdpW, 0) +
    (cpu?.tdpW ?? 0) +
    (mobo?.tdpW ?? 0) +
    rams.reduce((sum, ram) => sum + ram.tdpW, 0) +
    storages.reduce((sum, storage) => sum + storage.tdpW, 0);

  const powerW = Math.round(tdpSum * POWER_OVERHEAD_RATIO);

  const priceCny =
    gpus.reduce((sum, gpu) => sum + gpu.priceCny, 0) +
    (cpu?.priceCny ?? 0) +
    (mobo?.priceCny ?? 0) +
    rams.reduce((sum, ram) => sum + ram.priceCny, 0) +
    (psu?.priceCny ?? 0) +
    storages.reduce((sum, storage) => sum + storage.priceCny, 0) +
    (cooling?.priceCny ?? 0);

  const elecMonthlyCny =
    (powerW / 1000) * elec.hoursPerDay * elec.daysPerMonth * elec.pricePerKwh;

  return {
    gpus,
    cpu,
    mobo,
    rams,
    psu,
    storages,
    cooling,
    vramGb,
    ramGb,
    powerW,
    priceCny,
    elecMonthlyCny,
    mixed,
  };
}
