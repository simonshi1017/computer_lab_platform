import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { PageMeta } from '@/navigation';
import { t } from '@/i18n';

/**
 * 未交付页面的占位。
 *
 * 做一个明确的「替代路径」：用户点进来是抱着某个目的的，
 * 告诉他「这里还没做」还不够，得同时给他一个现在就能用的去处。
 */
export function PlaceholderPage({ meta, embedded = false }: { meta: PageMeta; embedded?: boolean }) {
  const Icon = meta.icon;

  const content = (
    <>
      <div className="page-head">
        <div>
          <div className="badge badge-brand">{meta.milestone} {t("交付")}</div>
          <h1 className="page-title" style={{ marginTop: 12 }}>
            {t(meta.title)}
          </h1>
          <p className="page-sub">{t(meta.subtitle)}</p>
        </div>
        <div className="badge badge-mute">{t("还没做完")}</div>
      </div>

      <div className="card" style={{ padding: 26 }}>
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-[10px]"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
          >
            <Icon size={17} strokeWidth={1.7} />
          </span>
          <div>
            <div className="text-[13.5px] font-semibold">{t("这个页面将要做什么")}</div>
            <div className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>
              {t("以下能力在")} {meta.milestone} {t("里程碑交付")}
            </div>
          </div>
        </div>

        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {meta.points.map((point, index) => (
            <li
              key={t(point)}
              className="flex items-start gap-2.5 rounded-[10px] border p-3"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <span className="mono shrink-0 text-[10px]" style={{ color: 'var(--text-3)' }}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-[12.5px]" style={{ color: 'var(--text-2)' }}>
                {t(point)}
              </span>
            </li>
          ))}
        </ul>

        <div
          className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>
            {t("在做完之前，你可以先去：")}
          </span>
          <Link to="/models" className="btn btn-ghost btn-sm no-underline">
            {t("模型百科")}
            <ArrowRight size={12} />
          </Link>
          <Link to="/hardware" className="btn btn-ghost btn-sm no-underline">
            {t("硬件百科")}
            <ArrowRight size={12} />
          </Link>
          <Link to="/glossary" className="btn btn-ghost btn-sm no-underline">
            {t("概念词典")}
          </Link>
        </div>
      </div>
    </>
  );

  return embedded ? content : <section className="page">{content}</section>;
}
