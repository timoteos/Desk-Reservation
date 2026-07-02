/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mqd: {
          title: '#4B6B1A',
          btn: '#4a5e1a',
          'btn-hover': '#3a4a14',
          footer: '#232527',
          faq: '#4a5e1a',
        },
      },
    },
  },
  plugins: [],
}

