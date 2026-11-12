import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Segmented } from '@/components/ui/controls';
import { fmtNum } from '@/lib/format';

/**
 * 数据看板。
 *
 * 只回答四个问题，不做通用 BI：
 * 有多少人在用 / 学习路径走完没有 / 推荐有没有被采纳 / 分享有没有传出去。
 *
 * 图表自绘 SVG：站内只有这一个折线图 + 一组柱，引图表库不值得（Radar 也是同理）。
 */

interface Overview {
  rangeDays: number;
  generatedAt: string;
  totals: { pv: number; uv: number; authedUsers: number; registeredUsers: number };
  trend: Array<{ date: string; pv: number; uv: number }>;
  topEvents: Array<{ name: string; label: string; count: number }>;
  lessons: { learners: number; finishers: number; completionRate: number | null; totalDone: number; totalLessons: number };
  recommend: { views: number; applies: number; applyRate: number | null };
  share: { created: number; opens: number; openPerShare: number | null; liveLinks: number };
  builds: { saved: number };
}

const RANGES = [
  { value: '7' as const, label: '近 7 天' },
  { value: '14' as const, label: '近 14 天' },
  { value: '30' as const, label: '近 30 天' },
];

function pct(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value * 100)}%`;
}

/** 柱状趋势：PV 用柱，UV 叠一条折线 */
function Trend({ points }: { points: Overview['trend'] }) {
  if (points.length === 0) return null;
  const W = 720;
  const H = 150;
  const padX = 8;
  const padY = 14;
  const max = Math.max(1, ...points.map((point) => point.pv));
  const step = (W - padX * 2) / points.length;
  const barW = Math.max(4, Math.min(28, step * 0.52));

  const yOf = (value: number) => H - padY - (value / max) * (H - padY * 2);
  const xOf = (index: number) => padX + step * index + step / 2;

  const line = points.map((point, index) => `${xOf(index).toFixed(1)},${yOf(point.uv).toFixed(1)}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="访问趋势">
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padX}
            x2={W - padX}
            y1={H - padY - ratio * (H - padY * 2)}
            y2={H - padY - ratio * (H - padY * 2)}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}
        {points.map((point, index) => (
          <rect
            key={point.date}
            x={xOf(index) - barW / 2}
            y={yOf(point.pv)}
            width={barW}
            height={Math.max(0, H - padY - yOf(point.pv))}
            rx={3}
            fill="var(--accent)"
            opacity={0.32}
          >
            <title>{`${point.date} · ${point.pv} 次访问 / ${point.uv} 人`}</title>
          </rect>
        ))}
        <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={`dot-${point.date}`} cx={xOf(index)} cy={yOf(point.uv)} r={2.6} fill="var(--accent)">
            <title>{`${point.date} · ${point.uv} 人`}</title>
          </circle>
        ))}
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10.5,
          color: 'var(--text-3)',
          marginTop: 4,
        }}
      >
        <span>{points[0]?.date.slice(5)}</span>
        <span>{points[points.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card" style={{ padding: '13px 15px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 750, letterSpacing: '-0.02em', marginTop: 2 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function FunnelRow({ label, from, to, rate }: { label: string; from: number; to: number; rate: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ flex: 1, fontSize: 12.5 }}>{label}</span>
      <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
        {fmtNum(from)} → {fmtNum(to)}
      </span>
      <span className="mono" style={{ fontSize: 12.5, fontWeight: 650, width: 52, textAlign: 'right' }}>
        {pct(rate)}
      </span>
    </div>
  );
}

