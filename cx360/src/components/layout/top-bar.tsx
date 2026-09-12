"use client";

import { Search, Bell, ChevronDown } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "next-auth";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopBar({ user }: { user: Session["user"] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // Cmd/Ctrl+K focuses global search — the command-palette entry point.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/customers?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="h-16 shrink-0 bg-surface-raised dark:bg-ink-900 border-b border-line-light dark:border-line-dark flex items-center gap-4 px-6">
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-950/40 dark:text-surface/40"
          />
          <input
            id="global-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers, cases, articles…"
            className="w-full pl-9 pr-14 py-2 text-sm rounded-full border border-line-light dark:border-line-dark bg-surface dark:bg-ink-800 focus-visible:outline-none"
          />
          <span className="kbd absolute right-2.5 top-1/2 -translate-y-1/2">⌘K</span>
        </div>
      </form>

      <div className="flex-1" />

      <ThemeToggle />

      <button
        aria-label="Notifications"
        className="w-9 h-9 rounded-full grid place-items-center hover:bg-ink-950/5 dark:hover:bg-surface/10 relative"
      >
        <Bell size={17} />
        <span className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-sla-breach ring-2 ring-surface-raised dark:ring-ink-900" />
      </button>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-full hover:bg-ink-950/5 dark:hover:bg-surface/10 text-sm"
        >
          <span className="avatar w-7 h-7 text-xs">{user.name?.[0]?.toUpperCase() ?? "U"}</span>
          <span className="hidden sm:inline font-medium">{user.name}</span>
          <ChevronDown size={14} className="text-ink-950/40 dark:text-surface/40" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-48 card shadow-popover py-1.5 z-20">
            <div className="px-3 py-2 text-xs text-ink-950/50 dark:text-surface/50 border-b border-line-light dark:border-line-dark mb-1">
              {user.tenantName} · {user.role}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full text-left px-3 py-1.5 rounded-md mx-1 text-sm hover:bg-ink-950/5 dark:hover:bg-surface/10"
              style={{ width: "calc(100% - 8px)" }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
