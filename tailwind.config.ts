import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Identidade premium dark
        obsidian: '#0A0A0D',
        gold: {
          DEFAULT: '#C4A35A',
          light:   '#D4B87A',
          dark:    '#A88940',
          muted:   'rgba(196,163,90,0.18)',
          border:  'rgba(196,163,90,0.22)',
          glow:    'rgba(196,163,90,0.08)',
        },
        // Mantém brand para outras telas
        brand: {
          50:  '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
        },
      },
      fontFamily: {
        serif: ['var(--font-cormorant)', 'Georgia', 'serif'],
        sans:  ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        luxury: '0.2em',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #C4A35A 0%, #D4B87A 50%, #A88940 100%)',
      },
    },
  },
  plugins: [],
}

export default config
