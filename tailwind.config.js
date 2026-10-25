/** Nail Mirror design system — "Porcelain & Glaze"
 *  Warm porcelain surfaces (REF4 luxury), ice-glaze accent (REF1 winter), mocha ink,
 *  glass panels over the camera (REF2 glass effect), floating dock (REF3), filter grid (REF5).
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        porcelain: { DEFAULT: '#F7F3EE', 50: '#FCFAF7', 100: '#F7F3EE', 200: '#EFE8DF', 300: '#E4D9CC' },
        ink: { DEFAULT: '#1D1A18', 700: '#3A3431', 500: '#6B625C', 400: '#8C827B', 300: '#B5ABA3' },
        mocha: { DEFAULT: '#6B4A3A', 50: '#F4EDE8', 100: '#E7D8CE', 300: '#B08B78', 500: '#6B4A3A', 600: '#5A3B2E', 700: '#462D23' },
        glaze: { DEFAULT: '#A9C8E8', 50: '#EEF4FB', 100: '#DCE9F6', 300: '#A9C8E8', 500: '#6E9BC9', 700: '#3F6A96' },
        champagne: { DEFAULT: '#C8A97E', 100: '#F3EADC', 300: '#DCC5A2', 500: '#C8A97E', 700: '#9C7F57' },
        night: { DEFAULT: '#0F0E0D', 800: '#171514', 700: '#211E1C', 600: '#2C2826' },
        ok: '#2E7D5B',
        warn: '#B7791F',
        bad: '#B42318',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', '"Noto Naskh Arabic"', 'Georgia', 'serif'],
        sans: ['Manrope', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(29,26,24,0.18)',
        lift: '0 18px 40px -16px rgba(29,26,24,0.28)',
        glow: '0 0 0 3px rgba(255,255,255,0.95), 0 0 22px 4px rgba(200,169,126,0.65)',
        iceglow: '0 0 0 2px rgba(169,200,232,0.9), 0 0 24px 2px rgba(169,200,232,0.55)',
        inset: 'inset 0 2px 6px rgba(29,26,24,0.12)',
      },
      keyframes: {
        rise: { '0%': { opacity: 0, transform: 'translateY(10px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        pop: { '0%': { transform: 'scale(.92)' }, '60%': { transform: 'scale(1.04)' }, '100%': { transform: 'scale(1)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(200,169,126,.55)' }, '100%': { boxShadow: '0 0 0 18px rgba(200,169,126,0)' } },
      },
      animation: {
        rise: 'rise .35s ease-out both',
        pop: 'pop .28s ease-out both',
        shimmer: 'shimmer 2.4s linear infinite',
        pulseRing: 'pulseRing 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
}
