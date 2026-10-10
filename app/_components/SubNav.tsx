"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The sub-page links of a dashboard. The current page is marked. */
export function SubNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="subnav" aria-label="Sub pages">
      {items.map((i) => {
        const here = i.href === path || (i.href !== "/designer" && i.href !== "/nikhil" && path.startsWith(i.href));
        return (<Link key={i.href} href={i.href} aria-current={here ? "page" : undefined}>{i.label}</Link>);
      })}
    </nav>
  );
}
