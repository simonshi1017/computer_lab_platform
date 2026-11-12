/**
 * 页面级加载骨架。
 *
 * 路由懒加载后，模块下载期间会短暂空白。用骨架占位而不是转圈：
 * 转圈会让页面看起来「卡住了」，骨架预示内容即将出现。
 */
export function PageLoading() {
  return (
    <section className="page" aria-busy="true" aria-live="polite">
      <div className="skeleton" style={{ width: 220, height: 26 }} />
      <div className="skeleton mt-3" style={{ width: 320, height: 14 }} />
      <div className="card mt-6 p-6">
        <div className="skeleton" style={{ width: '60%', height: 14 }} />
        <div className="skeleton mt-2.5" style={{ width: '40%', height: 14 }} />
        <div className="skeleton mt-2.5" style={{ width: '48%', height: 14 }} />
      </div>
      <span className="sr-only">页面加载中</span>
    </section>
  );
}
