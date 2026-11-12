import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Save, ShieldAlert } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { ApiError, buildApi, shareApi, type BuildDetail } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { track } from '@/lib/track';
import type { UseBuild } from '@/hooks/useBuild';

/**
 * 保存配置 + 生成分享链接。
 *
 * 一个流程里做完两件事，是因为它们本来就是一件事：
 * 用户点「保存」的动机通常是「我要把这套发给别人看」。
 * 拆成两个入口会让一半人在保存完就以为分享成功了。
 *
 * 复制用 navigator.clipboard，失败降级到选中文本——
 * 内网 http 域名下 clipboard API 是不存在的（要求 secure context），
 * 这在内网部署里是常态，不能只写一行 navigator.clipboard 就交付。
 */
export function SaveBuildDialog({
  open,
  onClose,
  builder,
  onRequestLogin,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  builder: UseBuild;
  onRequestLogin: () => void;
  onSaved?: (build: BuildDetail) => void;
}) {
  const { status } = useAuth();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<BuildDetail | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setCopied(false);
    // 已经保存过就复用同一个 build，避免每次点保存都新建一条
    if (!saved) {
      setName(`${builder.modelName} · ${builder.build.gpuIds.length || 0} 卡方案`);
      setNote('');
      setShareUrl('');
    }
  }, [open, saved, builder.modelName, builder.build.gpuIds.length]);

  const payload = () => {
    // 把每件部件的单价也存进快照。
    // 只存总价的话，别人打开分享链接看到的是「当时总价 + 今天的单价」，
    // 两行数字对不上，比不显示单价更让人困惑。
    const prices: Record<string, number> = {};
    const stats = builder.stats;
    for (const gpu of stats.gpus) prices[gpu.id] = gpu.priceCny;
    for (const ram of stats.rams) prices[ram.id] = ram.priceCny;
    for (const storage of stats.storages) prices[storage.id] = storage.priceCny;
    if (stats.cpu) prices[stats.cpu.id] = stats.cpu.priceCny;
    if (stats.mobo) prices[stats.mobo.id] = stats.mobo.priceCny;
    if (stats.psu) prices[stats.psu.id] = stats.psu.priceCny;
    if (stats.cooling) prices[stats.cooling.id] = stats.cooling.priceCny;

    return {
      state: {
        build: builder.build,
        modelId: builder.modelId,
        customSpec: builder.customSpec,
        quant: builder.quant,
        ctx: builder.ctx,
        budget: builder.budget,
        prices,
        priceAsOf: new Date().toISOString().slice(0, 10),
      },
      evaluation: builder.evaluation as unknown as Record<string, unknown>,
    };
  };

  const doSave = async () => {
    setBusy(true);
    setError('');
    try {
      const result = saved
        ? await buildApi.update(saved.id, { name: name.trim() || saved.name, ...payload() })
        : await buildApi.create({ name: name.trim() || undefined, note: note.trim() || undefined, ...payload() });
      setSaved(result);
      track('build_save', { modelId: builder.modelId, score: result.score });
      onSaved?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const doShare = async () => {
    if (!saved) return;
    setBusy(true);
    setError('');
    try {
      const link = await shareApi.create(saved.id);
      setShareUrl(link.url);
      track('share_create', { buildId: saved.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '生成分享链接失败');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // http 页面（内网常见）没有 clipboard API，退回到选中输入框内容
      const input = document.getElementById('share-url-input') as HTMLInputElement | null;
      input?.select();
      setError('当前环境不支持自动复制，链接已选中，请按 Ctrl/⌘ + C');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} labelledBy="save-title">
      <div className="dialog-head">
        <div className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'var(--surface-2)' }}>
          <Save size={16} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h2 id="save-title" style={{ fontSize: 16, fontWeight: 700 }}>
            {saved ? '已保存，可以分享给别人了' : '保存这套配置'}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
            会连同当前评分与风险一起存档，半年后回看仍是当时的结果。
          </p>
        </div>
      </div>

      <div className="dialog-body" style={{ display: 'grid', gap: 13 }}>
        {status !== 'authenticated' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                gap: 9,
                padding: '11px 12px',
                borderRadius: 10,
                background: 'var(--surface-2)',
                fontSize: 12,
                color: 'var(--text-2)',
                lineHeight: 1.7,
              }}
            >
              <ShieldAlert size={15} style={{ flex: 'none', marginTop: 1, color: 'var(--warn-ink)' }} />
              <span>
                保存到账号需要先登录。不登录的话，配置已经自动存在这个浏览器里（本地存档），
                换台设备就看不到了。
              </span>
            </div>
            <button type="button" className="btn btn-primary" onClick={onRequestLogin}>
              去登录
            </button>
          </div>
        ) : saved ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="spec-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <div className="spec-cell">
                <div className="k">评分</div>
                <div className="v mono">
                  {saved.score} · {saved.grade}
                </div>
              </div>
              <div className="spec-cell">
                <div className="k">整机价</div>
                <div className="v mono">¥{saved.priceCny.toLocaleString()}</div>
              </div>
              <div className="spec-cell">
                <div className="k">配置 ID</div>
                <div className="v mono">#{saved.id}</div>
              </div>
            </div>

            {shareUrl ? (
              <div style={{ display: 'grid', gap: 7 }}>
                <label className="field-label" htmlFor="share-url-input">
                  分享链接（任何人可打开，不需要登录）
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="share-url-input" className="input mono" readOnly value={shareUrl} />
                  <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void doShare()}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                生成分享链接
              </button>
            )}

            <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={onClose}>
              关闭
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 7 }}>
              <label className="field-label" htmlFor="build-name">
                配置名称
              </label>
              <input
                id="build-name"
                className="input"
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：双 4090 跑 14B"
              />
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              <label className="field-label" htmlFor="build-note">
                备注（可选）
              </label>
              <input
                id="build-note"
                className="input"
                value={note}
                maxLength={200}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：给算法组的小王配的，预算 3 万"
              />
            </div>

            {error && (
              <div role="alert" style={{ fontSize: 12, color: 'var(--danger-ink)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void doSave()}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                保存到我的配置
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                取消
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
