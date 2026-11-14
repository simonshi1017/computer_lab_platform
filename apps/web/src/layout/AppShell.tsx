import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Cpu, Languages, LogIn, LogOut, Moon, Search, Sun } from 'lucide-react';
import { getLocale, t, toggleLocale } from '@/i18n';
import { NAV_GROUPS, metaOf } from '@/navigation';
import { useTheme } from '@/hooks/useTheme';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageLoading } from '@/components/PageLoading';
import { SiteFooter } from '@/components/SiteFooter';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { useAuth } from '@/hooks/useAuth';
import { initTracking, trackPageView } from '@/lib/track';
/** 命令面板要建全站索引（模型 + 显卡 + 术语），没必要进首屏 */
const CommandPalette = lazy(() =>
  import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette })),
);

export function AppShell() {
  const { pathname } = useLocation();
  const meta = metaOf(pathname);
  const { theme, toggle } = useTheme();
  const { status, user, logout } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const initials = (user?.nickname ?? user?.email ?? t("我")).slice(0, 2).toUpperCase();

  // 埋点初始化放壳层：所有页面都在它下面，注册一次就够
  useEffect(() => {
    initTracking();
  }, []);

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">
        {t('跳到主内容')}
      </a>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Cpu size={19} strokeWidth={2} />
          </div>
          <div className="brand-text">
            <b>{t('算力实验室')}</b>
            <span>Compute Lab</span>
          </div>
        </div>

        {NAV_GROUPS.map((section) => (
          <div key={section.group}>
            <div className="nav-group-label">{t(section.group)}</div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={active ? 'nav-item active' : 'nav-item'}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={17} strokeWidth={1.7} />
                  <span>{t(item.label)}</span>
                </Link>
              );
            })}
          </div>
        ))}

        <div className="sidebar-foot">
          <div className="progress-card">
            <div className="flex items-baseline justify-between">
              <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{t('项目进度')}</span>
              <span className="mono" style={{ fontSize: 17, fontWeight: 700 }}>
                M12
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: '100%' }} />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{t('方案对比 · 已完成')}</div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="topbar">
          <div className="crumb">
            <span>{t(meta?.group ?? t("页面"))}</span>
            <span style={{ opacity: 0.5 }}>/</span>
            <b>{t(meta?.label ?? t("未找到"))}</b>
          </div>

          <button type="button" className="search-btn" onClick={() => setPaletteOpen(true)}>
            <Search size={14} />
            <span>{t('搜索页面…')}</span>
            <span className="kbd">⌘K</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm lang-btn"
            onClick={toggleLocale}
            aria-label={t('切换语言')}
            title={t('切换语言')}
          >
            <Languages size={14} />
            {getLocale() === 'en' ? t("中文") : 'EN'}
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            aria-label={t(theme === 'dark' ? t("切换到浅色主题") : t("切换到深色主题"))}
            title={t('切换主题')}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {status === 'authenticated' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link
                to="/my"
                className="avatar"
                title={`${user?.nickname ?? t('我的配置')} · ${t('查看我的配置')}`}
                aria-label={t('我的配置')}
              >
                {initials}
              </Link>
              <button type="button" className="icon-btn" onClick={logout} title={t('退出登录')} aria-label={t('退出登录')}>
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setLoginOpen(true)}
              title={t('登录后可跨设备保存配置')}
            >
              <LogIn size={13} />
              {t('登录')}
            </button>
          )}
        </header>

        <main className="scroller" id="main-content">
          {/* key 用路径：切页时自动重置上一页的错误状态，不用手动清 */}
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>

        <SiteFooter />
      </div>

      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />

      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
