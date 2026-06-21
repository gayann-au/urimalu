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
        },
        // Urimalu landing brand scales. New tokens. The existing coorg token
        // above is left exactly as is, not renamed or reused.
        chilli: {
          50:  "#FFF1F2",
          100: "#FFE1E3",
          200: "#FFC7CB",
          300: "#FB9CA4",
          400: "#F26876",
          500: "#E23A4C",
          600: "#D6263A",
          700: "#B3132A",
          800: "#8F1224",
          900: "#6E121F",
        },
        crop: {
          50:  "#F1FAF3",
          100: "#DCF2E1",
          200: "#BCE5C7",
          300: "#8DD1A3",
          400: "#57B67A",
          500: "#2F9B58",
          600: "#1F7D44",
          700: "#1A6338",
          800: "#174F2E",
          900: "#134026",
        },
        ember: {
          300: "#FFC078",
          400: "#FF9A47",
          500: "#FF6A1A",
        },
        // Warm cream surfaces and a warm near-black "ink" scale, lifted from the
        // landing design system so the whole app shares one palette. The gray
        // override below remaps every existing gray utility to the warm ink
        // scale, so all neutrals across the app turn warm with no per file edits.
        paper: "#FBF9F7",
        "paper-2": "#F4F0EC",
        card: "#FFFFFF",
        ink: {
          100: "#F0EAE5",
          200: "#E6DED8",
          300: "#C8BEB8",
          500: "#8A7D78",
          600: "#6B5E5A",
          700: "#4B403D",
          800: "#2A211F",
          900: "#1A1413",
        },
        gray: {
          50:  "#FAF7F4",
          100: "#F0EAE5",
          200: "#E6DED8",
          300: "#C8BEB8",
          400: "#A89E98",
          500: "#8A7D78",
          600: "#6B5E5A",
          700: "#4B403D",
          800: "#2A211F",
          900: "#1A1413",
          950: "#120D0C",
        },
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Hanken Grotesk"', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
