import { useMemo, useState } from 'react';
import { Download, GitCompare } from 'lucide-react';
import { MODELS_LIST, ENGINE_CATALOG, modelById } from '@/data';
import { useBuild } from '@/hooks/useBuild';
import { PRESET_LIST } from '@/lib/presets';
import { SCENARIO_LIST } from '@/lib/scenarios';
import { compareBuilds, toCsv, type CompareCandidate, type CompareRow } from '@/lib/compare';
import { Chip, Segmented } from '@/components/ui/controls';
import { fmtCtx } from '@/lib/format';
import { t, tf } from '@/i18n';
import type { Quant } from '@clab/engine';

const CTX_OPTIONS = [8192, 32768, 65536, 131072, 262144];
const MAX_COLUMNS = 3;

/**
 * 方案对比页。
 *
 * 对比最容易骗人的地方是「不同目标放在一起比」：A 跑 9B、B 跑 27B，
 * 价格差一半不是方案的胜利，是目标的差异。所以这里强制统一
 * 模型 / 量化 / 上下文，只让硬件方案本身成为变量。
 */
export function ComparePage() {
  const builder = useBuild();
  const [modelId, setModelId] = useState('qwen38-27b');
  const [quant, setQuant] = useState<Quant>('int4');
  const [ctx, setCtx] = useState(8192);
  const [budget, setBudget] = useState(40000);

  const model = modelById(modelId) ?? MODELS_LIST[0];

  const candidates = useMemo<CompareCandidate[]>(() => {
    const list: CompareCandidate[] = PRESET_LIST.map((preset) => ({
      id: `preset:${preset.key}`,
      name: preset.name,
      source: 'preset' as const,
      note: tf('{model} · {n} 件', {
        model: modelById(preset.modelId)?.cn ?? preset.modelId,
        n: Object.values(preset.build).flat().filter(Boolean).length,
      }),
      build: preset.build,
    }));

    SCENARIO_LIST.forEach((scenario) => {
      list.push({
        id: `scenario:${scenario.id}`,
        name: scenario.name,
        source: 'scenario',
        note: tf('{model} · {ctx} 上下文', {
          model: modelById(scenario.modelId)?.cn ?? scenario.modelId,
          ctx: fmtCtx(scenario.ctx),
        }),
        build: scenario.build,
      });
    });

    if (builder.stats.gpus.length > 0) {
      list.push({
        id: 'current',
        name: t('当前组装台'),
        source: 'current',
        note: tf('{gpu} ×{n}', {
          gpu: builder.stats.gpus[0].name,
          n: builder.stats.gpus.length,
        }),
        build: builder.build,
      });
    }
    return list;
  }, [builder.build, builder.stats.gpus]);

  const [picked, setPicked] = useState<string[]>(['preset:save', 'preset:balance', 'preset:perf']);

  const selected = candidates.filter((candidate) => picked.includes(candidate.id)).slice(0, MAX_COLUMNS);

  // 上下文不能超过目标模型的上限，切换模型时自动夹一下
  const ctxOptions = CTX_OPTIONS.filter((value) => value <= model.ctxMax);
  const effectiveCtx = ctxOptions.includes(ctx) ? ctx : ctxOptions[ctxOptions.length - 1];

  const comparison = useMemo(
    () =>
      compareBuilds({
        candidates: selected,
        model,
        quant,
        ctx: effectiveCtx,
        budget,
        catalog: ENGINE_CATALOG,
      }),
    [selected, model, quant, effectiveCtx, budget],
  );

  const toggle = (id: string) => {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_COLUMNS) return current;
      return [...current, id];
    });
  };

  /** 风险与字数这两行要带语言单位，屏幕与 CSV 共用同一个渲染函数 */
  const renderCell = (row: CompareRow, index: number): string => {
    if (row.format === 'risks') {
      const errors = row.extra?.[index]?.errors ?? 0;
      const warns = row.extra?.[index]?.warns ?? 0;
      if (errors === 0 && warns === 0) return t('无');
      const parts: string[] = [];
      if (errors > 0) parts.push(tf('{n} 项致命', { n: errors }));
      if (warns > 0) parts.push(tf('{n} 项提醒', { n: warns }));
      return parts.join(' · ');
    }
    if (row.format === 'headroom') {
      const pct = row.raw[index];
      if (pct === null || pct === undefined) return '—';
      return pct < 0 ? t('放不下') : `${pct}%`;
    }
    if (row.format === 'chars') {
      const chars = row.raw[index];
      return chars === null || chars === undefined ? '—' : tf('{n} 字', { n: chars });
    }
    return row.values[index];
  };

  const download = () => {
    const csv = toCsv(
      comparison,
      `${model.cn} · ${quant.toUpperCase()} · ${fmtCtx(effectiveCtx)}`,
      renderCell,
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `clab-compare-${model.id}-${quant}-${effectiveCtx}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>{t('方案对比')}</h1>
          <p>{t('同一个目标下，几套方案到底差在哪：速度、显存、价格、六维评分逐行摊开。')}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={download}
          disabled={selected.length === 0}
          title={t('把这张对比表导出成 CSV')}
        >
          <Download size={14} />
          {t('导出 CSV')}
        </button>
      </div>

      <div className="card compare-controls">
        <label className="compare-field">
          <span>{t('目标模型')}</span>
          <select
            className="input h-8 text-[12px]"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            aria-label={t('目标模型')}
          >
            {MODELS_LIST.map((item) => (
              <option key={item.id} value={item.id}>
                {item.cn}
              </option>
            ))}
          </select>
        </label>

        <div className="compare-field">
          <span>{t('量化')}</span>
          <Segmented
            value={quant}
            onChange={setQuant}
            ariaLabel={t('量化')}
            options={[
              { value: 'fp16', label: 'FP16' },
              { value: 'int8', label: 'INT8' },
              { value: 'int4', label: 'INT4' },
            ]}
          />
        </div>

        <div className="compare-field">
          <span>{t('上下文')}</span>
          <div className="compare-chips">
            {ctxOptions.map((value) => (
              <Chip key={value} active={value === effectiveCtx} onClick={() => setCtx(value)}>
                {fmtCtx(value)}
              </Chip>
            ))}
          </div>
        </div>

        <label className="compare-field">
          <span>{t('预算')}</span>
          <input
            type="number"
            className="input h-8 text-[12px]"
            value={budget}
            min={2000}
            step={1000}
            onChange={(event) => setBudget(Math.max(2000, Number(event.target.value) || 2000))}
          />
        </label>
      </div>

      <div className="card compare-picker">
        <div className="compare-picker-head">
          <span>{t('选择方案（最多 3 套）')}</span>
          <span className="compare-count">
            {selected.length} / {MAX_COLUMNS}
          </span>
        </div>
        <div className="compare-picker-list">
          {candidates.map((candidate) => {
            const active = picked.includes(candidate.id);
            const full = picked.length >= MAX_COLUMNS && !active;
            return (
              <button
                key={candidate.id}
                type="button"
                className="compare-option"
                data-active={active}
                data-disabled={full}
                data-source={candidate.source}
                onClick={() => toggle(candidate.id)}
                aria-pressed={active}
              >
                <span className="compare-option-name">{candidate.name}</span>
                <span className="compare-option-note">{candidate.note}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selected.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <GitCompare size={22} style={{ margin: '0 auto 8px', color: 'var(--text-3)' }} />
          <div className="text-[13.5px] font-semibold">{t('还没有选中方案')}</div>
          <div className="mt-1.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
            {t('先在上面勾选两到三套配置，再来比。')}
          </div>
        </div>
      ) : (
        <div className="card compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">{t('指标')}</th>
                {comparison.columns.map((column) => (
                  <th key={column.id} scope="col">
                    <span className="compare-th-name">{column.name}</span>
                    <span className="compare-th-source">
                      {column.source === 'preset'
                        ? t('预设')
                        : column.source === 'scenario'
                          ? t('场景')
                          : t('当前配置')}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.key} data-row={row.key}>
                  <th scope="row">{t(row.label)}</th>
                  {row.values.map((_value, index) => {
                    const best = row.best.includes(index);
                    return (
                      <td key={`${row.key}-${index}`} data-best={best ? 'true' : undefined}>
                        {renderCell(row, index)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="compare-foot">
            {tf('目标 {model} · {quant} · {ctx} 上下文 · 显存需求 {need}G。高亮为该行最优值，仅作参考。', {
              model: model.cn,
              quant: quant.toUpperCase(),
              ctx: fmtCtx(effectiveCtx),
              need: comparison.needTotal.toFixed(1),
            })}
          </p>
        </div>
      )}
    </section>
  );
}
