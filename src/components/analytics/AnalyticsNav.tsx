"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/live", label: "Live View" },
];

export function AnalyticsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
              isActive
                ? "bg-(--analytics-accent-dim) text-(--analytics-accent)"
                : "text-(--analytics-t2) hover:bg-(--analytics-surface) hover:text-(--analytics-t1)"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
