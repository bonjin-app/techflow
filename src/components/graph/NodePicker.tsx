"use client";

import { useId, useMemo, useState } from "react";
import type { ApiNode } from "@/lib/useGraphApi";
import { TYPE_LABEL } from "@/lib/content/types";

/** Typeahead over the graph's nodes. Keyboard-operable, no dependencies. */
export function NodePicker({
  label,
  nodes,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  nodes: ApiNode[];
  value: ApiNode | undefined;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 8);
    // "kaf" must offer Apache Kafka before Kafka vs RabbitMQ: a prefix of a
    // short name is a better match than a prefix of a long one, the same rule
    // the site's search uses.
    const rank = (n: ApiNode) => {
      const name = n.name.toLowerCase();
      if (name === q || n.id === q) return 0;
      if (n.id.startsWith(q) || name.startsWith(q)) return 1;
      return 2;
    };
    return nodes
      .filter((n) => n.name.toLowerCase().includes(q) || n.id.includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length || b.degree - a.degree)
      .slice(0, 8);
  }, [nodes, query]);

  const pick = (n: ApiNode) => {
    onChange(n.id);
    setQuery("");
    setOpen(false);
    setCursor(0);
  };

  return (
    <div className="relative">
      <label className="block text-xs text-fg-muted" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[cursor] ? `${listId}-opt-${matches[cursor].id}` : undefined}
        value={query || (open ? "" : (value?.name ?? ""))}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setCursor((c) => Math.min(c + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter" && open && matches[cursor]) {
            e.preventDefault();
            pick(matches[cursor]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      {open && matches.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-bg p-1 shadow-lg">
          {matches.map((n, i) => (
            <li key={n.id} id={`${listId}-opt-${n.id}`} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(n)}
                onMouseEnter={() => setCursor(i)}
                data-type={n.type}
                className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm ${i === cursor ? "bg-surface" : ""}`}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                <span className="font-medium text-fg">{n.name}</span>
                <span className="truncate text-xs text-fg-faint">{TYPE_LABEL[n.type]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
