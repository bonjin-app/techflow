"use client";

import { useMemo } from "react";
import { useLocalRaw } from "@/lib/useLocal";

const KEY = "tf:challenges";

/**
 * Whether this browser has answered a challenge, and rightly. The slot is the
 * same width either way, so the list does not shift when answers load after
 * hydration.
 */
export function ChallengeMark({ id, right }: { id: string; right: number[] }) {
  const raw = useLocalRaw(KEY);
  const chosen = useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as Record<string, number>)[id] : undefined;
    } catch {
      return undefined;
    }
  }, [raw, id]);
  const state = chosen === undefined ? null : right.includes(chosen) ? "right" : "wrong";
  return (
    <span className={`inline-block w-4 shrink-0 ${state === "right" ? "text-ok" : "text-danger"}`}>
      {state && <span aria-hidden>{state === "right" ? "✓" : "✗"}</span>}
      {state && <span className="sr-only">{state === "right" ? "answered correctly: " : "answered wrongly: "}</span>}
    </span>
  );
}
