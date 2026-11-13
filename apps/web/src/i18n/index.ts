import { EN as EN_CORE } from './en';
import { EN_GENERATED } from './en.generated';
import { EN_DATA } from './en.data';
import { EN_DYNAMIC } from './en.dynamic';

/**
 * 合并优先级：手工校对 > 批量生成 > 内容数据。
 * 内容数据（模型/显卡/术语/关卡）与 UI 文案共用同一套「中文原文当 key」机制，
 * 重复短语只需翻一次，改中文文案时检查脚本也会一并报缺失。
 */
const EN: Record<string, string> = { ...EN_DATA, ...EN_GENERATED, ...EN_CORE };

/**
 * 动态文案的 key：把连续的非中文片段（数字、型号、插槽名、标点）压成 {n} 占位。
 *
 * 计算内核返回的是「已经拼好」的中文句子，例如
 *   `占用 11.9 / 16GB，剩 26%，长对话很稳。`
 * 数字每次都不同，无法按原文查字典。源码里的模板串是
 *   `占用 ${need.total} / ${stats.vramGb}GB，剩 ${pct}%，长对话很稳。`
 * 两边用同一个归一化函数，就能落到同一个 key 上。
 *
 * 注意：脚本 scripts/gen-content-dict.mjs 里有一份等价实现，改动必须同步。
 */
export function dynamicKey(text: string): { key: string; values: string[] } {
  const values: string[] = [];
  // 汉字 + CJK 标点 + 全角符号留在 key 里；只有数字、型号、插槽名、ASCII 标点
  // 这类「每次都变或需要原样搬运」的片段才占位。中文标点因此不会漏进英文句子。
  const key = text.replace(/[^\u3400-\u9fff\u3000-\u303f\uff00-\uffef]+/g, (chunk) => {
    values.push(chunk);
    return `{${values.length - 1}}`;
  });
  return { key, values };
}

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

/**
 * 翻译一段文案；中文态、字典缺失时原样返回。
 * 精确匹配优先，命中不到再试动态模板（评估建议、说明书步骤这类带数字的句子）。
 */
export function t(text: string): string {
  if (current !== 'en' || !/[\u3400-\u9fff]/.test(text)) return text;
  const exact = EN[text];
  if (exact !== undefined) return exact;
  const { key, values } = dynamicKey(text);
  const tpl = EN_DYNAMIC[key];
  if (tpl !== undefined) {
    return tpl.replace(/\{(\d+)\}/g, (_match: string, i: string) => values[Number(i)] ?? '');
  }
  return text;
}

/**
 * 翻译带命名占位符的模板，用于说明书里「句子中间插多个变量」的长文案。
 * 中文态没有字典条目，直接用中文模板填值；英文态取英文模板再填值。
 * 例：tf('按当前配置选 {q} 版本', { q: 'Q4 量化' })
 */
export function tf(template: string, vars: Record<string, string | number>): string {
  const text = current === 'en' ? (EN[template] ?? template) : template;
  return text.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(vars[name] ?? ''));
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
