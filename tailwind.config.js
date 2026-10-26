/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Figtree Variable"', 'system-ui', 'sans-serif'],
        display: ['"Figtree Variable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        page: v('page'),
        surface: v('surface'),
        sunken: v('sunken'),
        hair: v('hairline'),
        body: v('text'),
        muted: v('muted'),
        ink: v('ink'),
        primary: v('primary'),
        'primary-strong': v('primary-strong'),
        // outcome colours (dots, icons, fills) and their darker text tones (AA on white)
        o: { approved: v('o-approved'), hold: v('o-hold'), waitlist: v('o-waitlist'), redirect: v('o-redirect'), decline: v('o-decline') },
        ot: { approved: v('ot-approved'), hold: v('ot-hold'), waitlist: v('ot-waitlist'), redirect: v('ot-redirect'), decline: v('ot-decline') },
      },
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '16px', '2xl': '20px' },
      boxShadow: { float: '0 2px 12px rgba(34, 43, 69, 0.10)', 'float-lg': '0 4px 24px rgba(34, 43, 69, 0.14)' },
    },
  },
  plugins: [],
};
