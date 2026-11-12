import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Download, Eye, Loader2, PackageOpen } from 'lucide-react';
import { CATALOG } from '@clab/data';
import type { BuildStats, Dimension, Evaluation, Grade, Risk } from '@clab/engine';
import { ApiError, shareApi, type SharePayload } from '@/lib/api';
import { Radar } from '@/components/ui/Radar';
import { downloadShareCard, type ShareCardData } from '@/lib/shareCard';
import { track } from '@/lib/track';
import { fmtGb, fmtPct, fmtPrice, tpsToChars } from '@/lib/format';

/**
 * 分享落地页。
 *
 * 设计约束：**打开这个链接的人可能完全不懂装机，也没有账号**。
 * 所以页面回答三个问题就够：这是什么、要花多少钱、我能不能照着买。
 * 不放「编辑」「保存」按钮——落地页是只读的，要改就跳回组装台。
 *
 * 数据来源分两半，这是有意的：
 * - 部件名称查当前目录（能显示）；
 * - 评分与结论用保存时的快照（当时算出来的结果不能被后来的规格改写）。
 */

const GRADE_COLOR: Record<string, string> = {
  S: 'var(--good-ink)',
  A: 'var(--good-ink)',
  B: 'var(--accent-ink)',
  C: 'var(--warn-ink)',
  D: 'var(--danger-ink)',
  '—': 'var(--text-3)',
};

interface PartRow {
  label: string;
  name: string;
  price: number;
  missing: boolean;
}

