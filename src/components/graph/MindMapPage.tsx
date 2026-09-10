"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { NodeType } from "@/lib/content/types";
import { MindMap } from "./MindMap";

export interface StartPoint {
  id: string;
  name: string;
  type: NodeType;
}

/**
 * The /map shell. It owns the trail of visited nodes.
 *
 * The centre is mirrored into the URL with `history.replaceState` rather than the
 * router: a router navigation re-renders the route and remounts this component,
 * which threw the trail away on every click. This keeps the link shareable and the
 * walk intact.
 */
export function MindMapPage({ starts }: { starts: StartPoint[] }) {
  const params = useSearchParams();
  const fallback = starts[0]?.id ?? "redis";
  const [trail, setTrail] = useState<string[]>([params.get("focus") ?? fallback]);

  const syncUrl = useCallback((id: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("focus", id);
      window.history.replaceState(null, "", url);
    } catch {
      /* history blocked — the map still works */
    }
  }, []);

  const push = useCallback(
    (id: string) => {
      setTrail((t) => (t[t.length - 1] === id ? t : [...t, id]));
      syncUrl(id);
    },
    [syncUrl],
  );

  const back = useCallback(
    (index: number) => {
      setTrail((t) => {
        const next = t.slice(0, index + 1);
        syncUrl(next[next.length - 1]);
        return next;
      });
    },
    [syncUrl],
  );

  const restart = useCallback(
    (id: string) => {
      setTrail([id]);
      syncUrl(id);
    },
    [syncUrl],
  );

  const focusId = trail[trail.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-fg-faint">Start from a hub:</span>
        {starts.map((s) => (
          <button
            key={s.id}
            type="button"
            data-type={s.type}
            onClick={() => restart(s.id)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium transition-colors ${
              focusId === s.id ? "border-accent bg-accent-soft text-fg" : "border-border text-fg-muted hover:text-fg"
            }`}
          >
            <span className="size-1.5 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
            {s.name}
          </button>
        ))}
      </div>
      <MindMap trail={trail} onFocus={push} onBack={back} />
    </div>
  );
}
