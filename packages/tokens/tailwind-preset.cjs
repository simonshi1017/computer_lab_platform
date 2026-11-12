/**
 * Tailwind preset —— 颜色/字体/圆角/阴影全部指向 CSS 变量，
 * 这样切主题只需要改 <html data-theme>，不用重新构建。
 *
 * 注意：变量里存的是完整颜色值（含 rgba），因此不支持 `bg-surface/50`
 * 这类透明度修饰符。需要透明度时用 `bg-[color:var(--accent-soft)]`。
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent)',
        'accent-strong': 'var(--accent-strong)',
        'accent-soft': 'var(--accent-soft)',
        mint: 'var(--mint)',
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        ink: 'var(--text)',
        'ink-2': 'var(--text-2)',
        'ink-3': 'var(--text-3)',
        line: 'var(--border)',
        'line-strong': 'var(--border-strong)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      fontFamily: {
        sans: ['Inter', 'PingFang SC', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        btn: '10px',
        chip: '8px',
      },
      boxShadow: {
        card: 'var(--shadow-md)',
        float: 'var(--shadow-lg)',
        soft: 'var(--shadow-sm)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
};
