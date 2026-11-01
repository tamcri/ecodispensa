/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Palette del marchio: "emerald" ridefinito sul verde di EcoDispensa,
        // così anche le parti non ridisegnate restano coerenti.
        emerald: {
          50: "#EEF8F1",
          100: "#DCF0E2",
          200: "#B9E1C6",
          300: "#8BCDA3",
          400: "#52B07A",
          500: "#2E9A5E",
          600: "#1E8A4E",
          700: "#18703F",
          800: "#155A34",
          900: "#163828",
        },
        ink: "#17201A",
        muted: "#5E6B62",
        ground: "#F4F5EF",
        forest: "#163828",
        lemon: "#FFD84A",
        tangerine: "#FF8A3D",
        peach: "#FFE6D3",
        mint: "#DCF0E2",
        stone: "#ECEDE8",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Bricolage Grotesque"', '"Plus Jakarta Sans"', "ui-sans-serif", "sans-serif"],
      },
      borderRadius: {
        "4xl": "1.75rem",
      },
      keyframes: {
        "slide-up": {
          from: { transform: "translateY(24px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        pop: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.28s cubic-bezier(.2,.8,.2,1)",
        "fade-in": "fade-in 0.2s ease-out",
        pop: "pop 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
