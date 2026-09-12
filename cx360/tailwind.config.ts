import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B0F1A", // dark-mode page background only
          900: "#141928",
          800: "#1C2333",
          700: "#232B3D",
        },
        surface: {
          DEFAULT: "#F6F7FB", // light, cool page background (not stark white)
          raised: "#FFFFFF", // cards, panels
        },
        line: {
          light: "#E7E9F0",
          dark: "#28304A",
        },
        brand: {
          // rgb(var(...) / <alpha-value>) lets Tailwind's opacity utilities
          // (bg-brand/10, text-brand/70, etc.) keep working while the base
          // color itself comes from a CSS var injected per-tenant at
          // runtime (see src/lib/theme.ts) — falls back to the indigo
          // default via the var()'s second argument if nothing injected it.
          DEFAULT: "rgb(var(--brand-rgb, 91 95 239) / <alpha-value>)",
          light: "rgb(var(--brand-light-rgb, 238 238 254) / <alpha-value>)",
          dark: "rgb(var(--brand-dark-rgb, 69 71 196) / <alpha-value>)",
        },
        sla: {
          ok: "#16A34A",
          warning: "#D97706",
          breach: "#DC2626",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "10px",
        lg: "16px",
        xl: "20px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)",
        popover: "0 4px 6px -2px rgb(16 24 40 / 0.05), 0 12px 16px -4px rgb(16 24 40 / 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
