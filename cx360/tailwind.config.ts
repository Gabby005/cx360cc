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
          DEFAULT: "#5B5FEF", // indigo — modern helpdesk accent
          light: "#EEEEFE",
          dark: "#4547C4",
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
