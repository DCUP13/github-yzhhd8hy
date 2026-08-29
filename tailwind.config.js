/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'om-cream': '#f5f1e8',
        'om-parchment': '#ede4d3',
        'om-tan': '#c9b99a',
        'om-brown': '#8b7355',
        'om-mahogany': '#6b4423',
        'om-gold': '#b8860b',
        'om-gold-dark': '#9a7308',
        'om-forest': '#2d4a3e',
        'om-forest-dark': '#1f3329',
        'om-forest-deep': '#173527',
        'om-black': '#1a1a1a',
      },
      fontFamily: {
        display: ['"EB Garamond"', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
