import type { Build, BuildStats, Catalog, VramBreakdown } from './types.js';

/** 换一个「刚好带得动」的电源（功耗 × 1.3 向上取整到 50W 档） */
export function withAutoPsu(build: Build, stats: BuildStats, catalog: Catalog): Build {
  const required = stats.powerW * 1.3;
  const sorted = [...catalog.psus].sort((a, b) => a.watt - b.watt);
  const fit = sorted.find((psu) => psu.watt >= required) ?? sorted[sorted.length - 1];
  return fit ? { ...build, psuId: fit.id } : build;
}

/** 加一条内存，直到覆盖「权重的 1.5 倍」 */
export function withAutoRam(
  build: Build,
  stats: BuildStats,
  need: VramBreakdown,
  catalog: Catalog,
): Build {
  const target = need.weights * 1.5;
  if (stats.ramGb >= target) return build;

  const maxSticks = stats.mobo?.ramSlots ?? 4;
  if (build.ramIds.length >= maxSticks) return build;

  const sorted = [...catalog.rams].sort((a, b) => a.capacityGb - b.capacityGb);
  const next = sorted.find((ram) => stats.ramGb + ram.capacityGb >= target) ?? sorted[sorted.length - 1];
  return next ? { ...build, ramIds: [...build.ramIds, next.id] } : build;
}