export function StatsPage() {
  const { status, user } = useAuth();
  const [days, setDays] = useState<'7' | '14' | '30'>('7');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // 手动刷新用自增 key 触发副作用，比复制一份请求逻辑干净
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (status !== 'authenticated' || !user?.isAdmin) return;
    setLoading(true);
    setError('');
    api<Overview>(`/stats/overview?days=${days}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [days, status, user?.isAdmin, nonce]);

  if (status !== 'authenticated') {
    return (
      <div className="card" style={{ padding: 28 }}>
        <b style={{ fontSize: 14 }}>需要登录</b>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6 }}>数据看板只对管理员开放。</p>
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="card" style={{ padding: 28 }}>
        <b style={{ fontSize: 14 }}>当前账号不是管理员</b>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6 }}>
          在数据库里把 app_user.is_admin 置为 true，或使用 /admin 后台的账号体系。
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <BarChart3 size={16} style={{ color: 'var(--accent)' }} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <b style={{ fontSize: 13.5 }}>数据看板</b>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            只统计站内行为，不采集 IP 与设备指纹
          </div>
        </div>
        <Segmented value={days} options={RANGES} onChange={setDays} ariaLabel="统计范围" />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setNonce((value) => value + 1)}
          title={loading ? '加载中' : '重新加载'}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
        <Link className="btn btn-ghost btn-sm" to="/my">
          <ArrowLeft size={13} />
          返回
        </Link>
      </div>

      {error && (
        <div className="card" role="alert" style={{ padding: 14, color: 'var(--danger-ink)', fontSize: 12.5 }}>
          {error}
        </div>
      )}

      {data && (
        <>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Metric label={`${data.rangeDays} 天访问量`} value={fmtNum(data.totals.pv)} hint="每一次页面打开" />
            <Metric label="独立访客" value={fmtNum(data.totals.uv)} hint="按匿名会话去重" />
            <Metric label="登录用户" value={fmtNum(data.totals.authedUsers)} hint={`注册总数 ${data.totals.registeredUsers}`} />
            <Metric label="已保存配置" value={fmtNum(data.builds.saved)} hint={`活跃分享链接 ${data.share.liveLinks}`} />
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <b style={{ fontSize: 13 }}>访问趋势</b>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>柱=访问量 · 线=独立访客</span>
            </div>
            <Trend points={data.trend} />
          </div>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <div className="card" style={{ padding: 18 }}>
              <b style={{ fontSize: 13 }}>关键转化</b>
              <div style={{ marginTop: 6 }}>
                <FunnelRow
                  label="推荐页 → 采纳方案"
                  from={data.recommend.views}
                  to={data.recommend.applies}
                  rate={data.recommend.applyRate}
                />
                <FunnelRow
                  label="分享链接 → 被打开"
                  from={Math.max(data.share.created, data.share.liveLinks)}
                  to={data.share.opens}
                  rate={data.share.openPerShare}
                />
                <FunnelRow
                  label="开始学习 → 完成至少一关"
                  from={data.lessons.learners}
                  to={data.lessons.finishers}
                  rate={data.lessons.completionRate}
                />
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.7 }}>
                关卡完成率的分母是「有过学习记录的人」，不是全部注册用户——否则注册越多完成率越低，指标失去意义。
              </div>
            </div>

            <div className="card" style={{ padding: 18 }}>
              <b style={{ fontSize: 13 }}>事件分布</b>
              <div style={{ marginTop: 10, display: 'grid', gap: 7 }}>
                {data.topEvents.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>还没有数据，先去站内点几下。</div>
                )}
                {data.topEvents.map((event) => {
                  const max = data.topEvents[0]?.count || 1;
                  return (
                    <div key={event.name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 96, fontSize: 11.5, color: 'var(--text-2)', flex: 'none' }}>{event.label}</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.max(3, (event.count / max) * 100)}%`,
                            height: '100%',
                            background: 'var(--accent)',
                            opacity: 0.75,
                          }}
                        />
                      </div>
                      <span className="mono" style={{ fontSize: 11, width: 38, textAlign: 'right', color: 'var(--text-3)' }}>
                        {fmtNum(event.count)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
            统计生成于 {new Date(data.generatedAt).toLocaleString('zh-CN', { hour12: false })} · 关卡总数{' '}
            {data.lessons.totalLessons} · 累计完成 {data.lessons.totalDone} 次
          </div>
        </>
      )}
    </div>
  );
}
