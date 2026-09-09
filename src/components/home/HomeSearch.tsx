"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { NodeSummary } from "@/lib/content/types";
import { TYPE_LABEL } from "@/lib/content/types";
import { groupByType, searchNodes } from "@/lib/search";

/** Hero search: instant grouped results underneath, Enter → /search. */
export function HomeSearch({ index, suggestions }: { index: NodeSummary[]; suggestions: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const groups = useMemo(() => (q.trim() ? groupByType(searchNodes(index, q, 12)) : []), [q, index]);
  const flat = groups.flatMap((g) => g.items);
  const [active, setActive] = useState(0);

  const submit = () => {
    const pick = flat[active];
    if (pick) router.push(pick.href);
    else if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div
        className={`flex items-center gap-3 rounded-xl border bg-surface px-4 shadow-sm transition-colors ${
          focus ? "border-accent ring-4 ring-[var(--ring)]/30" : "border-border"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-fg-faint" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(flat.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          placeholder="Search technologies, concepts, architectures…"
          className="h-14 w-full bg-transparent text-base text-fg outline-none placeholder:text-fg-faint sm:text-lg"
          aria-label="Search TechFlow"
          role="combobox"
          aria-expanded={focus && flat.length > 0}
          aria-controls="home-search-results"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="hidden sm:inline-flex">/</kbd>
      </div>

      {focus && q.trim() && (
        <div
          id="home-search-results"
          role="listbox"
          className="animate-fade-up absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-border bg-surface shadow-md"
        >
          {groups.length === 0 && <div className="px-4 py-4 text-sm text-fg-faint">No matches — press Enter to search everything.</div>}
          {groups.map((g) => (
            <div key={g.type} className="border-b border-border last:border-0">
              <div className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">{TYPE_LABEL[g.type]}</div>
              {g.items.map((it) => {
                const i = flat.indexOf(it);
                return (
                  <Link
                    key={it.id}
                    href={it.href}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    data-type={it.type}
                    className={`flex items-baseline gap-2 px-4 py-1.5 text-sm ${i === active ? "bg-accent-soft" : ""}`}
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                    <span className="font-medium text-fg">{it.name}</span>
                    <span className="truncate text-xs text-fg-faint">{it.tagline}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-fg-faint">
        <span>Try</span>
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => setQ(s)} className="rounded px-1 font-mono text-fg-muted hover:text-fg">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
