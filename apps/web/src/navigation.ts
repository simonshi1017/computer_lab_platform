import { BookOpen, Boxes, Cpu, FileText, FlaskConical, FolderOpen, Map, Route, Sparkles, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PageMeta {
  path: string;
  label: string;
  group: '学习' | '探索' | '实战';
  icon: LucideIcon;
  /** 该页预计在哪个里程碑交付 */
  milestone: string;
  title: string;
  subtitle: string;
  /** 待实现的能力清单，M0 占位页展示用 */
  points: string[];
}

export const PAGE_META: PageMeta[] = [
  {
    path: '/',
    label: '知识地图',
    group: '学习',
    icon: Map,
    milestone: 'M2',
    title: '算力知识地图',
    subtitle: '五关渐进式学习路径，每关留下一个可验证的输出物。',
    points: ['5 关节点与解锁状态', '学习进度本地持久化', '今日推荐与继续学习'],
  },
  {
    path: '/path',
    label: '学习路径',
    group: '学习',
    icon: Route,
    milestone: 'M2',
    title: '学习路径',
    subtitle: '从「什么是模型」到「跑出第一句话」，每一关都有明确产出。',
    points: ['关卡列表与状态', '每关输出物记录', '总结卡与自评'],
  },
  {
    path: '/glossary',
    label: '概念词典',
    group: '学习',
    icon: BookOpen,
    milestone: 'M2',
    title: '概念词典',
    subtitle: '先用小白话讲一遍，想看专业定义再展开。',
    points: ['术语搜索', '通俗解释 / 专业解释 / 常见误区三段式', '正文内术语内联解释'],
  },
  {
    path: '/models',
    label: '模型百科',
    group: '探索',
    icon: Boxes,
    milestone: 'M2',
    title: '模型百科',
    subtitle: '先看「它像什么」，再看「它要多少显存」。',
    points: ['模型卡片与筛选', '厂商 / 架构 / 许可证规格', '显存估算器（量化 × 上下文）'],
  },
  {
    path: '/hardware',
    label: '硬件百科',
    group: '探索',
    icon: Cpu,
    milestone: 'M2',
    title: '硬件百科',
    subtitle: '显卡是「能装多大」，带宽是「说得多快」。',
    points: ['显卡数据库与筛选', '单卡可跑模型清单', '其他五大部件说明'],
  },
  {
    path: '/scenarios',
    label: '场景实验室',
    group: '实战',
    icon: FlaskConical,
    milestone: 'M9',
    title: '场景实验室',
    subtitle: '选一个真实使用场景，一键载入推荐配置，跟着任务卡把实验做完。',
    points: ['6 个典型场景', '一键载入推荐配置', '步骤自动校验打勾'],
  },
  {
    path: '/recommend',
    label: '配置推荐',
    group: '实战',
    icon: Sparkles,
    milestone: 'M4',
    title: '配置推荐',
    subtitle: '告诉我要跑什么模型，直接给出三档可落地的装机方案。',
    points: ['模型 / 量化 / 上下文 / 预算输入', '省钱 · 均衡 · 性能三档求解', '一键载入组装台'],
  },
  {
    path: '/builder',
    label: 'DIY 组装台',
    group: '实战',
    icon: Wrench,
    milestone: 'M3',
    title: 'DIY 组装台',
    subtitle: '左边挑件，中间装机，右边实时告诉你行不行。',
    points: ['实体机箱拖拽组装', '实时显存 / 功耗 / 电费', '六维评估与可执行建议'],
  },
  {
    path: '/my',
    label: '我的配置',
    group: '实战',
    icon: FolderOpen,
    milestone: 'M6',
    title: '我的配置',
    subtitle: '保存过的每一套方案都在这里，可以继续改，也可以生成分享链接。',
    points: ['账号下的配置列表', '一键回到组装台继续调整', '生成只读分享链接'],
  },
  {
    path: '/manual',
    label: '我的说明书',
    group: '实战',
    icon: FileText,
    milestone: 'M3',
    title: '我的说明书',
    subtitle: '把配置整理成一份能照着做的部署说明书。',
    points: ['配置清单与成本', '性能预估与风险提示', '打印 / 导出'],
  },
];

export const NAV_GROUPS: Array<{ group: PageMeta['group']; items: PageMeta[] }> = [
  { group: '学习', items: PAGE_META.filter((p) => p.group === '学习') },
  { group: '探索', items: PAGE_META.filter((p) => p.group === '探索') },
  { group: '实战', items: PAGE_META.filter((p) => p.group === '实战') },
];

/**
 * 不在侧栏出现、但需要有面包屑的路由。
 *
 * 分享落地页 /s/:token 是动态路由，不可能塞进 PAGE_META 里做精确匹配；
 * 少了它，顶栏会显示「页面 / 未找到」——用户会以为自己点进了坏链接。
 */
const HIDDEN_META: PageMeta[] = [
  {
    path: '/stats',
    label: '数据看板',
    group: '实战',
    icon: FolderOpen,
    milestone: 'M7',
    title: '数据看板',
    subtitle: '访问、转化与学习完成率。',
    points: [],
  },
  {
    path: '/s',
    label: '分享的配置',
    group: '实战',
    icon: FolderOpen,
    milestone: 'M6',
    title: '分享的配置',
    subtitle: '别人分享给你的一套装机方案。',
    points: [],
  },
];

export function metaOf(pathname: string): PageMeta | undefined {
  const exact =
    PAGE_META.find((p) => p.path === pathname) ?? HIDDEN_META.find((p) => p.path === pathname);
  if (exact) return exact;
  // 动态路由：/s/abc123 归到分享落地页，否则顶栏会显示「未找到」
  if (pathname.startsWith('/s/')) return HIDDEN_META.find((p) => p.path === '/s');
  return undefined;
}

/** 供页面按路径取元信息，避免每处都写 find(...)! */
export const PAGE_BY_PATH: Record<string, PageMeta> = Object.fromEntries(
  PAGE_META.map((p) => [p.path, p]),
);
