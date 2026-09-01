/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'om-cream': '#FAF7F0',
        'om-gold': '#C9A84C',
        'om-gold-dark': '#9E7D2C',
        'om-parchment': '#F0E8D0',
        'om-tan': '#D4C5A0',
        'om-forest': '#2D5A3D',
        'om-forest-dark': '#1A3A26',
        'om-forest-deep': '#0F2218',
        'om-mahogany': '#5C3D26',
        'om-brown': '#8B6347',
      },
      fontFamily: {
        'display': ['Playfair Display', 'Georgia', 'serif'],
        'body': ['EB Garamond', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};