/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    borderRadius: { none: '0', sm: '8px', DEFAULT: '12px', lg: '16px', xl: '24px', '2xl': '32px', full: '9999px' },
    extend: {
      fontFamily: { sans: ['Figtree', 'system-ui', 'sans-serif'] },
      colors: {
        ink: '#222222',
        mute: '#6A6A6A',
        line: '#DDDDDD',
        wash: '#F7F7F7',
        // Brand: used only for interface chrome (buttons, links, focus, selection, territories). Never for outcomes.
        brand: { DEFAULT: '#3F3BB5', dark: '#2F2C96' },
        tint: '#F0EFFB',
        // Okabe-Ito: distinguishable under the common kinds of colour blindness. Always paired with a shape.
        o: { approved: '#009E73', hold: '#E69F00', waitlist: '#0072B2', redirect: '#CC79A7', decline: '#D55E00' },
      },
      boxShadow: {
        card: '0 0 0 1px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.06)',
        float: '0 2px 16px rgba(0,0,0,0.16)',
        pop: '0 8px 32px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
};
