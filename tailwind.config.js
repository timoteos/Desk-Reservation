/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Public Sans throughout, with weight doing the work a second family
        // would otherwise do. Self-hosted in index.css.
        sans: ['"Public Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // One brand green with a full scale. There used to be two — #4B6B1A for
        // headings and #4a5e1a for buttons — six percent apart, which read as
        // the same colour while behaving as different ones. Everything now
        // derives from 700, and the tints give selected states and chip fills
        // something to use that belongs to the palette.
        mqd: {
          50:  '#F5F7EE',
          100: '#E8EDD8',
          200: '#D2DCB4',
          300: '#B4C486',
          400: '#92A75B',
          500: '#74883C',
          600: '#5C6E2A',
          700: '#4A5E1A', // brand — 7.22:1 on white, in both directions
          800: '#3A4A14', // hover
          900: '#2A360E',

          // Kept so existing markup keeps working; both now name one green.
          title: '#4A5E1A',
          btn: '#4A5E1A',
          'btn-hover': '#3A4A14',
          footer: '#232527',
          faq: '#4A5E1A',
        },

        // Neutrals biased toward the brand hue. Tailwind's greys are blue-cast
        // and fought the olive; these sit under it.
        surface: {
          page:  '#FAFAF7', // outermost ground
          panel: '#F4F5F0', // the ground cards sit on
          card:  '#FFFFFF',
          line:  '#E2E4DA', // hairline borders
        },
        // Each of these clears WCAG AA on white, on panel and on page. The old
        // text-gray-400 hints measured 2.54:1 and failed outright.
        ink: {
          DEFAULT: '#1C1E17', // headings
          body:    '#3D4034',
          muted:   '#6B7060', // 4.66:1 at worst, on light grounds
          // Muted text on the dark footer. ink-muted is tuned for light grounds
          // and only reaches 3.01:1 there, so it needs its own value.
          'on-dark': '#A8AC9C', // 6.63:1 on #232527
        },
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeScale: {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.6s ease-out forwards',
        'fade-scale': 'fadeScale 0.2s ease-out forwards',
      },
      boxShadow: {
        // One elevation, reserved for things that genuinely float. Flat surfaces
        // use a hairline border instead — eleven cards previously carried both.
        modal: '0 12px 32px -8px rgba(28, 30, 23, 0.22), 0 2px 6px rgba(28, 30, 23, 0.06)',
      },
    },
  },
  plugins: [],
};
