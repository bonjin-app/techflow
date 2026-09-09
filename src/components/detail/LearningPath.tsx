"use client";

import Link from "next/link";
import { useMemo } from "react";
import { KEYS, setKnown } from "@/lib/local";
import { useLocalRaw } from "@/lib/useLocal";
import type { NodeType } from "@/lib/content/types";

export interface PathItem {
  id?: string;
  label: string;
  href?: string;
  type?: NodeType;
  note?: string;
  stage?: string;
}

/**
 * Ordered learning path with "I know this" checkboxes persisted in
 * localStorage. Items with a node id link to their page.
 */
export function LearningPath({ items, currentId, title = "You should know" }: { items: PathItem[]; currentId?: string; title?: string }) {
  const raw = useLocalRaw(KEYS.known);
  const hydrated = raw !== undefined;
  const known = useMemo(() => {
    try {
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  }, [raw]);

  const keyOf = (it: PathItem) => it.id ?? `label:${it.label}`;
  const toggle = (it: PathItem) => {
    const k = keyOf(it);
    const next = !known.has(k);
    setKnown(k, next);
  };

  const done = items.filter((it) => known.has(keyOf(it))).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  // Stage header shown on the first item of each stage.
  const stageHeaders: (string | null)[] = [];
  for (let i = 0, last: string | undefined; i < items.length; i++) {
    const st = items[i].stage;
    stageHeaders.push(st && st !== last ? st : null);
    if (st) last = st;
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-fg-faint">Tick what you already know — saved in this browser.</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm tabular-nums">{hydrated ? `${done}/${items.length}` : `–/${items.length}`}</div>
          <div className="mt-1 h-1 w-24 overflow-hidden rounded bg-border">
            <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${hydrated ? pct : 0}%` }} />
          </div>
        </div>
      </div>
      <ol className="p-2">
        {items.map((it, i) => {
          const k = keyOf(it);
          const checked = known.has(k);
          const isCurrent = it.id && it.id === currentId;
          const stageHeader = stageHeaders[i];
          return (
            <li key={k + i}>
              {stageHeader && (
                <div className="px-2 pb-1 pt-3 font-mono text-[10px] uppercase tracking-wider text-fg-faint first:pt-1">{stageHeader}</div>
              )}
              <div
                className={`flex items-start gap-3 rounded-md px-2 py-1.5 ${isCurrent ? "bg-accent-soft" : ""}`}
              >
                <label className="mt-0.5 inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(it)}
                    className="size-4 accent-[var(--accent)]"
                    aria-label={`I know ${it.label}`}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-[10px] text-fg-faint">{String(i + 1).padStart(2, "0")}</span>
                    {it.href ? (
                      <Link
                        href={it.href}
                        data-type={it.type}
                        className={`text-sm font-medium hover:underline ${checked ? "text-fg-muted line-through decoration-border-strong" : "text-fg"}`}
                      >
                        {it.label}
                      </Link>
                    ) : (
                      <span className={`text-sm font-medium ${checked ? "text-fg-muted line-through decoration-border-strong" : "text-fg"}`}>{it.label}</span>
                    )}
                    {isCurrent && <span className="rounded bg-accent px-1.5 py-px font-mono text-[9px] uppercase text-accent-fg">you are here</span>}
                  </div>
                  {it.note && <div className="text-xs text-fg-muted">{it.note}</div>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
