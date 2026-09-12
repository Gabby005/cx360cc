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
  UsersRound,
  Award,
} from "lucide-react";
import clsx from "clsx";

const ITEMS = [
  { href: "/dashboard", icon: LayoutGrid, label: "Overview" },
  { href: "/inbox", icon: Inbox, label: "Inbox" },
  { href: "/agent-workspace", icon: Headset, label: "Agent workspace" },
  { href: "/cases", icon: Inbox, label: "Cases" },
  { href: "/customers", icon: Users, label: "Customers" },
  { href: "/performance", icon: Award, label: "My performance" },
  { href: "/knowledge", icon: BookOpen, label: "Knowledge base" },
  { href: "/workflows", icon: Workflow, label: "Workflows" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
] as const;

export function NavRail({
  role,
  tenantName,
  logoDataUrl,
}: {
  role: string;
  tenantName?: string;
  logoDataUrl?: string | null;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="w-60 shrink-0 bg-surface-raised dark:bg-ink-900 border-r border-line-light dark:border-line-dark flex flex-col py-4"
    >
      <div className="flex items-center gap-2 px-4 mb-6">
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoDataUrl} alt={tenantName ?? "Logo"} className="w-8 h-8 rounded-lg object-cover shrink-0" />
        ) : (
          <div
            aria-hidden
            className="w-8 h-8 rounded-lg bg-brand text-white grid place-items-center font-semibold text-sm shrink-0"
          >
            CX
          </div>
        )}
        <span className="font-semibold text-sm truncate">{tenantName ?? "CX360"}</span>
      </div>

      <div className="flex-1 px-2 space-y-0.5">
        {ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-brand-light text-brand-dark dark:bg-brand/15 dark:text-brand"
                  : "text-ink-950/60 dark:text-surface/60 hover:bg-ink-950/5 dark:hover:bg-surface/5 hover:text-ink-950 dark:hover:text-surface"
              )}
            >
              <Icon size={17} strokeWidth={2} className="shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}

        {(role === "SUPERVISOR" || role === "ADMIN") && (
          <Link
            href="/team"
            aria-current={pathname?.startsWith("/team") ? "page" : undefined}
            className={clsx(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname?.startsWith("/team")
                ? "bg-brand-light text-brand-dark dark:bg-brand/15 dark:text-brand"
                : "text-ink-950/60 dark:text-surface/60 hover:bg-ink-950/5 dark:hover:bg-surface/5 hover:text-ink-950 dark:hover:text-surface"
            )}
          >
            <UsersRound size={17} strokeWidth={2} className="shrink-0" />
            <span className="truncate">Team</span>
          </Link>
        )}
      </div>

      {role === "ADMIN" && (
        <div className="px-2 pt-2 mt-2 border-t border-line-light dark:border-line-dark">
          <Link
            href="/admin"
            className={clsx(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname?.startsWith("/admin")
                ? "bg-brand-light text-brand-dark dark:bg-brand/15 dark:text-brand"
                : "text-ink-950/60 dark:text-surface/60 hover:bg-ink-950/5 dark:hover:bg-surface/5 hover:text-ink-950 dark:hover:text-surface"
            )}
          >
            <Settings size={17} strokeWidth={2} className="shrink-0" />
            <span>Admin centre</span>
          </Link>
        </div>
      )}
    </nav>
  );
}
