import { Link } from 'react-router-dom';
import { ArrowRight, Boxes, Check, Cpu, FlaskConical, MonitorPlay, Route, Sparkles, Wrench } from 'lucide-react';
import { GPUS_LIST, LESSONS_LIST, MODELS_LIST } from '@/data';
import { useProgress } from '@/hooks/useProgress';
import { t, tf } from '@/i18n';

const FEATURES = [
  {
    icon: Route,
    title: t("五关学习路径"),
    desc: t("从参数量讲到部署实战，每关都要留下一个输出物。"),
    to: '/path',
  },
  {
    icon: Boxes,
    title: t("模型与硬件百科"),
    desc: tf('{m} 个模型、{g} 张显卡，含厂商、场景、擅长与短板。', { m: MODELS_LIST.length, g: GPUS_LIST.length }),
    to: '/models',
  },
  {
    icon: Wrench,
    title: t("DIY 组装台"),
    desc: t("在实体机箱里装一台机器，实时看到显存、功耗、六维评分与改进建议。"),
    to: '/builder',
  },
  {
    icon: FlaskConical,
    title: t("场景实验室"),
    desc: t("选一个真实场景，一键载入配置，跟着任务卡把实验做完。"),
    to: '/scenarios',
  },
];

const TODAY = [
  {
    icon: Sparkles,
    title: t("我要部署一个 27B 模型，该买什么？"),
    desc: t("输入模型与预算，直接给出三档可落地的装机方案"),
    to: '/recommend',
  },
  {
    icon: MonitorPlay,
    title: t("为什么 2.4T 模型要一整个机柜？"),
    desc: t("看一遍权重 + KV Cache + 余量的完整拆解"),
    to: '/models?model=qwen38-max',
  },
  {
    icon: Cpu,
    title: t("显存 24G 和带宽 1008GB/s，哪个更重要？"),
    desc: t("容量决定装不装得下，带宽决定跑得快不快"),
    to: '/hardware',
  },
];

