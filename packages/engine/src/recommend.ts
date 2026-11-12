import { clamp } from './math.js';
import type {
  Catalog,
  CoolingSpec,
  CpuSpec,
  GpuSpec,
  MoboSpec,
  PsuSpec,
  RamSpec,
  RecommendInput,
  Recommendation,
  Tier,
  TierBuild,
  VramBreakdown,
} from './types.js';
import { estimateTps } from './tps.js';
import { vramNeed } from './vram.js';

/** 单卡最多插几张（受机箱与主板限制） */
export const MAX_GPU_PER_BUILD = 4;
/** 显存至少要留这么多余量，否则判为不可行 */
export const MIN_VRAM_HEADROOM = 0.08;
/** 电源必须能覆盖的底线（毫安式保守估计之外的硬性检查） */
export const PSU_HARD_LIMIT = 1.05;

/**
 * 性价比打分：能力 / 价格^0.62，对「显存严重过配」和「AMD 生态折价」扣分。
 * 幂次 < 1 是为了让「贵一倍但快 60%」的配置仍然有竞争力。
 */
export function valueScore(build: TierBuild): number {
  const waste = Math.max(0, build.headroom - 0.45);
  const cap = 1 - Math.min(waste, 0.45) * 1.2;
  const eco = build.gpu.vendor === 'AMD' ? 0.85 : 1;
  return (build.effectiveTps / Math.pow(build.priceCny / 1000, 0.62)) * Math.max(cap, 0.35) * eco;
}

function cheapest<T extends { priceCny: number }>(list: T[]): T | undefined {
  return [...list].sort((a, b) => a.priceCny - b.priceCny)[0];
}

/** 按目标容量挑内存条，最多插 maxSticks 条 */
function pickRams(targetGb: number, maxSticks: number, catalog: Catalog): RamSpec[] {
  const sizes = [...catalog.rams].sort((a, b) => b.capacityGb - a.capacityGb);
  if (sizes.length === 0) return [];

  const out: RamSpec[] = [];
  let left = targetGb;
  while (left > 0 && out.length < maxSticks) {
    const pick = sizes.find((ram) => ram.capacityGb <= left) ?? sizes[sizes.length - 1];
    out.push(pick);
    left -= pick.capacityGb;
  }
  return out;
}

function pickStorage(weightsGb: number, catalog: Catalog) {
  const requiredTb = weightsGb > 30 ? 4 : weightsGb > 12 ? 2 : 1;
  const sorted = [...catalog.storages].sort((a, b) => a.capacityTb - b.capacityTb);
  return sorted.find((s) => s.capacityTb >= requiredTb) ?? sorted[sorted.length - 1];
}

function pickCooling(requiredW: number, catalog: Catalog): CoolingSpec | undefined {
  const sorted = [...catalog.coolings].sort((a, b) => a.priceCny - b.priceCny);
  return sorted.find((c) => c.capacityW >= requiredW) ?? sorted[sorted.length - 1];
}

function pickPsu(requiredW: number, catalog: Catalog): PsuSpec | undefined {
  const sorted = [...catalog.psus].sort((a, b) => a.watt - b.watt);
  return sorted.find((psu) => psu.watt >= requiredW) ?? sorted[sorted.length - 1];
}

/**
 * 给定「一张卡 + 插几张」，能不能拼出一套可行配置。
 * 不满足硬性条件（显存放不下、电源带不动、主板插不下）直接返回 null。
 */
