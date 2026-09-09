"use client";

import Link from "next/link";
import { useMemo } from "react";
import { KEYS, streakFromRaw, type RecentItem } from "@/lib/local";
import { useLocalRaw } from "@/lib/useLocal";
import type { NodeSummary } from "@/lib/content/types";

/** Personal strip: streak + recently viewed (localStorage only, hidden until hydrated / when empty). */
export function StreakBadge({ index }: { index: NodeSummary[] }) {
  const recentRaw = useLocalRaw(KEYS.recent);
  const streakRaw = useLocalRaw(KEYS.streak);
  const streak = streakFromRaw(streakRaw).current;
  const recent = useMemo(() => {
    if (!recentRaw) return [] as NodeSummary[];
    try {
      const ids = (JSON.parse(recentRaw) as RecentItem[]).map((r) => r.id);
      return ids.map((id) => index.find((n) => n.id === id)).filter(Boolean).slice(0, 6) as NodeSummary[];
    } catch {
      return [] as NodeSummary[];
    }
  }, [recentRaw, index]);

  if (streak === 0 && recent.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
      {streak > 0 && (
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span aria-hidden>🔥</span> {streak}-day learning streak
        </span>
      )}
      {recent.length > 0 && (
        <span className="flex flex-wrap items-center gap-2 text-fg-muted">
          <span className="text-xs text-fg-faint">Continue:</span>
          {recent.map((r) => (
            <Link key={r.id} href={r.href} data-type={r.type} className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs hover:text-fg">
              <span className="size-1.5 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
              {r.name}
            </Link>
          ))}
        </span>
      )}
    </div>
  );
}
