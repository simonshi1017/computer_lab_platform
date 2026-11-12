import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, Lightbulb, XCircle } from 'lucide-react';
import type { Evaluation, Grade, Suggestion } from '@clab/engine';
import type { UseBuild } from '@/hooks/useBuild';
import { Radar } from '@/components/ui/Radar';
import { fmtGb, fmtPct, tpsToChars } from '@/lib/format';

const GRADE_TONE: Record<Grade, { color: string; ring: string }> = {
  S: { color: 'var(--good-ink)', ring: '#16A34A' },
  A: { color: 'var(--good-ink)', ring: '#16A34A' },
  B: { color: 'var(--accent-ink)', ring: '#4F6FFF' },
  C: { color: 'var(--warn-ink)', ring: '#D97706' },
  D: { color: 'var(--danger-ink)', ring: '#DC2626' },
  '—': { color: 'var(--text-3)', ring: '#9AA4B5' },
};

const LEVEL_ICON = {
  err: XCircle,
  warn: AlertTriangle,
  ok: CheckCircle2,
  info: Info,
} as const;

const LEVEL_COLOR = {
  err: 'var(--danger-ink)',
  warn: 'var(--warn-ink)',
  ok: 'var(--good-ink)',
  info: 'var(--accent-ink)',
} as const;

/** 评分环：用 stroke-dasharray 画进度，比引图表库轻 */
function ScoreRing({ score, grade }: { score: number; grade: Grade }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const tone = GRADE_TONE[grade];

  return (
    <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center">
      <svg width={76} height={76} viewBox="0 0 76 76" className="absolute inset-0">
        <circle cx={38} cy={38} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={6} />
        <circle
          cx={38}
          cy={38}
          r={radius}
          fill="none"
          stroke={tone.ring}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 38 38)"
          style={{ transition: 'stroke-dasharray .45s var(--ease), stroke .3s var(--ease)' }}
        />
      </svg>
      <div className="relative text-center leading-none">
        <div className="mono text-[22px] font-bold tracking-[-0.03em]" style={{ color: tone.color }}>
          {score}
        </div>
        <div className="mt-0.5 text-[9px]" style={{ color: 'var(--text-3)' }}>
          / 100
        </div>
      </div>
    </div>
  );
}

interface EvalPanelProps {
  builder: UseBuild;
}

/**
 * 右侧评估面板。
 *
 * 结构按「先结论后细节」排：等级与一句话 → 六维 → 风险 → 建议。
 * 建议按钮是可执行的：点「换电源」就真的换掉，而不是让用户自己去左侧找。
 */
