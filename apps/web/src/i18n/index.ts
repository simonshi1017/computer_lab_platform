import { EN as EN_CORE } from './en';
import { EN_GENERATED } from './en.generated';

/** 手工校对的核心字典优先于批量生成的字典 */
const EN: Record<string, string> = { ...EN_GENERATED, ...EN_CORE };

/**
 * 轻量 i18n：字典的 key 就是中文原文。
 *
 * 为什么不用 react-i18next：全站是一个内部平台，没有复数/日期/插值这种复杂需求，
 * 引一整套 i18next 只是多 40KB+ 依赖和一层配置。这里用「中文原文当 key」有两个好处：
 *   1. 中文态零风险——t() 原样返回，不需要维护一份 zh-CN 字典；
 *   2. 文案外置可以机械化：把源码里的中文串包一层 t() 即可，不用设计 key 命名。
 * 代价是改中文文案要同步改英文字典，用 scripts/i18n-codemod.mjs 的 check 命令兜底。
 *
 * locale 存在模块级变量里，t() 因此是纯函数、可在任何地方调用（包括模块级常量与工具函数）。
 * 切换语言时 App 用 useSyncExternalStore 订阅，并给 <Routes> 换 key 重挂载整棵路由树，
 * 让所有 t() 重新求值——组件不必逐个改成 hook，也让命令面板、格式化工具等保持一致。
 */
export type Locale = 'zh-CN' | 'en';

export const LOCALES: readonly Locale[] = ['zh-CN', 'en'];

const STORAGE_KEY = 'clab.locale';
const PARAM = 'lang';

function normalize(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === 'en' || v.startsWith('en-')) return 'en';
  if (v === 'zh' || v === 'zh-cn' || v.startsWith('zh-hans')) return 'zh-CN';
  // 参考站支持 zh-Hant / ja / ko 等，本平台暂未接入，统一回落中文
  return undefined;
}

function readStored(): Locale | undefined {
  try {
    return normalize(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return undefined;
  }
}

function readInitial(): Locale {
  if (typeof window === 'undefined') return 'zh-CN';
  const fromUrl = normalize(new URLSearchParams(window.location.search).get(PARAM));
  return fromUrl ?? readStored() ?? 'zh-CN';
}

let current: Locale = readInitial();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

/** 翻译一段 UI 文案；中文或字典缺失时原样返回。 */
export function t(text: string): string {
  if (current !== 'en') return text;
  return EN[text] ?? text;
}

/** 翻译数组型文案（场景、优势、风险清单等）。 */
export function tList(items: readonly string[]): string[] {
  if (current !== 'en') return items as string[];
  return items.map((item) => EN[item] ?? item);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 供开发期检查：英文态下有哪些文案还没翻译。 */
export function missingKeys(texts: readonly string[]): string[] {
  return texts.filter((text) => EN[text] === undefined);
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  syncDocument();
  // 导航元信息、预设、筛选标签这些模块级常量在模块加载时就会求值，
  // 只靠 React 重渲染改不动它们。整页重载（URL 已带 ?lang=）最省心，
  // 也和参考站按 lang 参数切换的行为一致。组装台有 localStorage 自动存档，不会丢配置。
  window.location.reload();
}

export function toggleLocale(): void {
  setLocale(current === 'en' ? 'zh-CN' : 'en');
}

function syncHreflang(): void {
  if (typeof document === 'undefined') return;
  document.head.querySelectorAll('link[data-clab-hreflang]').forEach((node) => node.remove());
  const base = new URL(window.location.href);
  const alternatives: Array<[string, Locale | 'x-default']> = [
    ['zh-CN', 'zh-CN'],
    ['en', 'en'],
    ['x-default', 'x-default'],
  ];
  for (const [hreflang, locale] of alternatives) {
    const url = new URL(base.href);
    if (locale === 'en') url.searchParams.set(PARAM, 'en');
    else url.searchParams.delete(PARAM);
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = hreflang;
    link.href = url.href;
    link.dataset.clabHreflang = '1';
    document.head.appendChild(link);
  }
}

/** 让 URL、<html lang>、localStorage、hreflang 与当前 locale 保持一致。 */
export function syncDocument(): void {
  if (typeof window === 'undefined') return;
  document.documentElement.lang = current === 'en' ? 'en' : 'zh-CN';

  const url = new URL(window.location.href);
  if (current === 'en') url.searchParams.set(PARAM, 'en');
  else url.searchParams.delete(PARAM);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

  try {
    window.localStorage.setItem(STORAGE_KEY, current);
  } catch {
    /* 隐私模式下忽略 */
  }
  syncHreflang();
}

syncDocument();
