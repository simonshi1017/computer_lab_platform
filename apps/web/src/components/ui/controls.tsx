import type { ReactNode } from 'react';

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button type="button" className="chip" data-active={active} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

/** 分段控件：用于量化档位、视图切换这类互斥选项 */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-active={option.value === value}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SpecItem {
  k: string;
  v: ReactNode;
  mono?: boolean;
}

/** 规格矩阵：1px gap 当分隔线，四列自动降级为两列 */
export function SpecGrid({ items }: { items: SpecItem[] }) {
  return (
    <div className="spec-grid">
      {items.map((item) => (
        <div className="spec-cell" key={item.k}>
          <div className="k">{item.k}</div>
          <div className={item.mono ? 'v mono' : 'v'}>{item.v}</div>
        </div>
      ))}
    </div>
  );
}

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">{children}</h2>
      {extra}
    </div>
  );
}
