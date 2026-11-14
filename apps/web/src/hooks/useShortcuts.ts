import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * 全局快捷键。
 *
 * 只做两件不打扰人的事：
 * - `?` 打开快捷键面板（新手唯一的发现入口）；
 * - `g` 开头的一串跳转（g m = 模型百科），和 GitHub / Linear 一致。
 *
 * 为什么不用单键跳转：这个站有搜索框、预算输入框、备注框，
 * 单键必然在某处抢走输入。所以除了 `?` 全部走「g 前缀」，
 * 并且在输入框里完全不响应。
 */

export interface ShortcutHint {
  keys: string[];
  label: string;
}

/**
 * 修饰键的显示名。
 * 直接写「⌘」在 Windows 的字体里会变成方框，所以按平台出字；
 * 键盘监听本身两个都认（metaKey / ctrlKey）。
 */
export function modKeyLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  // 用文字而不是 ⌘：⌘ 在不少 Linux / 容器字体里是缺字，会渲染成方框。
  // 「Cmd」读得懂，也不需要赌字体。
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? 'Cmd' : 'Ctrl';
}

/** 顺序即面板展示顺序，按「最常用 → 最少用」排 */
export const SHORTCUTS: Array<ShortcutHint & { path?: string }> = [
  { keys: ['MOD', 'K'], label: '全局搜索' },
  { keys: ['?'], label: '打开快捷键面板' },
  { keys: ['g', 'h'], label: '回到知识地图', path: '/' },
  { keys: ['g', 'm'], label: '打开模型百科', path: '/models' },
  { keys: ['g', 'r'], label: '打开配置推荐', path: '/recommend' },
  { keys: ['g', 'b'], label: '打开 DIY 组装台', path: '/builder' },
  { keys: ['g', 's'], label: '打开场景实验室', path: '/scenarios' },
  { keys: ['g', 'c'], label: '打开方案对比', path: '/compare' },
  { keys: ['Esc'], label: '关闭面板 / 弹窗' },
];

const GO_MAP: Record<string, string> = {
  h: '/',
  m: '/models',
  r: '/recommend',
  b: '/builder',
  s: '/scenarios',
  c: '/compare',
};

const SEQUENCE_TIMEOUT = 1400;

/** 输入框里不响应：否则「g」会被吃掉，用户打不出字 */
function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    element.isContentEditable === true
  );
}

export function useShortcuts(): {
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
} {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let pendingGo = false;
    let timer: number | null = null;

    const clearPending = () => {
      pendingGo = false;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      if (event.key === 'Escape') {
        setHelpOpen(false);
        clearPending();
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        setHelpOpen((open) => !open);
        clearPending();
        return;
      }

      const key = event.key.toLowerCase();

      if (pendingGo) {
        const target = GO_MAP[key];
        clearPending();
        if (target) {
          event.preventDefault();
          navigate(target);
        }
        return;
      }

      if (key === 'g') {
        pendingGo = true;
        timer = window.setTimeout(clearPending, SEQUENCE_TIMEOUT);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearPending();
    };
  }, [navigate]);

  return { helpOpen, setHelpOpen };
}
