import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0E1420",
          900: "#161C29",
          800: "#1F2736",
          700: "#232B3B",
        },
        surface: {
          DEFAULT: "#F7F7F5",
          raised: "#FFFFFF",
        },
        line: {
          light: "#E3E1DA",
          dark: "#232B3B",
        },
        brand: {
          DEFAULT: "#2F6F5E",
          light: "#DCEAE5",
          dark: "#255A4C",
        },
        sla: {
          ok: "#2F6F5E",
          warning: "#C97A2B",
          breach: "#B93A3A",
        },
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