export function SharePage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<SharePayload | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    void (async () => {
      try {
        const payload = await shareApi.resolve(token);
        if (!alive) return;
        setData(payload);
        // 分享传播的核心指标：链接被真正打开了几次
        track('share_open', { token, buildId: payload.build.id });
      } catch (err) {
        if (!alive) return;
        setError(
          err instanceof ApiError
            ? { code: err.code, message: err.message }
            : { code: 'network_error', message: '连不上服务端，稍后再试' },
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const rows = useMemo<PartRow[]>(() => {
    if (!data) return [];
    const state = data.build.state;
    const build = state.build;
    // 保存时记录下来的单价。有它就用它——分享页展示的应该是「当时的账」。
    const snapshotPrices = (state.prices ?? {}) as Record<string, number>;
    const snapshotPrice = (id: string, fallback: number) =>
      typeof snapshotPrices[id] === 'number' ? snapshotPrices[id] : fallback;
    const pick = <T extends { id: string; name: string; priceCny: number }>(
      list: T[],
      id: string | null,
    ): { name: string; price: number; missing: boolean } => {
      if (!id) return { name: '未选', price: 0, missing: false };
      const found = list.find((item) => item.id === id);
      // 目录里删掉的型号：显示 id + 标记，而不是静默丢掉一行让总价对不上
      return found
        ? { name: found.name, price: found.priceCny, missing: false }
        : { name: `${id}（已下架）`, price: 0, missing: true };
    };

    /** 多件同类：逐件查价累加，混插不同型号时总价才对得上 */
    const multi = (
      ids: string[],
      catalog: Array<{ id: string; name: string; priceCny: number }>,
      label: string,
    ): PartRow | null => {
      if (ids.length === 0) return null;
      const found = ids.map((id) => catalog.find((item) => item.id === id));
      const names = [...new Set(found.map((item) => item?.name ?? '已下架'))];
      return {
        label: ids.length > 1 ? `${label} × ${ids.length}` : label,
        name: names.length > 1 ? `${names[0]} 等 ${names.length} 种` : names[0],
        price: ids.reduce((sum, id, index) => sum + snapshotPrice(id, found[index]?.priceCny ?? 0), 0),
        missing: found.some((item) => !item),
      };
    };

    const list: PartRow[] = [];
    const gpuRow = multi(build.gpuIds, CATALOG.gpus, '显卡');
    if (gpuRow) list.push(gpuRow);
    list.push({ label: 'CPU', ...pick(CATALOG.cpus, build.cpuId) });
    list.push({ label: '主板', ...pick(CATALOG.mobos, build.moboId) });
    const ramRow = multi(build.ramIds, CATALOG.rams, '内存');
    if (ramRow) list.push(ramRow);
    const storageRow = multi(build.storageIds, CATALOG.storages, '硬盘');
    if (storageRow) list.push(storageRow);
    list.push({ label: '电源', ...pick(CATALOG.psus, build.psuId) });
    list.push({ label: '散热', ...pick(CATALOG.coolings, build.coolingId) });
    return list.filter((row) => row.name !== '未选');
  }, [data]);

  if (error) {
    return (
      <div className="card" style={{ padding: 32, display: 'grid', gap: 10, justifyItems: 'start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={17} style={{ color: 'var(--warn-ink)' }} />
          <b style={{ fontSize: 15 }}>
            {error.code === 'share_expired' ? '这个链接已过期' : '打不开这个分享'}
          </b>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.8 }}>{error.message}</p>
        <Link className="btn btn-ghost btn-sm" to="/builder">
          自己搭一套
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--text-3)' }} />
      </div>
    );
  }

  const { build } = data;
  const evaluation = build.evaluation as unknown as Evaluation | null;
  const dimensions = (evaluation?.dimensions ?? []) as Dimension[];
  const risks = (evaluation?.risks ?? []) as Risk[];
  const stats = evaluation?.stats as BuildStats | undefined;
  const grade = (build.grade as Grade) ?? '—';

  // 总价取「可见清单的累加」，与上面的总价快照对齐。
  // 只在清单完整（没有已下架的部件）时这么做：缺件时累加会偏小，
  // 那种情况必须退回保存时的总价，否则页面会低报成本。
  const detailTotal = rows.reduce((sum, row) => sum + row.price, 0);
  const rowsComplete = rows.length > 0 && rows.every((row) => !row.missing && row.price > 0);
  const price = rowsComplete ? detailTotal : build.priceCny || stats?.priceCny || 0;

  const cardData: ShareCardData = {
    title: build.name,
    modelName: build.modelName,
    quant: String(data.build.state.quant ?? 'int4'),
    ctxLabel: `${Math.round((data.build.state.ctx ?? 8192) / 1024)}K`,
    score: build.score,
    grade,
    priceCny: price,
    vramGb: stats?.vramGb ?? 0,
    needGb: evaluation?.need?.total ?? 0,
    headroom: evaluation?.headroom ?? 0,
    tps: evaluation?.tps ?? 0,
    // 显卡行带数量后缀，卡片上「RTX 4090 ×2」和机箱里点亮两张卡才对得上
    gpus: rows
      .filter((row) => row.label.startsWith('显卡'))
      .map((row) => (row.label.includes('×') ? `${row.name} ${row.label.replace('显卡', '').trim()}` : row.name)),
    parts: rows
      .filter((row) => !row.label.startsWith('显卡'))
      .map((row) => `${row.label.replace(/ × .*/, '')} ${row.name}`),
    author: data.author,
    date: new Date(data.createdAt).toLocaleDateString('zh-CN'),
    footer: '显存与速度均为估算值，下单前请自行核对；价格来自保存时的快照。',
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: '18px 20px', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
          <PackageOpen size={14} />
          <span>分享的配置</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{data.author ?? '匿名用户'}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{new Date(data.createdAt).toLocaleDateString('zh-CN')}</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Eye size={12} />
            {data.views}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 22, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1.35 }}>
              {build.name}
            </h1>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6 }}>
              目标模型 <b style={{ color: 'var(--text)' }}>{build.modelName}</b>
              {evaluation && <> · 显存需求 {fmtGb(evaluation.need.total)}G</>}
              {evaluation && <> · 约 {Math.round(evaluation.tps)} tok/s（{tpsToChars(evaluation.tps)} 字/秒）</>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>整机参考价</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 750, letterSpacing: '-0.02em' }}>
              {fmtPrice(price)}
            </div>
            <div style={{ fontSize: 11.5, color: GRADE_COLOR[grade], fontWeight: 600 }}>
              评分 {build.score} · {grade} 级
            </div>
          </div>
        </div>
      </div>

      <div className="share-grid" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)' }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 12 }}>配置清单</div>
          <div style={{ display: 'grid', gap: 1, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {rows.map((row) => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '9px 12px',
                  background: 'var(--surface)',
                  fontSize: 12.5,
                }}
              >
                <span style={{ width: 78, flex: 'none', color: 'var(--text-3)', fontSize: 11.5 }}>{row.label}</span>
                <span style={{ flex: 1, minWidth: 0, color: row.missing ? 'var(--warn-ink)' : 'var(--text)' }}>
                  {row.name}
                </span>
                <span className="mono" style={{ flex: 'none', color: 'var(--text-2)' }}>
                  {row.price > 0 ? fmtPrice(row.price) : '—'}
                </span>
              </div>
            ))}
          </div>

          {risks.length > 0 && (
            <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 650 }}>保存时的风险提示</div>
              {risks.slice(0, 3).map((risk) => (
                <div
                  key={risk.title}
                  style={{
                    display: 'flex',
                    gap: 8,
                    fontSize: 11.5,
                    lineHeight: 1.7,
                    color: 'var(--text-2)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--surface-2)',
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      marginTop: 7,
                      flex: 'none',
                      background:
                        risk.level === 'err'
                          ? 'var(--danger-ink)'
                          : risk.level === 'warn'
                            ? 'var(--warn-ink)'
                            : 'var(--good-ink)',
                    }}
                  />
                  <span>
                    <b style={{ color: 'var(--text)' }}>{risk.title}</b> · {risk.desc}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 18, display: 'grid', gap: 12, alignContent: 'start' }}>
          <div style={{ fontSize: 13, fontWeight: 650 }}>六维评估快照</div>
          {dimensions.length >= 3 ? (
            <div className="grid place-items-center">
              <Radar data={dimensions.map((item) => ({ label: item.label, value: item.score }))} size={240} />
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>这套配置保存时没有评分数据。</div>
          )}

          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>可用显存</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 650 }}>{fmtGb(stats.vramGb)}G</div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>整机功耗</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 650 }}>{Math.round(stats.powerW)}W</div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>显存余量</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 650 }}>
                  {evaluation ? fmtPct(evaluation.headroom) : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>月电费</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 650 }}>{fmtPrice(stats.elecMonthlyCny)}</div>
              </div>
            </div>
          )}

          <Link className="btn btn-primary" to={`/builder?share=${data.token}`} style={{ marginTop: 4 }}>
            在组装台打开这套配置
            <ArrowRight size={14} />
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={cardBusy}
            onClick={() => {
              setCardBusy(true);
              setCardError('');
              track('card_download', { buildId: build.id });
              void downloadShareCard(cardData)
                .catch(() => setCardError('图片生成失败，可尝试用 Chrome 打开后再试'))
                .finally(() => setCardBusy(false));
            }}
          >
            {cardBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            下载分享图（发群里用）
          </button>
          {cardError && (
            <div role="alert" style={{ fontSize: 11.5, color: 'var(--danger-ink)' }}>
              {cardError}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.7 }}>
            打开后可以改配置、换显卡、重新算一遍；改完是你自己的副本，不会影响分享者的存档。
          </div>
        </div>
      </div>
    </div>
  );
}
