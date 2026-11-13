import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Boxes, Loader2, LogIn, Share2, Trash2, Wrench } from 'lucide-react';
import { ApiError, buildApi, shareApi, type BuildSummary } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { t } from '@/i18n';

/**
 * 我的配置。
 *
 * 只做四件事：看、打开、分享、删。不做重命名以外的编辑——
 * 配置的真正编辑器是组装台，这里再做一个就是两套状态机互相打架。
 */
export function MyBuildsPage() {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<BuildSummary[] | null>(null);
  const [error, setError] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [sharedId, setSharedId] = useState<number | null>(null);
  const [shareUrl, setShareUrl] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await buildApi.list());
    } catch (err) {
      setItems(null);
      setError(err instanceof ApiError ? err.message : t("加载失败"));
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void load();
  }, [status, load]);

  const remove = async (id: number) => {
    // 删除是不可逆的，先问一次。用原生 confirm 是有意的：
    // 自绘确认框在这里只会多 80 行代码和一个新的焦点管理问题。
    if (!window.confirm(t("删除后无法恢复，确定要删除这套配置吗？"))) return;
    setBusyId(id);
    try {
      await buildApi.remove(id);
      setItems((list) => (list ?? []).filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("删除失败"));
    } finally {
      setBusyId(null);
    }
  };

  const share = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      const link = await shareApi.create(id);
      setSharedId(id);
      setShareUrl(link.url);
      try {
        await navigator.clipboard.writeText(link.url);
      } catch {
        /* 内网 http 页面没有 clipboard，链接已经显示出来了，手动复制即可 */
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("生成分享链接失败"));
    } finally {
      setBusyId(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--text-3)' }} />
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <>
        <div className="card" style={{ padding: 28, display: 'grid', gap: 12, justifyItems: 'start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogIn size={17} style={{ color: 'var(--accent)' }} />
            <b style={{ fontSize: 15 }}>{t("登录后才能跨设备看到自己的配置")}</b>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.8, maxWidth: 520 }}>
            {t("不登录也能用：你在组装台做的所有调整都自动存在这台电脑的浏览器里。 登录之后才会同步到账号，并支持把链接发给别人。")}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setLoginOpen(true)}>
            {t("去登录")}
          </button>
        </div>
        <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
      </>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Boxes size={16} style={{ color: 'var(--accent)' }} />
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: 13.5 }}>{user?.nickname ?? user?.email ?? t("我的配置")}</b>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            {t("共")} {items?.length ?? 0} {t("套配置 · 评分与价格是保存时的快照，不会被后来的规格变更改写")}
          </div>
        </div>
        {user?.isAdmin && (
          <Link className="btn btn-ghost btn-sm" to="/stats">
            <BarChart3 size={13} />
            {t("数据看板")}
          </Link>
        )}
        <Link className="btn btn-ghost btn-sm" to="/builder">
          <Wrench size={13} />
          {t("去组装台")}
        </Link>
      </div>

      {error && (
        <div className="card" role="alert" style={{ padding: 14, color: 'var(--danger-ink)', fontSize: 12.5 }}>
          {error}
        </div>
      )}

      {items === null && !error && (
        <div className="grid place-items-center py-16">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-3)' }} />
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="card" style={{ padding: 30, textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>{t("还没有保存过配置")}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
            {t("去组装台搭一套，点「保存 / 分享」就会出现在这里。")}
          </div>
          <Link className="btn btn-primary btn-sm" to="/builder">
            {t("开始搭一套")}
          </Link>
        </div>
      )}

      {items?.map((item) => (
        <div key={item.id} className="card" style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 650, display: 'flex', alignItems: 'center', gap: 8 }}>
                {item.name}
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>
                  #{item.id}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                {item.modelName} {t("· 保存于")} {new Date(item.updatedAt).toLocaleString('zh-CN', { hour12: false })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, textAlign: 'right', flex: 'none' }}>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{t("评分")}</div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
                  {item.score}
                  <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 3 }}>{item.grade}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{t("整机价")}</div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
                  ¥{item.priceCny.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/builder?build=${item.id}`)}
            >
              <Wrench size={13} />
              {t("在组装台打开")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busyId === item.id}
              onClick={() => void share(item.id)}
            >
              {busyId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
              {t("生成分享链接")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busyId === item.id}
              style={{ color: 'var(--danger-ink)' }}
              onClick={() => void remove(item.id)}
            >
              <Trash2 size={13} />
              {t("删除")}
            </button>
          </div>

          {sharedId === item.id && shareUrl && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="input mono" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
              <span style={{ fontSize: 11.5, color: 'var(--good-ink)', flex: 'none' }}>{t("已生成")}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
