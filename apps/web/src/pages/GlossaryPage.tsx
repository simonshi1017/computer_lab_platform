import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { GLOSSARY_LIST, glossaryById, type GlossaryEntry } from '@clab/data';
import { Dialog } from '@/components/ui/Dialog';
import { Chip } from '@/components/ui/controls';
import { PAGE_BY_PATH } from '@/navigation';

const CATEGORIES: Array<GlossaryEntry['category'] | '全部'> = ['全部', '模型', '显存', '硬件', '部署'];

export function GlossaryPage() {
  const meta = PAGE_BY_PATH['/glossary'];
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('全部');

  // 术语弹窗状态放进 URL：命令面板搜索、正文内链都能直接定位到某一条
  const activeId = params.get('term');
  const setActiveId = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('term', id);
    else next.delete('term');
    setParams(next, { replace: true });
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY_LIST.filter((entry) => {
      if (category !== '全部' && entry.category !== category) return false;
      if (!q) return true;
      const haystack = [entry.term, entry.en, ...(entry.alias ?? []), entry.plain]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, category]);

  const active = activeId ? (glossaryById(activeId) ?? null) : null;

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{meta.title}</h1>
          <p className="page-sub">{meta.subtitle}</p>
        </div>
        <div className="relative w-full max-w-[280px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-3)' }}
          />
          <input
            className="input pl-8"
            placeholder="搜术语，中英文都行…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索术语"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map((item) => (
          <Chip key={item} active={category === item} onClick={() => setCategory(item)}>
            {item}
          </Chip>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <div className="text-[13.5px] font-semibold">没找到这个术语</div>
          <div className="mt-1.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
            试试英文缩写，比如 KV Cache、INT4、TDP。
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setActiveId(entry.id)}
              className="card entry-card p-4 text-left"
            >
              <div className="flex items-baseline gap-2">
                <span className="entry-title">{entry.term}</span>
                <span className="mono truncate text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                  {entry.en}
                </span>
              </div>
              <p className="entry-desc clamp-3 mt-2">{entry.plain}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="badge badge-mute">{entry.category}</span>
                {entry.alias?.slice(0, 2).map((alias) => (
                  <span key={alias} className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    {alias}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={Boolean(active)} onClose={() => setActiveId(null)} labelledBy="term-dialog-title">
        {active && (
          <>
            <div className="dialog-head">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 id="term-dialog-title" className="text-[18px] font-semibold tracking-[-0.02em]">
                    {active.term}
                  </h2>
                  <span className="mono text-[11.5px]" style={{ color: 'var(--text-3)' }}>
                    {active.en}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="badge badge-mute">{active.category}</span>
                  {active.alias?.map((alias) => (
                    <span key={alias} className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                      也叫 {alias}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="dialog-body">
              <div className="note note-info">
                <div className="mb-1 font-semibold" style={{ color: 'var(--accent-ink)' }}>
                  先用大白话说
                </div>
                <div className="text-[13px] leading-[1.75]">{active.plain}</div>
              </div>

              <div className="mt-3">
                <div className="field-label">专业解释</div>
                <p className="text-[12.5px] leading-[1.8]">{active.pro}</p>
              </div>

              <div className="note note-warn mt-3.5">
                <div className="mb-1 font-semibold" style={{ color: 'var(--warn-ink)' }}>
                  常见误区
                </div>
                {active.mistake}
              </div>

              {active.related.length > 0 && (
                <div className="mt-4">
                  <div className="field-label">相关术语</div>
                  <div className="flex flex-wrap gap-1.5">
                    {active.related.map((id) => {
                      const related = glossaryById(id);
                      if (!related) return null;
                      return (
                        <Chip key={id} active={false} onClick={() => setActiveId(id)}>
                          {related.term}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </Dialog>
    </section>
  );
}
