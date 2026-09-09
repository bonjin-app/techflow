"use client";

import { useMemo } from "react";
import { useLocalRaw } from "@/lib/useLocal";

const KEY = "tf:battles"; // { [comparisonId]: subjectId }

/** "Which one would you choose?" — a local-only vote that nudges the reader to commit before reading. */
export function Battle({ id, subjects }: { id: string; subjects: { id: string; name: string }[] }) {
  const raw = useLocalRaw(KEY);
  const votes = useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {} as Record<string, string>;
    }
  }, [raw]);
  const mine = votes[id];

  const vote = (subject: string) => {
    try {
      const next = { ...votes, [id]: subject };
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("tf:storage", { detail: { key: KEY } }));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
      <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Tech battle</span>
      <span className="text-fg-muted">{mine ? "You picked" : "Before you read — which would you choose?"}</span>
      <div className="flex gap-2">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => vote(s.id)}
            aria-pressed={mine === s.id}
            className={`rounded-md border px-3 py-1 font-medium transition-colors ${mine === s.id ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"}`}
          >
            {s.name}
          </button>
        ))}
      </div>
      {mine && <span className="text-xs text-fg-faint">Now check whether the decision tree agrees. Saved locally only.</span>}
    </div>
  );
}
