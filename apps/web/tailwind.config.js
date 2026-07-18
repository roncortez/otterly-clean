/** @type {import('tailwindcss').Config} */

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        anton: ["Anton", "sans-serif"],
        raleway: ["Raleway", "sans-serif"],
        paytone: ['"Paytone One"', 'sans-serif'],
        comfortaa: ['Comfortaa', 'cursive']
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
      },
      animation: {
        fadeIn: 'fadeIn 0.5s ease-out',
        zoomIn: 'zoomIn 0.5s ease-out',
      },
    },

  },
  plugins: [
    require('@tailwindcss/line-clamp')
  ],
}

