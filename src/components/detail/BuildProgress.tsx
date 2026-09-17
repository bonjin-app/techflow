"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useGraphApi } from "@/lib/useGraphApi";
import { useLocalRaw } from "@/lib/useLocal";
import { KEYS } from "@/lib/local";

/**
 * A build goal is a list of pages. Crossing it with what the reader has ticked
 * turns the list into a position: how far in they are, and the next thing to
 * read. Hidden until there is something to say, so a first-time visitor is not
 * shown a zero.
 */
export function BuildProgress({ name, ids }: { name: string; ids: string[] }) {
  const { graph } = useGraphApi();
  const knownRaw = useLocalRaw(KEYS.known);
  const known = useMemo(() => {
    if (!knownRaw) return null;
    try {
      return new Set(JSON.parse(knownRaw) as string[]);
    } catch {
      return null;
    }
  }, [knownRaw]);

  if (!known || !graph) return null;
  const unique = [...new Set(ids)].filter((id) => graph.nodes.has(id));
  const covered = unique.filter((id) => known.has(id));
  if (covered.length === 0) return null;

  const next = unique.find((id) => !known.has(id));
  const nextNode = next ? graph.nodes.get(next) : undefined;
  const pct = Math.round((covered.length / unique.length) * 100);

  return (
    <div className="mb-8 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-fg">
          You have ticked {covered.length} of the {unique.length} pages {name} needs
        </span>
        <Link href="/you" className="text-xs text-accent hover:underline">
          What can I read next? →
        </Link>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      {nextNode && (
        <p className="mt-2 text-xs text-fg-muted">
          Next unread on this list:{" "}
          <Link href={nextNode.href} className="text-accent hover:underline">
            {nextNode.name}
          </Link>{" "}
          — {nextNode.tagline}
        </p>
      )}
    </div>
  );
}
