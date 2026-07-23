/** @type {import('tailwindcss').Config} */

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50:  '#fef8f5',
          100: '#fdeee9',
          200: '#fbd5ca',
          300: '#f0b09a',
          400: '#ea9378',
          500: '#e58568',
          600: '#df7f62',
          700: '#c4664e',
          800: '#a34d36',
          900: '#7a3928',
          950: '#4a1f14',
        },
        forest: {
          50:  '#f0f5f4',
          100: '#d6e3e0',
          200: '#adc7c3',
          300: '#84aba0',
          400: '#5e9086',
          500: '#3d756c',
          600: '#2e5c55',
          700: '#223f3d',
          800: '#1c3332',
          900: '#152726',
          950: '#0d1919',
        },
        sage: {
          50:  '#f4f7f3',
          100: '#e8efe6',
          200: '#c8d9c3',
          300: '#a8c3a0',
          400: '#88ad7d',
          500: '#6a9660',
          600: '#547a4c',
          700: '#405e3a',
          800: '#2d432a',
          900: '#1e2e1d',
          950: '#111b11',
        },
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        zoomIn: {
          '0%': { opacity: 0, transform: 'scale(0.9)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        'spinner-ring': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease-out',
        zoomIn: 'zoomIn 0.4s ease-out',
        'spinner-ring': 'spinner-ring 0.8s linear infinite',
      },
    },
  },
  plugins: [],
}
