import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { MODELS_LIST, modelById } from '@/data';
import { ModelCard } from '@/components/ModelCard';
import { ModelDialog } from '@/components/ModelDialog';
import { Chip } from '@/components/ui/controls';
import { PAGE_BY_PATH } from '@/navigation';
import { track } from '@/lib/track';
import { t } from '@/i18n';

type SizeFilter = 'all' | 'small' | 'mid' | 'large' | 'xl';

const SIZE_OPTIONS: Array<{ value: SizeFilter; label: string; min: number; max: number }> = [
  { value: 'all', label: t("全部尺寸"), min: 0, max: Infinity },
  { value: 'small', label: t("≤ 8B · 入门"), min: 0, max: 8 },
  { value: 'mid', label: t("9–20B · 均衡"), min: 8, max: 20 },
  { value: 'large', label: t("21–40B · 进阶"), min: 20, max: 40 },
  { value: 'xl', label: t("> 40B · 旗舰"), min: 40, max: Infinity },
];

const VENDORS = Array.from(new Set(MODELS_LIST.map((m) => m.vendor)));

export function ModelsPage() {
  const meta = PAGE_BY_PATH['/models'];
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [vendor, setVendor] = useState('all');
  const [size, setSize] = useState<SizeFilter>('all');

  const activeId = params.get('model');
  const activeModel = activeId ? modelById(activeId) ?? null : null;

  const openModel = (id: string) => {
    track('model_view', { modelId: id });
    const next = new URLSearchParams(params);
    next.set('model', id);
    setParams(next, { replace: true });
  };

  const closeModel = () => {
    const next = new URLSearchParams(params);
    next.delete('model');
    setParams(next, { replace: true });
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const range = SIZE_OPTIONS.find((option) => option.value === size) ?? SIZE_OPTIONS[0];

    return MODELS_LIST.filter((model) => {
      if (vendor !== 'all' && model.vendor !== vendor) return false;
      if (!(model.paramsB > range.min && model.paramsB <= range.max)) return false;
      if (!q) return true;
      return (
        model.cn.toLowerCase().includes(q) ||
        model.name.toLowerCase().includes(q) ||
        model.vendor.toLowerCase().includes(q) ||
        model.scenes.some((scene) => scene.includes(q))
      );
    }).sort((a, b) => a.paramsB - b.paramsB);
  }, [query, vendor, size]);

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(meta.title)}</h1>
          <p className="page-sub">{t(meta.subtitle)}</p>
        </div>
        <div className="relative w-full max-w-[280px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-3)' }}
          />
          <input
            className="input pl-8"
            placeholder={t("搜模型、厂商或场景…")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("搜索模型")}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {SIZE_OPTIONS.map((option) => (
          <Chip key={option.value} active={size === option.value} onClick={() => setSize(option.value)}>
            {option.label}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px" style={{ background: 'var(--border)' }} />
        <Chip active={vendor === 'all'} onClick={() => setVendor('all')}>
          {t("全部厂商")}
        </Chip>
        {VENDORS.map((item) => (
          <Chip key={item} active={vendor === item} onClick={() => setVendor(item)}>
            {item}
          </Chip>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <div className="text-[13.5px] font-semibold">{t("没有符合条件的模型")}</div>
          <div className="mt-1.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
            {t("换一个尺寸或厂商试试，也可以清空搜索词。")}
          </div>
          <button
            type="button"
            className="btn btn-ghost mt-4"
            onClick={() => {
              setQuery('');
              setVendor('all');
              setSize('all');
            }}
          >
            {t("清空筛选")}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((model) => (
            <ModelCard key={model.id} model={model} onOpen={openModel} />
          ))}
        </div>
      )}

      <p className="mt-5 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
        {t("共")} {list.length} {t("个模型 · 参数与层数来自官方模型卡；显存与速度为规则化估算值，实际以实测为准。")}
      </p>

      <ModelDialog model={activeModel} onClose={closeModel} />
    </section>
  );
}
