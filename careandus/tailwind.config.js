/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        line: 'var(--line)',
        ink: 'var(--text)',
        ink2: 'var(--text-2)',
        plum: 'var(--plum)',
        onplum: 'var(--on-plum)',
        clay: 'var(--clay)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        risk: 'var(--risk)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Amiri', 'Georgia', 'serif'],
        displayAr: ['Amiri', 'Fraunces', 'serif'],
      },
      fontSize: {
        xs: ['12px', '1.5'],
        sm: ['14px', '1.5'],
        base: ['16px', '1.5'],
        lg: ['20px', '1.4'],
        xl: ['24px', '1.3'],
        '2xl': ['32px', '1.15'],
        '3xl': ['48px', '1.15'],
      },
      borderRadius: {
        control: '12px',
        card: '20px',
      },
      boxShadow: {
        sheet: '0 8px 24px rgba(29,26,28,0.08)',
      },
      minHeight: { tap: '48px', chip: '48px', btn: '64px', btn2: '52px' },
      minWidth: { tap: '48px' },
      transitionDuration: { press: '160ms', sheet: '240ms', screen: '320ms', fade: '120ms' },
      screens: { tablet: '768px', desk: '1100px' },
    },
  },
  plugins: [],
};
