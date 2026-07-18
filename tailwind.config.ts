import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        bg: "var(--bg)",
        panel: "var(--panel)",
        hairline: "var(--hairline)",
        amber: "var(--amber)",
        ice: "var(--ice)",
        signal: "var(--signal)",
        success: "var(--success)",
        muted: "var(--muted)",
        paper: "var(--paper)",
      },
      fontFamily: {
        display: ["var(--font-archivo-black)", "var(--font-archivo)", "sans-serif"],
        heading: ["var(--font-archivo)", "sans-serif"],
        sans: ["var(--font-plex-sans)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-top": {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.85)" },
          "60%": { opacity: "1", transform: "scale(1.04)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 currentColor" },
          "50%": { opacity: "0.55" },
        },
        "sweep-in": {
          "0%": { opacity: "0", transform: "translateY(-100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 280ms ease-out both",
        "slide-in-top": "slide-in-top 260ms cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-right": "slide-in-right 240ms cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-up": "slide-in-up 320ms cubic-bezier(0.16,1,0.3,1) both",
        "pop-in": "pop-in 340ms cubic-bezier(0.34,1.56,0.64,1) both",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "sweep-in": "sweep-in 320ms cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
