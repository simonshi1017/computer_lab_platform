import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** 无障碍标题 id，指向面板内可见的标题 */
  labelledBy?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 通用对话框。
 *
 * 用 portal 挂到 body 上，避免被父级的 overflow / transform 裁掉——
 * 组装台的滚动容器会把 fixed 定位搞坏，这是最容易踩的坑。
 *
 * 无障碍三件事：
 * 1. 打开时把焦点移进面板，Tab 不会跑到背后的页面上（焦点陷阱）
 * 2. Esc 关闭，点遮罩关闭
 * 3. 关闭后把焦点还给打开它的那个按钮，键盘用户不会「掉位置」
 */
export function Dialog({ open, onClose, labelledBy, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    lastFocused.current = document.activeElement as HTMLElement | null;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 等面板渲染完成再移焦点
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }, 20);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(timer);
      lastFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="dialog-mask" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="dialog-close" onClick={onClose} aria-label="关闭">
          <X size={15} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
