/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        coorg: {
          50:  "#f1faf3",
          100: "#dcf2e1",
          200: "#bce5c7",
          300: "#8dd1a3",
          400: "#57b67a",
          500: "#2f9b58",
          600: "#1f7d44",
          700: "#1a6338",
          800: "#174f2e",
          900: "#134026",
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
