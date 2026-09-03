"use client";

import { Search, Bell, ChevronDown } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "next-auth";

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
    <header className="h-14 shrink-0 border-b border-line-light dark:border-line-dark flex items-center gap-4 px-4">
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-950/40 dark:text-surface/40"
          />
          <input
            id="global-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers, cases, articles…"
            className="w-full pl-8 pr-14 py-1.5 text-sm rounded border border-line-light dark:border-line-dark bg-surface dark:bg-ink-900 focus-visible:outline-none"
          />
          <span className="kbd absolute right-2 top-1/2 -translate-y-1/2">⌘K</span>
        </div>
      </form>

      <div className="flex-1" />

      <button
        aria-label="Notifications"
        className="w-8 h-8 rounded grid place-items-center hover:bg-surface dark:hover:bg-ink-900 relative"
      >
        <Bell size={16} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-sla-breach" />
      </button>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="flex items-center gap-2 pl-2 pr-1 py-1 rounded hover:bg-surface dark:hover:bg-ink-900 text-sm"
        >
          <span className="w-6 h-6 rounded-full bg-brand-light text-brand-dark grid place-items-center text-xs font-medium">
            {user.name?.[0]?.toUpperCase() ?? "U"}
          </span>
          <span className="hidden sm:inline">{user.name}</span>
          <ChevronDown size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 w-44 card shadow-lg py-1 z-20">
            <div className="px-3 py-2 text-xs text-ink-950/50 dark:text-surface/50 border-b border-line-light dark:border-line-dark">
              {user.tenantName} · {user.role}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface dark:hover:bg-ink-800"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