export function EvalPanel({ builder }: EvalPanelProps) {
  const navigate = useNavigate();
  const { evaluation, model, modelName, applyPreset, autoPsu, autoRam, placePart, setQuant, setCtx } = builder;

  const runAction = (suggestion: Suggestion) => {
    const { action } = suggestion;
    switch (action.type) {
      case 'set-quant':
        setQuant(action.quant);
        break;
      case 'set-ctx':
        setCtx(action.ctx);
        break;
      case 'apply-preset':
        applyPreset(action.preset);
        break;
      case 'auto-psu':
        autoPsu();
        break;
      case 'auto-ram':
        autoRam();
        break;
      case 'set-cooling':
        placePart('cooling', action.coolingId);
        break;
      case 'navigate':
        navigate(action.to);
        break;
      default:
        break;
    }
  };

  return (
    <div className="eval-panel">
      {/* ---------- 结论 ---------- */}
      <div className="eval-head">
        <div className="flex items-center gap-3.5">
          <ScoreRing score={evaluation.score} grade={evaluation.grade} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="mono text-[13px] font-bold"
                style={{ color: GRADE_TONE[evaluation.grade].color }}
              >
                {evaluation.grade} 级
              </span>
              <span className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                {evaluation.empty ? '待补齐核心部件' : '六维加权'}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-[1.6]" style={{ color: 'var(--text-2)' }}>
              {conclusion(evaluation, modelName, model.paramsB)}
            </p>
          </div>
        </div>
      </div>

      {/* ---------- 六维雷达 ---------- */}
      <div className="eval-block">
        <div className="eval-title">
          六维评估
          <span className="text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>
            {evaluation.empty ? '补齐后开始评分' : '加权总分'}
          </span>
        </div>

        {evaluation.empty ? (
          <div className="note note-info">
            还差核心部件，补齐后这里会出现六维雷达图和评分。可以先点下面的按钮载入一套现成配置。
          </div>
        ) : (
          <>
            <div className="mx-auto max-w-[300px]">
              <Radar data={evaluation.dimensions.map((dim) => ({ label: dim.label, value: dim.score }))} />
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {evaluation.dimensions.map((dim) => (
                <div
                  key={dim.key}
                  className="rounded-lg px-2 py-1.5"
                  style={{ background: 'var(--surface-2)' }}
                  title={dim.hint}
                >
                  <div className="text-[9.5px]" style={{ color: 'var(--text-3)' }}>
                    {dim.label}
                  </div>
                  <div className="mono text-[12.5px] font-semibold">{Math.round(dim.score)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---------- 风险 ---------- */}
      <div className="eval-block">
        <div className="eval-title">
          风险提示
          <span className="text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>
            {evaluation.risks.length} 条
          </span>
        </div>
        <div className="space-y-1.5">
          {evaluation.risks.map((risk) => {
            const Icon = LEVEL_ICON[risk.level];
            return (
              <div
                key={`${risk.level}-${risk.title}`}
                className="flex gap-2 rounded-[9px] border px-2.5 py-2"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <Icon size={13} style={{ color: LEVEL_COLOR[risk.level], marginTop: 2, flexShrink: 0 }} />
                <div className="min-w-0">
                  <div className="text-[11.5px] font-semibold" style={{ color: LEVEL_COLOR[risk.level] }}>
                    {risk.title}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-[1.55]" style={{ color: 'var(--text-2)' }}>
                    {risk.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- 建议 ---------- */}
      <div className="eval-block">
        <div className="eval-title">
          <span className="flex items-center gap-1.5">
            <Lightbulb size={12} style={{ color: 'var(--warn-ink)' }} />
            下一步建议
          </span>
          <span className="text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>
            点一下就改
          </span>
        </div>
        <div className="space-y-1.5">
          {evaluation.suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              className="suggest-btn"
              onClick={() => runAction(suggestion)}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- 快捷操作 ---------- */}
      <div className="eval-foot">
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => navigate('/manual')}
          disabled={evaluation.empty}
        >
          生成《我的第一台算力服务器说明书》
        </button>
        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
          所有显存、速度、功耗、电费均为规则化估算值，用于教学与决策参考，实际以实测为准。
        </p>
      </div>
    </div>
  );
}

/** 一句话结论：先回答「能不能跑」，再给关键数字 */
function conclusion(evaluation: Evaluation, modelName: string, paramsB: number): string {
  if (evaluation.empty) return '还差核心部件，先把显卡、CPU、主板、电源凑齐。';

  const { headroom, tps, need, stats } = evaluation;

  if (headroom < 0) {
    const short = need.total - stats.vramGb;
    return `这套跑不动 ${modelName}：需要 ${fmtGb(need.total)}G，只有 ${stats.vramGb}G，差 ${fmtGb(short)}G。`;
  }

  if (tps === 0) return `${modelName} 放得下，但当前配置跑不起来，检查一下电源与主板。`;

  const speed = `约 ${tps} tokens/s（≈${tpsToChars(tps)} 字/秒）`;
  if (headroom < 0.1) {
    return `能跑 ${modelName}，${speed}，但显存只剩 ${fmtPct(headroom)}，长对话容易中断。`;
  }
  if (headroom >= 0.3) {
    return `很适合 ${modelName}：${speed}，显存还剩 ${fmtPct(headroom)}，${paramsB.toFixed(0)}B 这档留了足够余量。`;
  }
  return `可以跑 ${modelName}：${speed}，显存剩 ${fmtPct(headroom)}，属于正常范围。`;
}
