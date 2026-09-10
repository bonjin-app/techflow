"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { NodeSummary } from "@/lib/content/types";
import { TYPE_LABEL } from "@/lib/content/types";
import { groupByType, searchNodes } from "@/lib/search";
import { useSearchIndex } from "@/lib/useSearchIndex";
import { getRecent } from "@/lib/local";
import { OPEN_PALETTE_EVENT } from "./PaletteButton";
import { nav } from "@/lib/site";
import { PLAYGROUNDS } from "@/app/playground/registry";

/** Interactive tools and index pages that are not knowledge-graph nodes. */
const TOOLS: { label: string; href: string; hint: string }[] = [
  ...PLAYGROUNDS.map((p) => ({ label: p.title, href: `/playground/${p.slug}`, hint: "playground" })),
  { label: "Mind map", href: "/map", hint: "mind map" },
  { label: "Real-world stacks", href: "/stack", hint: "stacks" },
  { label: "Technology radar", href: "/radar", hint: "radar" },
  { label: "Design challenges", href: "/challenge", hint: "practice" },
  { label: "JSON API", href: "/api-docs", hint: "api" },
];

interface Command {
  id: string;
  label: string;
  hint?: string;
  href?: string;
  action?: () => void;
  group: string;
  type?: NodeSummary["type"];
  tagline?: string;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /** The index is a static JSON file; fetch it the first time the palette opens. */
  const [wanted, setWanted] = useState(false);
  const index = useSearchIndex(wanted);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState<NodeSummary[]>([]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const q = (e as CustomEvent<{ query?: string }>).detail?.query ?? "";
      setQuery(q);
      setWanted(true);
      setOpen(true);
      const ids = getRecent().map((r) => r.id);
      setRecent(ids.map((id) => index.find((n) => n.id === id)).filter(Boolean) as NodeSummary[]);
    };
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
  }, [index]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = "hidden";
    } else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const random = useCallback(() => {
    const pool = index.filter((n) => ["technology", "concept", "pattern"].includes(n.type));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) router.push(pick.href);
  }, [index, router]);

  const commands = useMemo<Command[]>(() => {
    const q = query.trim();
    const out: Command[] = [];
    if (!q) {
      if (recent.length)
        for (const r of recent.slice(0, 5))
          out.push({ id: `recent:${r.id}`, label: r.name, tagline: r.tagline, href: r.href, group: "Recent", type: r.type });
      out.push({ id: "random", label: "Surprise me", hint: "random technology or concept", action: random, group: "Actions" });
      out.push({ id: "explore", label: "Explore the knowledge graph", href: "/explore", group: "Actions", hint: "G then E" });
      for (const t of TOOLS) out.push({ id: `tool:${t.href}`, label: t.label, href: t.href, hint: t.hint, group: "Tools" });
      out.push({ id: "challenge", label: "Today's design challenge", href: "/challenge", group: "Actions" });
      for (const n of nav) out.push({ id: `nav:${n.href}`, label: n.label, href: n.href, group: "Go to", hint: `G then ${n.key.toUpperCase()}` });
      return out;
    }
    const hits = searchNodes(index, q, 30);
    for (const g of groupByType(hits)) {
      for (const it of g.items)
        out.push({ id: it.id, label: it.name, tagline: it.tagline, href: it.href, group: TYPE_LABEL[g.type], type: it.type });
    }
    const ql = q.toLowerCase();
    for (const t of TOOLS) {
      if (t.label.toLowerCase().includes(ql) || t.hint.includes(ql)) {
        out.push({ id: `tool:${t.href}`, label: t.label, href: t.href, hint: t.hint, group: "Tools" });
      }
    }
    if (out.length === 0) {
      out.push({ id: "search", label: `Search “${q}”`, href: `/search?q=${encodeURIComponent(q)}`, group: "Search" });
    }
    return out;
  }, [query, index, recent, random]);

  useEffect(() => {
    const activeEl = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = useCallback(
    (c: Command) => {
      close();
      if (c.action) c.action();
      else if (c.href) router.push(c.href);
    },
    [close, router],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(commands.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = commands[active];
      if (c) run(c);
      else if (query.trim()) {
        close();
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  if (!open) return null;

  let lastGroup = "";
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="animate-fade-up w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-md"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-faint" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Search technologies, concepts, architectures…"
            className="h-12 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-faint"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={commands[active] ? `cmd-${commands[active].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {commands.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header && (
                  <div className="px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">{header}</div>
                )}
                <button
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(c)}
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm ${
                    i === active ? "bg-accent-soft text-fg" : "text-fg-muted"
                  }`}
                >
                  {c.type ? (
                    <span data-type={c.type} className="size-2 shrink-0 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                  ) : (
                    <span className="size-2 shrink-0 rounded-full bg-border-strong" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-fg">{c.label}</span>
                    {c.tagline && <span className="ml-2 hidden truncate text-xs text-fg-faint sm:inline">{c.tagline}</span>}
                  </span>
                  {c.hint && <span className="shrink-0 text-xs text-fg-faint">{c.hint}</span>}
                  {i === active && <kbd>↵</kbd>}
                </button>
              </div>
            );
          })}
          {commands.length === 0 && <div className="px-3 py-6 text-center text-sm text-fg-faint">No results</div>}
        </div>
      </div>
    </div>
  );
}
