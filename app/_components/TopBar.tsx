"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/designer", label: "Designer dashboard" },
  { href: "/nikhil", label: "Nikhil dashboard" },
];

/** The cream bar that floats over the hero. The current area is underlined. */
export function TopBar() {
  const path = usePathname();
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Aangan Studio, home">AANGAN</Link>
      <nav aria-label="Main">
        {LINKS.map((l) => {
          const here = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (<Link key={l.href} href={l.href} aria-current={here ? "page" : undefined}>{l.label}</Link>);
        })}
      </nav>
    </header>
  );
}
