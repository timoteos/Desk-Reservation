/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mqd: {
          olive: '#4a5e1a',
          'olive-dark': '#3a4a14',
          btn: '#5a7020',
          'btn-dark': '#4a5e18',
          footer: '#1a1c1e',
          'footer-faq': '#5a7020',
        },
      },
    },
  },
  plugins: [],
}

