import { Link } from 'react-router-dom';
import { ArrowRight, Check, CircleDashed, Play } from 'lucide-react';
import { LESSONS_LIST } from '@/data';
import { useProgress } from '@/hooks/useProgress';
import { PAGE_BY_PATH } from '@/navigation';
import { t } from '@/i18n';

export function PathPage() {
  const meta = PAGE_BY_PATH['/path'];
  const { isDone, toggle, completed, total, ratio, currentLevel, reset } = useProgress();

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(meta.title)}</h1>
          <p className="page-sub">{t(meta.subtitle)}</p>
        </div>

        <div className="card min-w-[220px] px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px]" style={{ color: 'var(--text-2)' }}>
              {t("学习进度")}
            </span>
            <span className="mono text-[15px] font-bold">
              {completed}/{total}
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          <button
            type="button"
            className="text-[10.5px] underline-offset-2 hover:underline"
            style={{ color: 'var(--text-3)' }}
            onClick={reset}
          >
            {t("重置进度")}
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {LESSONS_LIST.map((lesson) => {
          const done = isDone(lesson.id);
          const current = !done && lesson.level === currentLevel;

          return (
            <div
              key={lesson.id}
              className="card px-4 py-4 transition-colors sm:px-5"
              style={{
                borderColor: current ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border)',
                background: current ? 'var(--accent-soft)' : 'var(--surface)',
              }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {/* 关卡序号 / 状态 */}
                <div
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] font-mono text-[13px] font-bold"
                  style={{
                    background: done
                      ? 'var(--grad-primary)'
                      : current
                        ? 'var(--surface)'
                        : 'var(--surface-2)',
                    color: done ? '#fff' : current ? 'var(--accent-ink)' : 'var(--text-3)',
                    border: current ? '1px solid color-mix(in srgb, var(--accent) 45%, transparent)' : '1px solid transparent',
                  }}
                >
                  {done ? <Check size={16} strokeWidth={2.6} /> : String(lesson.level).padStart(2, '0')}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{lesson.title}</h2>
                    {done && <span className="badge badge-good">{t("已完成")}</span>}
                    {current && <span className="badge badge-brand">{t("进行中")}</span>}
                    {!done && !current && (
                      <span className="badge badge-mute">
                        <CircleDashed size={10} />
                        {t("未开始")}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--text-2)' }}>
                    {lesson.question}
                  </p>

                  <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                    {lesson.points.map((point) => (
                      <li key={t(point)} className="flex gap-1.5 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                        <span style={{ color: 'var(--accent)' }}>·</span>
                        <span>{t(point)}</span>
                      </li>
                    ))}
                  </ul>

                  <div
                    className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-2.5 text-[11px]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span style={{ color: 'var(--text-3)' }}>{t("本关输出物")}</span>
                    <span style={{ color: 'var(--text)' }}>{lesson.output}</span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {lesson.links.map((link) => (
                      <Link key={link.to} to={link.to} className="chip no-underline">
                        {link.label}
                        <ArrowRight size={11} />
                      </Link>
                    ))}
                    <button
                      type="button"
                      // 只有当前关用主按钮：五关都长一样会失去「下一步在哪」的指引
                      className={done || !current ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
                      onClick={() => toggle(lesson.id)}
                    >
                      {done ? (
                        t("标记为未完成")
                      ) : (
                        <>
                          <Play size={12} />
                          {t("我学会了")}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
        {t("进度保存在本机浏览器，换设备不会同步（接账号后才会）。每关的「我学会了」是自评，不作为考核。")}
      </p>
    </section>
  );
}
