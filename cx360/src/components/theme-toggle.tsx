"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  // Read the actual applied state (set synchronously by ThemeInit before
  // this component even mounts) rather than re-deriving it, so the icon
  // always matches what's really on screen.
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("cx360-theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="w-9 h-9 rounded-full grid place-items-center hover:bg-ink-950/5 dark:hover:bg-surface/10"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
