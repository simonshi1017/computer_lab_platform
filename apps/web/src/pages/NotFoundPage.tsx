import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="page">
      <div className="card px-8 py-12 text-center">
        <div className="mono text-[11px]" style={{ color: 'var(--text-3)' }}>
          404
        </div>
        <h1 className="mt-2 text-[22px] font-semibold">这个页面还没造出来</h1>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--text-2)' }}>
          可能是链接过期，也可能是我们还在施工。
        </p>
        <Link to="/" className="btn btn-primary mt-6">
          回到知识地图
        </Link>
      </div>
    </section>
  );
}
