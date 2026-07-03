/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        panel: 'var(--panel)',
        'panel-soft': 'var(--panel-soft)',
        ink: 'var(--ink)',
        'ink-dark': 'var(--ink-dark)',
        accent: 'var(--accent)',
        'accent-deep': 'var(--accent-deep)',
      },
      borderColor: {
        line: 'var(--line)',
      },
      borderRadius: {
        lg2: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
    },
  },
  plugins: [],
}
