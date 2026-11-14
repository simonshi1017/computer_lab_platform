import { lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AuthProvider } from '@/hooks/useAuth';

/**
 * 首屏只保留首页，其余页面按需加载。
 *
 * 组装台带着机箱 SVG 与全部交互逻辑，是体积最大的一块；
 * 用户可能只是来看模型列表，没必要为它下载装机的代码。
 * Suspense 与错误边界统一放在 AppShell 里，这里只声明页面。
 */
const PathPage = lazy(() => import('@/pages/PathPage').then((m) => ({ default: m.PathPage })));
const GlossaryPage = lazy(() => import('@/pages/GlossaryPage').then((m) => ({ default: m.GlossaryPage })));
const ModelsPage = lazy(() => import('@/pages/ModelsPage').then((m) => ({ default: m.ModelsPage })));
const HardwarePage = lazy(() => import('@/pages/HardwarePage').then((m) => ({ default: m.HardwarePage })));
const ScenariosPage = lazy(() => import('@/pages/ScenariosPage').then((m) => ({ default: m.ScenariosPage })));
const ComparePage = lazy(() => import('@/pages/ComparePage').then((m) => ({ default: m.ComparePage })));
const RecommendPage = lazy(() => import('@/pages/RecommendPage').then((m) => ({ default: m.RecommendPage })));
const BuilderPage = lazy(() => import('@/pages/BuilderPage').then((m) => ({ default: m.BuilderPage })));
const ManualPage = lazy(() => import('@/pages/ManualPage').then((m) => ({ default: m.ManualPage })));
const MyBuildsPage = lazy(() => import('@/pages/MyBuildsPage').then((m) => ({ default: m.MyBuildsPage })));
const SharePage = lazy(() => import('@/pages/SharePage').then((m) => ({ default: m.SharePage })));
const StatsPage = lazy(() => import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })));

export function App() {
  return (
    // AuthProvider 在 Router 外层：登录态和路由无关，放里面会导致切页时重新校验 token
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="path" element={<PathPage />} />
            <Route path="glossary" element={<GlossaryPage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="hardware" element={<HardwarePage />} />
            <Route path="scenarios" element={<ScenariosPage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="recommend" element={<RecommendPage />} />
            <Route path="builder" element={<BuilderPage />} />
            <Route path="manual" element={<ManualPage />} />
            <Route path="my" element={<MyBuildsPage />} />
            <Route path="stats" element={<StatsPage />} />
            {/* 分享落地页：无账号也能看，路由本身不需要任何鉴权 */}
            <Route path="s/:token" element={<SharePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
