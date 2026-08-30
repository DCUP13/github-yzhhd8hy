/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'om-cream': '#FDF8F0',
        'om-parchment': '#F5EDDD',
        'om-tan': '#D4C5A9',
        'om-gold': {
          DEFAULT: '#C9A227',
          dark: '#A8841C',
        },
        'om-forest': {
          DEFAULT: '#2D4A3E',
          dark: '#1F3A2E',
          deep: '#1A2E25',
        },
        'om-mahogany': '#6B4226',
        'om-brown': '#8B7355',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
