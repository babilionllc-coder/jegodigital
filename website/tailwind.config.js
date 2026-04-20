/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./js/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        'brand-gray': 'rgba(139,148,158,0.8)',
      },
    },
  },
  plugins: [],
}
