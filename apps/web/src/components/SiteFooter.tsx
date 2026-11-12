import { Link } from 'react-router-dom';
import { DATA_UPDATED_AT } from '@clab/data';

/**
 * 全局页脚。
 *
 * 之所以做成常驻的一条而不是每页各写一遍：
 * 「所有估算值都要标注」是产品的硬要求，靠每个页面自觉就一定会漏。
 * 放在壳层里，任何新页面都自动带上。
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>
        显存、速度、功耗、电费均为<b>规则化估算值</b>，用于教学与采购参考，不等于实测跑分。
      </span>
      <span className="site-footer-sep">·</span>
      <span className="site-footer-source">
        数据来源：厂商官网与官方模型卡 · 更新于 {DATA_UPDATED_AT}
      </span>
      <span className="site-footer-sep">·</span>
      <Link to="/glossary" className="no-underline" style={{ color: 'var(--accent-ink)' }}>
        术语表
      </Link>
    </footer>
  );
}
