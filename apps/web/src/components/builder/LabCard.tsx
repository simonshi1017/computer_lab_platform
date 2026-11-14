import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, LogOut, Shuffle, Trophy } from 'lucide-react';
import { evaluateSteps, stepProgress, type LabContext, type Scenario } from '@/lib/scenarios';
import { track } from '@/lib/track';
import { t, tf } from '@/i18n';

interface LabCardProps {
  scenario: Scenario;
  context: LabContext;
  onExit: () => void;
}

/**
 * 组装台内嵌的实验任务卡（对标参考站的「实验指导」）。
 *
 * 打勾不是手动点，也不存进度：每一步都直接读当前 builder 的实时评估结果。
 * 用户把卡拆了、把上下文降回去，勾会立刻消失——这样任务卡才能当校验器用，
 * 而不是一个自我安慰的 checklist。
 */
export function LabCard({ scenario, context, onExit }: LabCardProps) {
  const results = evaluateSteps(scenario, context);
  const { done, total, ratio } = stepProgress(results);
  const reported = useRef(false);

  // 完成事件只报一次：任务卡会随每次拖拽重渲染，不能把漏斗数据刷爆。
  // 故意不重置 reported——用户在同一次实验里反复改配置不该被算成多次完成。
  useEffect(() => {
    if (ratio === 1 && !reported.current) {
      reported.current = true;
      track('scenario_complete', { scenario: scenario.id, steps: total });
    }
  }, [ratio, scenario.id, total]);

  const Icon = scenario.icon;
  const complete = ratio === 1;

  return (
    <section className="card lab-card" data-scenario={scenario.id} aria-label={t("实验任务卡")}>
      <div className="lab-head">
        <div className="lab-icon">
          <Icon size={18} strokeWidth={1.8} />
        </div>

        <div className="lab-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span className={`badge ${complete ? 'badge-good' : 'badge-brand'}`}>
              {complete ? t("实验完成") : t("实验进行中")}
            </span>
            <b>{scenario.name}</b>
          </div>
          <p>
            <b style={{ color: 'var(--text-2)' }}>{t("实验目标")}：</b>
            {scenario.goal}
          </p>
          {complete && (
            <p style={{ color: 'var(--good-ink)', marginTop: 3 }}>
              <Trophy size={11} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
              {t("全部步骤已完成，可以保存或分享这套配置了")}
            </p>
          )}
        </div>

        <div className="lab-progress">
          <span className="count">{tf('{d} / {n} 步已完成', { d: done, n: total })}</span>
          <div className="progress-track" style={{ width: 152 }}>
            <div className="progress-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          <div className="lab-actions">
            <Link to="/scenarios" className="btn btn-ghost btn-sm" style={{ height: 26, padding: '0 9px', fontSize: 11 }}>
              <Shuffle size={11} />
              {t("换一个场景")}
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ height: 26, padding: '0 9px', fontSize: 11 }}
              onClick={onExit}
            >
              <LogOut size={11} />
              {t("退出实验")}
            </button>
          </div>
        </div>
      </div>

      <div className="lab-steps">
        {results.map(({ step, done: isDone }) => (
          <div className="lab-step" key={step.id} data-done={isDone} data-step={step.id}>
            <span className="mark">
              {isDone ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            </span>
            <span className="min-w-0">
              <b>{step.title}</b>
              <small>{step.hint}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
