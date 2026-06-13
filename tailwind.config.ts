import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pitch: {
          DEFAULT: "#10b981",
          dark: "#059669",
        },
        gold: "#f5c518",
        ink: {
          900: "#070b16",
          800: "#0a1020",
          700: "#0f1830",
          600: "#16223f",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Oswald", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(16, 185, 129, 0.45)",
        card: "0 20px 60px -25px rgba(0, 0, 0, 0.8)",
      },
      backgroundImage: {
        "host-gradient":
          "linear-gradient(100deg, #006847 0%, #10b981 22%, #0b63ce 55%, #d52b1e 100%)",
        "pitch-radial":
          "radial-gradient(1200px 600px at 50% -10%, rgba(16,185,129,0.18), transparent 60%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "grow-x": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "grow-x": "grow-x 0.8s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
