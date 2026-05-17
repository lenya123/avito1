import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // iOS 26 Liquid Glass palette
        primary: "var(--bg-primary)",
        secondary: "var(--bg-secondary)",
        glass: "var(--bg-glass)",
        "accent-blue": "var(--accent-blue)",
        "accent-green": "var(--accent-green)",
        "accent-red": "var(--accent-red)",
        "accent-orange": "var(--accent-orange)",
        "accent-purple": "var(--accent-purple)",
        "accent-pink": "var(--accent-pink)",
        "accent-teal": "var(--accent-teal)",
        "accent-indigo": "var(--accent-indigo)",
        "accent-telegram": "#229ED9",
        "level-1": "var(--level-1-color)",
        "level-2": "var(--level-2-color)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        border: "var(--border-color)",
      },
      borderColor: {
        glass: {
          DEFAULT: "var(--border-color-default)",
          minimal: "var(--border-color-minimal)",
          subtle: "var(--border-color-subtle)",
          active: "var(--border-color-active)",
          strong: "var(--border-color-strong)",
          glow: "var(--border-color-glow)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      backdropBlur: {
        glass: "20px",
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.37)",
        "glass-sm": "0 4px 16px rgba(0, 0, 0, 0.25)",
        card: "0 4px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        "card-hover": "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
        "glass-inset": "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        "button-primary":
          "0 4px 12px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(10, 132, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -1px 0 rgba(0, 0, 0, 0.1)",
        modal:
          "0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -1px 0 rgba(0, 0, 0, 0.15)",
      },
      borderRadius: {
        glass: "16px",
        "glass-lg": "24px",
      },
    },
  },
  plugins: [],
};

export default config;
