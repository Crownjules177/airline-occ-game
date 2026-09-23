"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Space sections">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
