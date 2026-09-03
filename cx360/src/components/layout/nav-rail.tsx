"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Users,
  Inbox,
  Headset,
  BookOpen,
  BarChart3,
  Settings,
  Workflow,
} from "lucide-react";
import clsx from "clsx";

const ITEMS = [
  { href: "/dashboard", icon: LayoutGrid, label: "Overview" },
  { href: "/inbox", icon: Inbox, label: "Omnichannel inbox" },
  { href: "/agent-workspace", icon: Headset, label: "Agent workspace" },
  { href: "/cases", icon: Inbox, label: "Cases" },
  { href: "/customers", icon: Users, label: "Customers" },
  { href: "/knowledge", icon: BookOpen, label: "Knowledge base" },
  { href: "/workflows", icon: Workflow, label: "Workflows" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
] as const;

export function NavRail({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="w-16 shrink-0 bg-ink-950 flex flex-col items-center py-4 gap-1"
    >
      <div
        aria-hidden
        className="w-8 h-8 rounded bg-brand text-white grid place-items-center font-mono text-xs font-semibold mb-4"
      >
        CX
      </div>

      {ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={label}
            className={clsx(
              "w-11 h-11 rounded-lg grid place-items-center transition-colors group relative",
              active ? "bg-brand text-white" : "text-surface/50 hover:bg-ink-800 hover:text-surface"
            )}
          >
            <Icon size={18} strokeWidth={2} />
            <span className="sr-only">{label}</span>
          </Link>
        );
      })}

      <div className="mt-auto">
        {role === "ADMIN" && (
          <Link
            href="/admin"
            title="Admin centre"
            className="w-11 h-11 rounded-lg grid place-items-center text-surface/50 hover:bg-ink-800 hover:text-surface transition-colors"
          >
            <Settings size={18} />
            <span className="sr-only">Admin centre</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
