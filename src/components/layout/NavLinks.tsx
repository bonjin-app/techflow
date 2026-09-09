"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: readonly { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
              active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </>
  );
}
