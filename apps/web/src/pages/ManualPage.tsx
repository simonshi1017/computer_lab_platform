import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Cpu, Printer } from 'lucide-react';
import { useBuild } from '@/hooks/useBuild';
import { fmtCtx, fmtGb, fmtPct, fmtPrice, tpsToChars } from '@/lib/format';
import { track } from '@/lib/track';
import { t, tf } from '@/i18n';

/** 云 API 参考价，用于成本对比。取国产中端模型的常见价位（元 / 百万 token） */
const CLOUD_PER_MILLION = 4;
const ELEC_PRICE = 0.6;

const USAGE_SCENARIOS = [
  { label: t("轻度"), desc: t("每天 10 万 token（几十次对话）"), daily: 100_000 },
  { label: t("中度"), desc: t("每天 50 万 token（写作 + 代码）"), daily: 500_000 },
  { label: t("重度"), desc: t("每天 200 万 token（批量处理）"), daily: 2_000_000 },
];

interface CostRow {
  label: string;
  desc: string;
  hoursPerDay: number;
  elecPerYear: number;
  cloudPerYear: number;
}

function costRows(tps: number, powerW: number): CostRow[] {
  return USAGE_SCENARIOS.map((scenario) => {
    const tokensPerHour = Math.max(1, tps * 3600);
    // 机器不会只为这点活开机一整天，按真实所需时长算，封顶 8 小时
    const hoursPerDay = Math.min(8, scenario.daily / tokensPerHour);
    return {
      label: scenario.label,
      desc: scenario.desc,
      hoursPerDay,
      elecPerYear: (powerW / 1000) * hoursPerDay * 365 * ELEC_PRICE,
      cloudPerYear: (scenario.daily * 365 * CLOUD_PER_MILLION) / 1_000_000,
    };
  });
}

