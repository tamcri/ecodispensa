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
        // Palette "cucina di casa": "emerald" ridefinito sulla salvia di EcoDispensa,
        // così anche le parti non ridisegnate restano coerenti.
        emerald: {
          50: "#F2F5EE",
          100: "#E3EBDB",
          200: "#CFDCC6",
          300: "#B2C5A6",
          400: "#8FA884",
          500: "#6F8F66",
          600: "#4F6B4A",
          700: "#42593D",
          800: "#344830",
          900: "#2F4A2C",
        },
        ink: "#1F2A1E",
        muted: "#5F6A5C",
        ground: "#FAF5EA",
        forest: "#2F4A2C",
        lemon: "#F6DC8E",
        honey: "#FBEBC4",
        tangerine: "#D9774F",
        peach: "#F8DDD2",
        mint: "#E3EBDB",
        stone: "#EDE6D6",
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
