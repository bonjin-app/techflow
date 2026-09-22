"use client";

import { useEffect, useRef, useState } from "react";

export interface TocEntry {
  id: string;
  label: string;
}

/**
 * The contents list, marking where the reader currently is.
 *
 * A static list of links is fine on a short page and useless on a long one —
 * these run to ten or more sections, and without a mark the list says what the
 * page contains but not where you are in it.
 *
 * The heading nearest the top of the viewport wins, rather than whichever one
 * an observer happened to fire for last: with several sections on screen at
 * once those disagree, and the result flickers.
 */
export function TableOfContents({ entries }: { entries: TocEntry[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const targets = entries.map((e) => document.getElementById(e.id)).filter((el): el is HTMLElement => !!el);
    if (targets.length === 0) return;

    const pick = () => {
      // The reading line. Not a fixed offset: clicking a contents link leaves
      // the heading at its `scroll-margin-top` *plus* the sticky header, which
      // came to 160px here — a 96px line put the section you had just jumped to
      // on the wrong side of it and marked the previous one. A share of the
      // viewport holds wherever those two numbers land.
      const line = Math.max(140, window.innerHeight * 0.3);
      let best: { id: string; top: number } | null = null;
      for (const el of targets) {
        const top = el.getBoundingClientRect().top;
        if (top - line > 0) continue; // not reached yet
        if (!best || top > best.top) best = { id: el.id, top };
      }
      // Before the first heading, the reader is still in the opening section.
      setActive(best?.id ?? targets[0].id);
    };

    pick();
    const observer = new IntersectionObserver(pick, { threshold: [0, 1] });
    for (const el of targets) observer.observe(el);
    // A heading can leave and re-enter without crossing a threshold when the
    // reader scrolls fast, so the scroll position is the backstop.
    window.addEventListener("scroll", pick, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", pick);
    };
  }, [entries]);

  return (
    <nav aria-label="On this page" className="sticky top-20 text-sm">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">On this page</div>
      <ul className="space-y-1 border-l border-border">
        {entries.map((t) => {
          const here = t.id === active;
          return (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                aria-current={here ? "location" : undefined}
                className={`-ml-px block border-l py-0.5 pl-3 transition-colors ${
                  here ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:border-fg hover:text-fg"
                }`}
              >
                {t.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The same contents on a phone, where the sidebar is hidden.
 *
 * A page here runs to nine screens on a 375px viewport, and without this a
 * reader has no overview of it and no way to jump — only scrolling. A native
 * `details` needs no JavaScript to open, is keyboard operable and announces its
 * own state; the only script is closing it after a jump, so the reader lands on
 * the section rather than on a list still covering it.
 */
export function TableOfContentsCompact({ entries }: { entries: TocEntry[] }) {
  const box = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={box} className="rounded-lg border border-border bg-surface lg:hidden">
      <summary className="cursor-pointer px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-fg-faint marker:text-fg-faint">
        On this page — {entries.length} sections
      </summary>
      <ul className="space-y-1 border-t border-border px-4 py-3 text-sm">
        {entries.map((t) => (
          <li key={t.id}>
            <a
              href={`#${t.id}`}
              onClick={() => {
                if (box.current) box.current.open = false;
              }}
              className="block py-0.5 text-fg-muted hover:text-fg"
            >
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