function makeTierBuild(
  gpu: GpuSpec,
  count: number,
  input: RecommendInput,
  need: VramBreakdown,
): TierBuild | null {
  const { catalog } = input;
  const vramGb = gpu.vramGb * count;
  if (need.total > vramGb * (1 - MIN_VRAM_HEADROOM)) return null;

  // 卡越多 / 单卡越热，越需要一颗不拖后腿的 CPU
  const cpuMinTdp = count >= 3 ? 150 : count === 2 || gpu.tdpW >= 350 ? 150 : 65;

  /*
   * CPU 与主板必须同插槽，否则这套配置根本点不亮。
   * 所以要按「CPU 价格从低到高」找第一个有匹配主板可用的组合，
   * 而不是各自独立取最便宜——那正是会配出「Ryzen 插 B760」的原因。
   */
  let pair: { cpu: CpuSpec; mobo: MoboSpec } | null = null;
  const cpuCandidates = [...catalog.cpus]
    .filter((c) => c.tdpW >= cpuMinTdp)
    .sort((a, b) => a.priceCny - b.priceCny);

  for (const cpu of cpuCandidates) {
    const mobo = cheapest(
      catalog.mobos.filter((m) => m.gpuSlots >= count && m.socket === cpu.socket),
    );
    if (mobo) {
      pair = { cpu, mobo };
      break;
    }
  }
  if (!pair) return null;

  const { cpu, mobo } = pair;

  const ramTarget = Math.max(32, Math.ceil((need.weights * 1.5) / 32) * 32);
  const rams = pickRams(ramTarget, Math.min(4, mobo.ramSlots), catalog);
  if (rams.length === 0) return null;

  const storage = pickStorage(need.weights, catalog);
  if (!storage) return null;

  const cooling = pickCooling(gpu.tdpW * count, catalog);
  if (!cooling) return null;

  const ramTdp = rams.reduce((sum, ram) => sum + ram.tdpW, 0);
  const powerW = Math.round(
    (gpu.tdpW * count + cpu.tdpW + mobo.tdpW + ramTdp + storage.tdpW) * 1.2,
  );

  const psu = pickPsu(powerW * 1.3, catalog);
  if (!psu) return null;
  // 电源真带不动就淘汰，不给「理论可行、开机跳闸」的方案
  if (psu.watt < powerW * PSU_HARD_LIMIT) return null;

  const priceCny =
    gpu.priceCny * count +
    cpu.priceCny +
    mobo.priceCny +
    rams.reduce((sum, ram) => sum + ram.priceCny, 0) +
    psu.priceCny +
    storage.priceCny +
    cooling.priceCny;

  const tps = estimateTps(
    input.model,
    Array.from({ length: count }, () => gpu),
    input.quant,
    input.ctx,
  );
  // AMD 走 ROCm，纸面带宽要打折，否则会推荐出「看起来很美」的 AMD 四卡
  const effectiveTps = Math.round(tps * (gpu.vendor === 'AMD' ? 0.9 : 1));

  return {
    key: `${gpu.id}-${count}`,
    gpu,
    gpuCount: count,
    cpu,
    mobo,
    ramIds: rams.map((ram) => ram.id),
    rams,
    psu,
    storage,
    cooling,
    vramGb,
    headroom: (vramGb - need.total) / vramGb,
    powerW,
    priceCny,
    tps,
    effectiveTps,
  };
}

/**
 * 从「要跑什么模型」反推三档硬件配置。
 * 所有候选都经过硬性可行性过滤，不够三档时如返回 limited=true，由 UI 解释原因。
 */
