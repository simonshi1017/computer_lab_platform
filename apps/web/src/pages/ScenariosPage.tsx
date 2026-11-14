import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { modelById } from '@/data';
import { PAGE_BY_PATH } from '@/navigation';
import {
  LEVEL_LABELS,
  SCENARIO_LIST,
  type ScenarioLevel,
} from '@/lib/scenarios';
import { Chip } from '@/components/ui/controls';
import { fmtCtx, fmtPrice } from '@/lib/format';
import { track } from '@/lib/track';
import { t, tf } from '@/i18n';

type LevelFilter = 'all' | ScenarioLevel;

const LEVEL_BADGE: Record<ScenarioLevel, string> = {
  starter: 'badge-good',
  intermediate: 'badge-brand',
  advanced: 'badge-warn',
};

/**
 * 场景库：对标参考站的「实验库」。
 *
 * 和「配置推荐」的分工：推荐页回答「给我三档方案」，场景库回答
 * 「我想学会解决这一类问题」。卡片先给目标与代价，点进去之后由
 * 组装台的任务卡接管步骤引导，不在列表页堆交互。
 */
export function ScenariosPage() {
  const meta = PAGE_BY_PATH['/scenarios'];
  const [level, setLevel] = useState<LevelFilter>('all');

  const filters: Array<{ value: LevelFilter; label: string }> = [
    { value: 'all', label: t("全部场景") },
    { value: 'starter', label: LEVEL_LABELS.starter },
    { value: 'intermediate', label: LEVEL_LABELS.intermediate },
    { value: 'advanced', label: LEVEL_LABELS.advanced },
  ];

  const list = useMemo(
    () => (level === 'all' ? SCENARIO_LIST : SCENARIO_LIST.filter((s) => s.level === level)),
    [level],
  );

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <div className="badge badge-brand">M9 · {t("场景实验室")}</div>
          <h1 className="page-title mt-3">{t(meta.title)}</h1>
          <p className="page-sub">{t(meta.subtitle)}</p>
        </div>
        <div className="card scenario-intro">
          <div className="mono" style={{ fontSize: 24, fontWeight: 750, letterSpacing: '-0.03em' }}>
            {SCENARIO_LIST.length}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            {tf('{n} 个实验 · 步骤自动校验', { n: SCENARIO_LIST.length })}
            <br />
            {t("从目标出发，而不是从参数表出发")}
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label={t("难度筛选")}>
        {filters.map((option) => (
          <Chip key={option.value} active={level === option.value} onClick={() => setLevel(option.value)}>
            {option.label}
          </Chip>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-3)' }}>
          {tf('共 {n} 个场景', { n: list.length })}
        </span>
      </div>

      <div className="scenario-grid">
        {list.map((scenario) => {
          const Icon = scenario.icon;
          const model = modelById(scenario.modelId);
          return (
            <article className="card scenario-card" key={scenario.id} data-scenario={scenario.id}>
              <div className="flex items-start gap-3">
                <div className="scenario-icon">
                  <Icon size={20} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{scenario.name}</h2>
                    <span className={`badge ${LEVEL_BADGE[scenario.level]}`}>{LEVEL_LABELS[scenario.level]}</span>
                    <span className="badge badge-mute">{tf('{n} 步', { n: scenario.steps.length })}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--accent-ink)', marginTop: 2 }}>{scenario.tagline}</div>
                </div>
              </div>

              <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--text-2)', marginTop: 11, minHeight: 54 }}>
                {scenario.summary}
              </p>

              <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
                {scenario.tags.map((tag) => (
                  <span className="badge badge-mute" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>

              <div className="scenario-specs">
                <div>
                  <span className="k">{t("目标模型")}</span>
                  <span className="v" title={model?.cn}>{model?.cn ?? '—'}</span>
                </div>
                <div>
                  <span className="k">{t("上下文")}</span>
                  <span className="v mono">{fmtCtx(scenario.ctx)}</span>
                </div>
                <div>
                  <span className="k">{t("预算")}</span>
                  <span className="v mono">{fmtPrice(scenario.budget)}</span>
                </div>
              </div>

              <div className="scenario-steps">
                {scenario.steps.slice(0, 2).map((step) => (
                  <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Circle size={11} style={{ flex: 'none', color: 'var(--text-3)' }} />
                    <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{step.title}</span>
                  </div>
                ))}
                {scenario.steps.length > 2 && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', paddingLeft: 18 }}>
                    {tf('等共 {n} 步，进入组装台自动校验', { n: scenario.steps.length })}
                  </div>
                )}
              </div>

              <div className="scenario-foot">
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  <CheckCircle2 size={11} style={{ display: 'inline', verticalAlign: -2, marginRight: 3 }} />
                  {t("载入后自动打勾")}
                </span>
                <Link
                  to={`/builder?scenario=${scenario.id}`}
                  className="btn btn-primary btn-sm"
                  onClick={() => track('scenario_start', { scenario: scenario.id })}
                >
                  {t("开始实验")}
                  <ArrowRight size={13} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <div className="card scenario-hint">
        <b style={{ fontSize: 12.5 }}>{t("实验怎么算完成？")}</b>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {t("任务卡直接读组装台的实时评估结果：选对模型、上下文、显卡数量、显存余量、供电与散热，条件满足就自动打勾。改坏了会立刻取消打勾，可以反复试。")}
        </span>
      </div>
    </section>
  );
}
