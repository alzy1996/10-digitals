/** @type {import('tailwindcss').Config} */
// Colors come from CSS variables in src/styles/tokens.css (PRD 9.1), so one
// class works in the dark default theme and the light theme.
// Use logical utilities (ms-*, me-*, ps-*, pe-*, start-*, end-*, text-start)
// so every screen mirrors correctly in Arabic RTL.
const v = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    screens: {
      sm: '480px',
      md: '768px', // tablet: Mirror Mode
      lg: '1024px', // desktop: owner 2-column
      xl: '1280px',
    },
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        line: v('line'),
        text: v('text'),
        'text-2': v('text-2'),
        brass: v('brass'),
        'on-brass': v('on-brass'),
        keep: v('keep'),
        cut: v('cut'),
        warn: v('warn'),
        info: v('info'),
        // Text versions of the status colors (WCAG AA in both themes, src/styles/tokens.css).
        'keep-ink': v('keep-ink'),
        'cut-ink': v('cut-ink'),
        'warn-ink': v('warn-ink'),
        'info-ink': v('info-ink'),
      },
      // Status text must meet WCAG AA (PRD 9.1): text-keep / text-cut / text-warn / text-info use the
      // ink tokens, while bg-*, border-* and fills keep the PRD token values.
      textColor: {
        keep: v('keep-ink'),
        cut: v('cut-ink'),
        warn: v('warn-ink'),
        info: v('info-ink'),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', '"Reem Kufi"', '"IBM Plex Sans Arabic"', 'sans-serif'],
        'display-ar': ['"Reem Kufi"', '"IBM Plex Sans Arabic"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '1.5' }],
        sm: ['14px', { lineHeight: '1.5' }],
        base: ['16px', { lineHeight: '1.5' }],
        lg: ['20px', { lineHeight: '1.4' }],
        xl: ['24px', { lineHeight: '1.15' }],
        '2xl': ['32px', { lineHeight: '1.15' }],
        '3xl': ['48px', { lineHeight: '1.15' }],
      },
      borderRadius: {
        ctl: '10px',
        card: '16px',
      },
      height: { 'btn-primary': '64px', 'btn-secondary': '48px', chip: '40px' },
      minHeight: { tap: '44px', 'btn-primary': '64px', 'btn-secondary': '48px', chip: '40px' },
      minWidth: { tap: '44px' },
      transitionDuration: { press: '160ms', sheet: '240ms', screen: '320ms' },
      transitionTimingFunction: { out: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    },
  },
  plugins: [],
};