export function HomePage() {
  const { isDone, completed, total, ratio, currentLevel } = useProgress();

  return (
    <section className="page">
      <div className="card relative overflow-hidden px-5 py-6 sm:px-8 sm:py-9">
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-[320px] w-[320px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(79,111,255,.2), transparent 68%)' }}
        />
        <div className="badge badge-brand">{t("v1.0 · 可直接上线")}</div>

        <h1 className="mt-4 text-[25px] font-bold leading-[1.2] tracking-[-0.03em] sm:text-[38px] sm:leading-[1.14] sm:tracking-[-0.035em]">
          {t("把「跑大模型」这件事，")}
          <span
            className="bg-[image:var(--grad-primary)] bg-clip-text text-transparent"
            style={{ WebkitBackgroundClip: 'text' }}
          >
            {t("拆开给你看")}
          </span>
        </h1>

        <p className="mt-3 max-w-[540px] text-[12.5px] leading-relaxed sm:mt-3.5 sm:text-[13.5px]" style={{ color: 'var(--text-2)' }}>
          {t("不用懂硬件，不用背公式。从「什么是参数」开始，亲手拖出一台能跑模型的服务器， 再让它告诉你行不行、快不快、贵不贵。")}
        </p>

        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link to="/builder" className="btn btn-primary">
            {t("开始组装我的服务器")}
            <ArrowRight size={15} />
          </Link>
          <Link to="/models" className="btn btn-ghost">
            {t("先看看有哪些模型")}
          </Link>
        </div>
      </div>

      {/* ---------------- 知识地图 ---------------- */}
      <div className="card mt-4 px-5 py-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[14px] font-semibold">{t("你的算力知识地图")}</div>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
            <span className="mono">
              {completed}/{total}
            </span>
            <span>{t("关已完成")}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {LESSONS_LIST.map((lesson, index) => {
            const done = isDone(lesson.id);
            const current = !done && lesson.level === currentLevel;

            return (
              <div key={lesson.id} className="relative flex flex-col items-center px-1 text-center">
                {index > 0 && (
                  <span
                    className="map-line"
                    style={{
                      left: 0,
                      background: done || isDone(LESSONS_LIST[index - 1].id) ? 'var(--accent)' : 'var(--border-strong)',
                      opacity: done || isDone(LESSONS_LIST[index - 1].id) ? 0.5 : 0.6,
                    }}
                  />
                )}
                {index < LESSONS_LIST.length - 1 && (
                  <span
                    className="map-line"
                    style={{
                      right: 0,
                      background: done ? 'var(--accent)' : 'var(--border-strong)',
                      opacity: done ? 0.5 : 0.6,
                    }}
                  />
                )}

                <div
                  className="relative z-[1] grid h-9 w-9 place-items-center rounded-full font-mono text-[12px] font-bold"
                  style={{
                    background: done ? 'var(--grad-primary)' : 'var(--surface)',
                    color: done ? '#fff' : current ? 'var(--accent-ink)' : 'var(--text-3)',
                    border: done
                      ? '1px solid transparent'
                      : current
                        ? '1.5px solid var(--accent)'
                        : '1.5px solid var(--border-strong)',
                    boxShadow: current ? '0 0 0 4px var(--accent-soft)' : undefined,
                  }}
                >
                  {done ? <Check size={15} strokeWidth={2.8} /> : lesson.level}
                </div>

                <div className="mt-2 text-[12px] font-semibold leading-tight">{lesson.title}</div>
                <div className="mt-0.5 text-[10px]" style={{ color: current ? 'var(--accent-ink)' : 'var(--text-3)' }}>
                  {done ? t("已完成") : current ? t("进行中") : t("未解锁")}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.round(ratio * 100)}%`, background: 'var(--grad-primary)' }} />
          </div>
          <span className="text-[11.5px]" style={{ color: 'var(--text-2)' }}>
            {completed === total ? t("五关全部完成，可以去装一台真机器了") : t("继续从第") + (currentLevel ?? 1) + t("关开始")}
          </span>
          <Link to="/path" className="btn btn-ghost btn-sm ml-auto no-underline">
            {completed === 0 ? t("开始学习") : t("继续学习")}
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3.5 lg:grid-cols-[1.25fr_1fr]">
        {/* ---------------- 今日推荐 ---------------- */}
        <div className="card p-4">
          <div className="mb-2.5 flex items-baseline justify-between">
            <div className="text-[13.5px] font-semibold">{t("今日推荐")}</div>
            <span className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>
              {t("新手最容易卡住的三件事")}
            </span>
          </div>
          <div className="space-y-1">
            {TODAY.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.title}
                  to={item.to}
                  className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 no-underline transition-colors"
                  style={{ color: 'inherit' }}
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
                  >
                    <Icon size={14} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">{item.title}</span>
                    <span className="block truncate text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                      {item.desc}
                    </span>
                  </span>
                  <ArrowRight size={13} style={{ color: 'var(--text-3)' }} />
                </Link>
              );
            })}
          </div>
        </div>

        {/* ---------------- 能力入口 ---------------- */}
        <div className="grid gap-3.5 sm:grid-cols-1">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.title}
                to={feature.to}
                className="card flex items-start gap-3 p-3.5 no-underline transition-transform duration-200 hover:-translate-y-0.5"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
                >
                  <Icon size={15} strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{feature.title}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                    {feature.desc}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="card mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>
          <span className="badge badge-good mr-2">{t("已完成")}</span>
          {t("M0–M5 全部交付：基建 · 内核 · 内容 · 组装台 · 推荐 · 打磨（前端 90 单测）")}
        </div>
        <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>
          <span className="badge badge-good mr-2">{t("已上线")}</span>
          {t("M6–M9 · 账号与分享、价格快照、埋点看板、全站中英双语、场景实验室（后端 69 用例 · E2E 28 条）")}
        </div>
      </div>
    </section>
  );
}
