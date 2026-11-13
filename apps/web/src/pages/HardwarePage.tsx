import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DATASET, GPUS_LIST, gpuById, type GpuRecord } from '@/data';
import { GpuCard } from '@/components/GpuCard';
import { GpuDialog } from '@/components/GpuDialog';
import { Chip, SectionTitle } from '@/components/ui/controls';
import { PAGE_BY_PATH } from '@/navigation';
import { fmtPrice } from '@/lib/format';
import { usePrices } from '@/hooks/usePrices';
import { track } from '@/lib/track';
import { t, tf } from '@/i18n';

type ClassFilter = 'all' | GpuRecord['gpuClass'];

const CLASS_OPTIONS: Array<{ value: ClassFilter; label: string }> = [
  { value: 'all', label: t("全部类别") },
  { value: '消费级', label: t("消费级") }, /* i18n-key */
  { value: '专业卡', label: t("专业卡") }, /* i18n-key */
  { value: '数据中心', label: t("数据中心") }, /* i18n-key */
];

const VENDOR_OPTIONS = ['NVIDIA', 'AMD'] as const;

/**
 * 配件表。
 *
 * 行数据在模块顶层算好：既避免在渲染里做联合类型窄化，也让「关键指标」
 * 的格式化与数据定义放在一起，改字段时不容易漏。
 */
const PART_GROUPS = [
  {
    key: 'cpus',
    title: t("CPU 处理器"),
    rows: DATASET.parts.cpus.map((item) => ({
      id: item.id,
      name: item.name,
      metric: `${item.cores} · ${item.tdpW}W`,
      price: item.priceCny,
    })),
    risk: t("太弱会让模型加载和数据处理拖后腿，但不影响生成速度"),
  },
  {
    key: 'mobos',
    title: t("主板"),
    rows: DATASET.parts.mobos.map((item) => ({
      id: item.id,
      name: item.name,
      metric: tf('{c} · {s} 卡槽 · {r} 内存槽', { c: item.chipset, s: item.gpuSlots, r: item.ramSlots }),
      price: item.priceCny,
    })),
    risk: t("卡槽不够就插不了第二张卡，这是多卡方案的硬门槛"),
  },
  {
    key: 'rams',
    title: t("内存"),
    rows: DATASET.parts.rams.map((item) => ({
      id: item.id,
      name: item.name,
      metric: `${item.capacityGb}GB · ${item.kind}`,
      price: item.priceCny,
    })),
    risk: t("小于模型权重的 1.5 倍时，加载会变慢甚至失败"),
  },
  {
    key: 'psus',
    title: t("电源"),
    rows: DATASET.parts.psus.map((item) => ({
      id: item.id,
      name: item.name,
      metric: `${item.watt}W · ${item.level}`,
      price: item.priceCny,
    })),
    risk: t("功率不足会在大负载时直接关机重启，不是降速能解决的"),
  },
  {
    key: 'storages',
    title: t("存储"),
    rows: DATASET.parts.storages.map((item) => ({
      id: item.id,
      name: item.name,
      metric: `${item.capacityTb}TB · ${item.kind}`,
      price: item.priceCny,
    })),
    risk: t("模型动辄几十 GB，硬盘不够就只能反复删模型"),
  },
  {
    key: 'coolings',
    title: t("散热"),
    rows: DATASET.parts.coolings.map((item) => ({
      id: item.id,
      name: item.name,
      metric: tf('可压 {w}W · {d}dB', { w: item.capacityW, d: item.noiseDb }),
      price: item.priceCny,
    })),
    risk: t("压不住热量会降频，等于花钱买了张更慢的卡"),
  },
];

export function HardwarePage() {
  const meta = PAGE_BY_PATH['/hardware'];
  const [params, setParams] = useSearchParams();
  const [gpuClass, setGpuClass] = useState<ClassFilter>('all');
  const [vendor, setVendor] = useState<string>('all');

  const activeId = params.get('gpu');
  const activeGpu = activeId ? gpuById(activeId) ?? null : null;

  const openGpu = (id: string) => {
    track('gpu_view', { gpuId: id });
    const next = new URLSearchParams(params);
    next.set('gpu', id);
    setParams(next, { replace: true });
  };

  const closeGpu = () => {
    const next = new URLSearchParams(params);
    next.delete('gpu');
    setParams(next, { replace: true });
  };

  // 排序要吃最新价：价格更新后「便宜的排前面」不能还按旧数据算
  const prices = usePrices();
  const list = useMemo(() => {
    const priceOf = (id: string, fallback: number) => prices?.get(id)?.priceCny ?? fallback;
    return GPUS_LIST.filter((gpu) => {
      if (gpuClass !== 'all' && gpu.gpuClass !== gpuClass) return false;
      if (vendor !== 'all' && gpu.vendor !== vendor) return false;
      return true;
    }).sort(
      (a, b) =>
        a.vramGb - b.vramGb ||
        priceOf(a.id, a.priceCny) - priceOf(b.id, b.priceCny),
    );
  }, [gpuClass, vendor, prices]);

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(meta.title)}</h1>
          <p className="page-sub">{t(meta.subtitle)}</p>
        </div>
        <div className="note note-info max-w-[300px] text-[11.5px]">
          {t("显存决定「装不装得下」，带宽决定「跑得快不快」。这两件事不要混。")}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {CLASS_OPTIONS.map((option) => (
          <Chip key={option.value} active={gpuClass === option.value} onClick={() => setGpuClass(option.value)}>
            {option.label}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px" style={{ background: 'var(--border)' }} />
        <Chip active={vendor === 'all'} onClick={() => setVendor('all')}>
          {t("全部品牌")}
        </Chip>
        {VENDOR_OPTIONS.map((item) => (
          <Chip key={item} active={vendor === item} onClick={() => setVendor(item)}>
            {item}
          </Chip>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card px-6 py-10 text-center text-[12.5px]" style={{ color: 'var(--text-2)' }}>
          {t("这个组合下没有显卡，换一个类别试试。")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((gpu) => (
            <GpuCard key={gpu.id} gpu={gpu} onOpen={openGpu} />
          ))}
        </div>
      )}

      <div className="mt-8">
        <SectionTitle extra={<span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{t("显卡之外，这五类也决定成败")}</span>}>
          {t("其他部件")}
        </SectionTitle>

        <div className="grid gap-3 lg:grid-cols-2">
          {PART_GROUPS.map((group) => {
            return (
              <div key={group.key} className="card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[13px] font-semibold">{group.title}</div>
                  <div className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                    {group.rows.length} {t("款")}
                  </div>
                </div>
                <div className="mt-2.5 space-y-0.5">
                  {group.rows.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-baseline gap-2 border-t py-1.5 text-[11.5px] first:border-t-0"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="mono shrink-0 text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                        {item.metric}
                      </span>
                      <span className="mono w-14 shrink-0 text-right font-semibold">{fmtPrice(item.price)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 text-[10.5px] leading-relaxed" style={{ color: 'var(--warn-ink)' }}>
                  {t("选错的后果：")}{group.risk}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
        {t("显卡规格来自厂商官网，价格为 2026 年国内市场估算值，会随行情变化。所有「能跑 / 临界」判断均按 INT4 · 8K 上下文估算，实际以实测为准。数据更新时间：")}{DATASET.updatedAt}。
      </p>

      <GpuDialog gpu={activeGpu} onClose={closeGpu} />
    </section>
  );
}
