import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Boxes, Cpu, type LucideIcon } from 'lucide-react';
import { GLOSSARY_LIST, GPUS_LIST, MODELS_LIST } from '@/data';
import { PAGE_META } from '@/navigation';
import { t } from '@/i18n';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface Item {
  key: string;
  label: string;
  hint: string;
  group: string;
  to: string;
  icon: LucideIcon;
  /** 参与匹配但不显示的额外关键词 */
  keywords?: string;
}

/**
 * 命令面板。
 *
 * 不只搜页面：模型、显卡、术语才是用户真正的搜索目标，
 * 只能搜到「模型百科」这一层等于没搜。命中后直接带参数跳到详情。
 */
function buildIndex(): Item[] {
  const pages: Item[] = PAGE_META.map((page) => ({
    key: `page:${page.path}`,
    label: t(page.label),
    hint: t(page.subtitle),
    group: '页面' /* i18n-key */,
    to: page.path,
    icon: page.icon,
    keywords: t(page.title),
  }));

  const models: Item[] = MODELS_LIST.map((model) => ({
    key: `model:${model.id}`,
    label: model.cn,
    hint: `${model.vendor} · ${model.paramsB}B · ${model.scenes[0]}`,
    group: '模型' /* i18n-key */,
    to: `/models?model=${model.id}`,
    icon: Boxes,
    keywords: [model.name, model.vendor, ...model.scenes].join(' '),
  }));

  const gpus: Item[] = GPUS_LIST.map((gpu) => ({
    key: `gpu:${gpu.id}`,
    label: gpu.name,
    hint: `${gpu.vendor} · ${gpu.vramGb}G · ${gpu.bandwidth}GB/s`,
    group: '显卡' /* i18n-key */,
    to: `/hardware?gpu=${gpu.id}`,
    icon: Cpu,
    keywords: [gpu.arch, t(gpu.gpuClass), gpu.vendor].join(' '),
  }));

  const terms: Item[] = GLOSSARY_LIST.map((entry) => ({
    key: `term:${entry.id}`,
    label: entry.term,
    hint: entry.en,
    group: '术语' /* i18n-key */,
    to: `/glossary?term=${entry.id}`,
    icon: BookOpen,
    keywords: [entry.en, ...(entry.alias ?? [])].join(' '),
  }));

  return [...pages, ...models, ...gpus, ...terms];
}

const INDEX = buildIndex();
/** 每组最多显示几条，否则搜一个「7」会刷满屏 */
const PER_GROUP_LIMIT = 5;

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // 空查询只给页面入口，别一次性甩出 50 条
      return INDEX.filter((item) => item.group === '页面');
    }

    const matched = INDEX.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.hint.toLowerCase().includes(q) ||
        (item.keywords ?? '').toLowerCase().includes(q),
    );

    const grouped = new Map<string, Item[]>();
    for (const item of matched) {
      const bucket = grouped.get(item.group) ?? [];
      if (bucket.length < PER_GROUP_LIMIT) bucket.push(item);
      grouped.set(item.group, bucket);
    }
    return Array.from(grouped.values()).flat();
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  return (
    <div className="palette-mask" role="presentation" onClick={onClose}>
      <div className="palette-box" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          placeholder={t("搜页面、模型、显卡或术语…")}
          aria-label={t("全局搜索")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              const target = results[active];
              if (target) go(target.to);
            }
          }}
        />
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 6 }}>
          {results.length === 0 ? (
            <div className="palette-empty">{t("没有匹配结果，试试「显存」「3090」「量化」")}</div>
          ) : (
            results.map((item, index) => {
              const Icon = item.icon;
              const showGroup = index === 0 || results[index - 1].group !== item.group;
              return (
                <div key={item.key}>
                  {showGroup && (
                    <div
                      className="px-2 pb-1 pt-2 text-[9.5px] uppercase tracking-[0.1em]"
                      style={{ color: 'var(--text-3)' }}
                    >
                      {t(item.group)}
                    </div>
                  )}
                  <button
                    type="button"
                    className="palette-item"
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item.to)}
                  >
                    <Icon size={15} strokeWidth={1.7} />
                    <span className="shrink-0">{item.label}</span>
                    <span className="ml-auto min-w-0 truncate pl-3 text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                      {item.hint}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