export function recommend(input: RecommendInput): Recommendation {
  const need = vramNeed(input.model, input.quant, input.ctx);

  const all: TierBuild[] = [];
  for (const gpu of input.catalog.gpus) {
    for (let count = 1; count <= MAX_GPU_PER_BUILD; count++) {
      const candidate = makeTierBuild(gpu, count, input, need);
      if (candidate) all.push(candidate);
    }
  }
  if (all.length === 0) return { tiers: [], need, limited: true };

  const { budget, pref } = input;

  // 只考虑预算 2.2 倍以内的方案；可行方案太少时放开限制，保证三档不重复
  const withinBudget = all.filter((b) => b.priceCny <= budget * 2.2);
  const pool = withinBudget.length >= 3 ? withinBudget : all;

  const byPrice = [...pool].sort((a, b) => a.priceCny - b.priceCny);
  const used = new Set<string>();
  const take = (list: TierBuild[]): TierBuild | null => {
    const hit = list.find((item) => !used.has(item.key));
    if (hit) used.add(hit.key);
    return hit ?? null;
  };

  // 省钱：最便宜；两卡以内只贵 8% 时优先少卡
  const rawCheap = byPrice[0];
  const simple = byPrice.filter(
    (b) => b.gpuCount <= 2 && b.priceCny <= rawCheap.priceCny * 1.08,
  );
  const save = take(simple.length > 0 ? simple : byPrice) ?? rawCheap;

  // 均衡：预算 1.3 倍内、余量合理的性价比最高者
  const inBudget = pool.filter(
    (b) => b.priceCny <= budget * 1.3 && b.headroom >= 0.12 && b.headroom <= 0.75,
  );
  const fallbackPool = pool.filter((b) => b.headroom >= 0.12);
  const valueSorted = [...(inBudget.length > 0 ? inBudget : fallbackPool)].sort(
    (a, b) => valueScore(b) - valueScore(a),
  );

  let balance = take(valueSorted);
  let balanceName = '均衡推荐版';
  let balanceDesc = '性能够用、价格合理，多数人闭眼选';
  if (!balance) {
    const rest = byPrice.filter((b) => !used.has(b.key));
    if (rest.length > 0) {
      balance = rest[0];
      used.add(balance.key);
      balanceName = '加钱提速版';
      balanceDesc = '这个预算内没有更好的均衡解，加预算换速度';
    } else {
      balance = byPrice[0];
    }
  }

  // 性能：预算 1.6 倍内最快，且必须真的比均衡档快 5% 以上。
  //
  // 上限之所以不用 2.2 倍：用户给了 2 万预算，推一套 3.6 万的方案等于没听懂需求。
  // 同时排除显存余量 > 75% 的配置——那是「买了 72G 显存跑 12G 的模型」，
  // 速度快但没有意义，属于用钱堆出来的假性能。
  //
  // 上限由「预算 × 1.6」决定，而不是被省钱档的价格反压——省钱档够便宜时，
  // save×2.6 会把上限压到比预算还低，结果连「加 10% 换个更快的卡」都被排除。
  // 外层再用 budget×2.2 兜底，避免预算填得极小时推出天价方案。
  const perfCap = Math.min(budget * 2.2, Math.max(budget * 1.6, save.priceCny * 2));
  const perfPool = pool.filter(
    (b) =>
      b.priceCny <= perfCap &&
      b.headroom <= 0.75 &&
      b.effectiveTps >= balance.effectiveTps * 1.05,
  );
  const perf = take(
    [...perfPool].sort(
      (a, b) => b.effectiveTps - a.effectiveTps || a.priceCny - b.priceCny,
    ),
  );

  const quietPool = pool.filter((b) => b.cooling.noiseDb <= 36);
  const quiet = [...(quietPool.length > 0 ? quietPool : pool)].sort(
    (a, b) => valueScore(b) - valueScore(a),
  )[0];

  const mid: Tier =
    pref === 'quiet' && quiet
      ? { ...quiet, name: '静音优先版', desc: '水冷 + 低功耗卡，长时间开着不吵', picked: false }
      : { ...balance, name: balanceName, desc: balanceDesc, picked: false };

  const tiers: Tier[] = [];
  const seen = new Set<string>();
  const push = (build: TierBuild | null, name: string, desc: string) => {
    if (!build || seen.has(build.key)) return;
    seen.add(build.key);
    tiers.push({ ...build, name, desc, picked: false });
  };

  push(save, '省钱入门版', '刚好跑得动，先把模型点起来');
  push(mid, mid.name, mid.desc);
  push(perf, '性能进阶版', '速度快、留足余量，长期主力');

  const prefPick =
    pref === 'save' ? save : pref === 'perf' ? perf : pref === 'quiet' ? quiet : balance;
  const target = prefPick ?? balance;
  tiers.forEach((tier) => {
    tier.picked = tier.key === target.key;
  });
  if (!tiers.some((tier) => tier.picked) && tiers.length > 0) tiers[0].picked = true;

  return { tiers, need, limited: tiers.length < 3 };
}

/** 判断某个配置是否满足硬性可行性（供 UI 在拖拽时即时校验） */
export function isFeasible(need: VramBreakdown, vramGb: number): boolean {
  return need.total <= vramGb * (1 - MIN_VRAM_HEADROOM);
}

export function headroomOf(need: VramBreakdown, vramGb: number): number {
  if (vramGb <= 0) return -1;
  return clamp((vramGb - need.total) / vramGb, -10, 1);
}