export function ManualPage() {
  const builder = useBuild();
  const { evaluation, model, modelName, modelRecord, stats, need, quant, ctx } = builder;
  const { tps, grade, score, headroom } = evaluation;

  const generatedAt = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // 自定义尺寸在 data 里没有记录，也就没有经过核对的 Ollama tag。
  // 与其编一个可能不存在的名字，不如把「去哪找」写清楚。
  const ollamaTag = modelRecord?.ollamaTag ?? null;
  const pullTarget = ollamaTag ?? t("<模型名>");
  const tagHint = ollamaTag
    ? ''
    : t("（自定义尺寸：去 ollama.com/library 搜同尺寸模型，选 Q4_K_M 量化版本）");

  const rows = costRows(tps, stats.powerW);
  const localCostPerMillion =
    tps > 0 ? ((stats.powerW / 1000) * ELEC_PRICE) / ((tps * 3600) / 1_000_000) : 0;

  const parts = [
    {
      role: t("显卡"),
      name: stats.gpus.map((gpu) => gpu.name).join(' + ') || t("未选"),
      price: stats.gpus.reduce((sum, gpu) => sum + gpu.priceCny, 0),
      note: t(`合计 ${stats.vramGb}GB 显存`),
    },
    { role: 'CPU', name: stats.cpu?.name ?? t("未选"), price: stats.cpu?.priceCny ?? 0, note: stats.cpu?.cores ?? '—' },
    {
      role: t("主板"),
      name: stats.mobo?.name ?? t("未选"),
      price: stats.mobo?.priceCny ?? 0,
      note: stats.mobo ? t(`${stats.mobo.gpuSlots} 卡槽 · ${stats.mobo.ramSlots} 内存槽`) : '—',
    },
    {
      role: t("内存"),
      name: stats.rams.map((ram) => ram.name).join(' + ') || t("未选"),
      price: stats.rams.reduce((sum, ram) => sum + ram.priceCny, 0),
      note: t(`合计 ${stats.ramGb}GB`),
    },
    {
      role: t("电源"),
      name: stats.psu?.name ?? t("未选"),
      price: stats.psu?.priceCny ?? 0,
      note: stats.psu ? t(`负载 ${Math.round((stats.powerW / stats.psu.watt) * 100)}%`) : '—',
    },
    {
      role: t("硬盘"),
      name: stats.storages.map((item) => item.name).join(' + ') || t("未选"),
      price: stats.storages.reduce((sum, item) => sum + item.priceCny, 0),
      note: t("系统与模型权重"),
    },
    {
      role: t("散热"),
      name: stats.cooling?.name ?? t("未选"),
      price: stats.cooling?.priceCny ?? 0,
      note: stats.cooling ? t(`可压 ${stats.cooling.capacityW}W · ${stats.cooling.noiseDb}dB`) : '—',
    },
  ];

  const deploySteps = [
    {
      title: t("装系统"),
      detail: t("推荐 Ubuntu 22.04 LTS（驱动与 CUDA 支持最省心）；Windows 走 WSL2 也能用，但显存直通要多配一步。"),
      code: t("lsb_release -a # 确认版本"),
    },
    {
      title: t("装显卡驱动"),
      detail: t(`先确认系统认到了 ${stats.gpus.length} 张卡。驱动装错版本是最常见的坑，装完必须能看到显存。`),
      code: t("sudo ubuntu-drivers install nvidia-smi # 应列出 GPU 型号与显存"),
    },
    {
      title: t("装推理运行时"),
      detail: t("Ollama 适合单机验证，一条命令装完。多人并发要换 vLLM，否则请求会排队。"),
      code: 'curl -fsSL https://ollama.com/install.sh | sh\nollama --version',
    },
    {
      title: t("拉模型"),
      detail: tf('按当前配置选 {q} 版本，权重约 {w}GB。{tail}', {
        q: quant === 'int4' ? t("Q4 量化") : quant === 'int8' ? t("Q8 量化") : t("FP16 全精度"),
        w: fmtGb(need.weights),
        tail: headroom < 0
          ? t("注意：当前配置放不下，先降量化或减上下文。")
          : tf('显存需 {v}GB，余量 {h}。', { v: fmtGb(need.total), h: fmtPct(headroom) }),
      }),
      code: `ollama pull ${pullTarget}\nollama list${tagHint}`,
    },
    {
      title: t("跑通第一句话"),
      detail: t(`目标是在 ${fmtCtx(ctx)} 上下文下稳定输出。先问一句短的，确认不出错再压长文本。`),
      code: `ollama run ${pullTarget} "${t("用一句话解释什么是显存")}"\n\n# ${t("也可以用 API 测")}\ncurl http://localhost:11434/api/generate -d '{\n  "model": "${pullTarget}",\n  "prompt": "${t("你好")}",\n  "stream": false\n}'`,
    },
  ];

  return (
    <div className="manual-page">
      <div className="manual-toolbar no-print">
        <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          {t("这份说明书由当前组装台的配置生成，改配置后回来会重新计算。")}
        </div>
        <div className="flex items-center gap-2">
          <Link to="/builder" className="btn btn-ghost btn-sm no-underline">
            <Cpu size={13} />
            {t("回到组装台")}
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              track('manual_print');
              window.print();
            }}
          >
            <Printer size={13} />
            {t("打印 / 导出 PDF")}
          </button>
        </div>
      </div>

      <article className="manual-doc">
        <header className="manual-head">
          <div className="manual-eyebrow">{t("我的第一台本地算力服务器说明书")}</div>
          <h1 className="manual-title">
            {t("跑")} {modelName} {t("的")}{stats.gpus.length > 1 ? t(`${stats.gpus.length} 卡`) : t("单卡")}{t("方案")}
          </h1>
          <div className="manual-meta">
            <span>{t("生成时间")} {generatedAt}</span>
            <span>·</span>
            <span className="mono">
              {grade} {t("级 /")} {score} {t("分")}
            </span>
            <span>·</span>
            <span>{t("整机")} {fmtPrice(stats.priceCny)}</span>
          </div>
        </header>

        {/* ---------------- 一、我的目标 ---------------- */}
        <section className="manual-section">
          <h2>
            <span className="idx">01</span>{t("我的目标")}
          </h2>
          <div className="spec-grid">
            {[
              { k: t("目标模型"), v: modelName },
              { k: t("参数量"), v: `${model.paramsB}B`, mono: true },
              { k: t("量化方式"), v: quant.toUpperCase() },
              { k: t("上下文长度"), v: fmtCtx(ctx), mono: true },
              { k: t("显存需求"), v: `${fmtGb(need.total)} GB`, mono: true },
              { k: t("预估速度"), v: tps > 0 ? `${tps} tokens/s` : t("— 跑不动"), mono: true },
              { k: t("折合字数"), v: tps > 0 ? t(`约 ${tpsToChars(tps)} 字/秒`) : '—', mono: true },
              { k: t("显存配置"), v: `${stats.vramGb} GB`, mono: true },
            ].map((item) => (
              <div className="spec-cell" key={item.k}>
                <div className="k">{item.k}</div>
                <div className={item.mono ? 'v mono' : 'v'}>{item.v}</div>
              </div>
            ))}
          </div>
          <p className="manual-note">
            {headroom < 0
              ? tf('注意：这套配置放不下目标模型，还差 {v}GB。按这份清单采购会导致模型加载失败，请先调整量化或上下文。', {
                  v: fmtGb(need.total - stats.vramGb),
                })
              : tf('显存占用 {a} / {b}GB，余量 {h}。{tail}', {
                  a: fmtGb(need.total),
                  b: stats.vramGb,
                  h: fmtPct(headroom),
                  tail: headroom < 0.1
                    ? t("余量偏少，长对话可能不稳定，建议降一档量化。")
                    : t("留足了余量，长对话和批处理都比较稳。"),
                })}
          </p>
        </section>

        {/* ---------------- 二、配置清单 ---------------- */}
        <section className="manual-section">
          <h2>
            <span className="idx">02</span>{t("配置清单")}
          </h2>
          <table className="manual-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>{t("部件")}</th>
                <th>{t("型号")}</th>
                <th style={{ width: 148 }}>{t("说明")}</th>
                <th style={{ width: 84, textAlign: 'right' }}>{t("价格")}</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => (
                <tr key={part.role}>
                  <td style={{ color: 'var(--text-3)' }}>{part.role}</td>
                  <td>{part.name}</td>
                  <td style={{ color: 'var(--text-2)' }}>{part.note}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {part.price > 0 ? fmtPrice(part.price) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                  {t("硬件合计")}
                </td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
                  {fmtPrice(stats.priceCny)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="manual-note">
            {t("价格为 2026 年国内市场估算值，不含机箱、显示器与外设。整机功耗按各部件 TDP 之和 × 1.2 估算，实际峰值可能更高。")}
          </p>
        </section>

        {/* ---------------- 三、性能预估 ---------------- */}
        <section className="manual-section">
          <h2>
            <span className="idx">03</span>{t("性能预估")}
          </h2>
          <div className="manual-grid-4">
            <div>
              <div className="k">{t("能否加载")}</div>
              <div className="v" style={{ color: headroom >= 0 ? 'var(--good-ink)' : 'var(--danger-ink)' }}>
                {headroom >= 0 ? t("可以") : t("不行")}
              </div>
            </div>
            <div>
              <div className="k">{t("显存余量")}</div>
              <div className="v mono">
                {headroom >= 0 ? fmtPct(headroom) : t(`缺 ${fmtGb(need.total - stats.vramGb)}G`)}
              </div>
            </div>
            <div>
              <div className="k">{t("生成速度")}</div>
              <div className="v mono">{tps > 0 ? `${tps} t/s` : '—'}</div>
            </div>
            <div>
              <div className="k">{t("整机功耗")}</div>
              <div className="v mono">{stats.powerW} W</div>
            </div>
          </div>
          <p className="manual-note">
            {t("生成速度按「带宽 ÷ 权重体积 × 效率系数」估算，受上下文长度影响。")}
            {tps > 0 && tps < 8
              ? t(`${tps} tokens/s 偏慢，读起来会一顿一顿，长文生成会比较煎熬。`)
              : tps >= 20
                ? t(`${tps} tokens/s 比人阅读速度快，交互体验接近在线服务。`)
                : ''}
          </p>
        </section>

        {/* ---------------- 四、成本 ---------------- */}
        <section className="manual-section">
          <h2>
            <span className="idx">04</span>{t("成本：本地 vs 云 API")}
          </h2>
          <table className="manual-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>{t("用量")}</th>
                <th>{t("场景")}</th>
                <th style={{ width: 90, textAlign: 'right' }}>{t("每天开机")}</th>
                <th style={{ width: 104, textAlign: 'right' }}>{t("本地电费/年")}</th>
                <th style={{ width: 104, textAlign: 'right' }}>{t("云 API/年")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td style={{ color: 'var(--text-3)' }}>{row.label}</td>
                  <td style={{ color: 'var(--text-2)' }}>{row.desc}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {row.hoursPerDay < 0.1 ? '<0.1' : row.hoursPerDay.toFixed(1)} h
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {fmtPrice(row.elecPerYear)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {fmtPrice(row.cloudPerYear)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="manual-note">
            {t("本地每百万 token 的边际成本约")} <b className="mono">{localCostPerMillion.toFixed(2)} {t("元")}</b>{t("（只算电费）， 云 API 按")} {fmtPrice(CLOUD_PER_MILLION)}{t("/百万 token 估算。")}
            <br />
            <b>{t("说实话：")}</b>{t("只是偶尔用，云 API 更省——硬件钱要跑很多 token 才摊得回来。本地部署真正买的是隐私、离线可用和不被限流，不是便宜。")}
          </p>
        </section>

        {/* ---------------- 五、风险 ---------------- */}
        <section className="manual-section">
          <h2>
            <span className="idx">05</span>{t("风险与注意事项")}
          </h2>
          <div className="manual-risks">
            {evaluation.risks.map((risk) => {
              const Icon = risk.level === 'ok' ? CheckCircle2 : AlertTriangle;
              const color =
                risk.level === 'err'
                  ? 'var(--danger-ink)'
                  : risk.level === 'warn'
                    ? 'var(--warn-ink)'
                    : 'var(--good-ink)';
              return (
                <div key={`${risk.level}-${risk.title}`} className="manual-risk">
                  <Icon size={13} style={{ color, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <b style={{ color }}>{t(risk.title)}</b>
                    <span style={{ color: 'var(--text-2)' }}> — {t(risk.desc)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------------- 六、部署清单 ---------------- */}
        <section className="manual-section">
          <h2>
            <span className="idx">06</span>{t("下一步行动清单")}
          </h2>
          <ol className="manual-steps">
            {deploySteps.map((step, index) => (
              <li key={step.title}>
                <div className="step-head">
                  <span className="step-num">{index + 1}</span>
                  <span className="step-title">{step.title}</span>
                </div>
                <p className="step-detail">{step.detail}</p>
                <pre className="step-code">{step.code}</pre>
              </li>
            ))}
          </ol>
          <p className="manual-note">
            {t("装完先跑通链路再考虑优化。常见坑：驱动版本与 CUDA 不匹配、显存被桌面环境占用、量化档位与显存不符。")}
          </p>
        </section>

        <footer className="manual-foot">
          <div>
            <b>{t("数据说明")}</b>{t("：显存、速度、功耗、电费均为规则化估算值，用于教学与采购参考，不等于实测跑分。模型参数来自官方模型卡，硬件规格来自厂商官网，价格随市场波动。")}
          </div>
          <div className="mt-1.5">
            {t("数据更新时间")} {modelRecord?.updatedAt ?? '2026-11'} {t("· 说明书由算力实验室生成 ·")}{' '}
            <Link to="/glossary" className="no-underline" style={{ color: 'var(--accent-ink)' }}>
              {t("看不懂的术语点这里")}
              <ArrowRight size={10} className="ml-0.5 inline" />
            </Link>
          </div>
        </footer>
      </article>
    </div>
  );
}
