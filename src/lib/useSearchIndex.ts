"use client";

import { useEffect, useState } from "react";
import type { NodeSummary } from "./content/types";

/** Prefix for static assets when the site is hosted under a sub-path. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";

let cache: NodeSummary[] | null = null;
let inFlight: Promise<NodeSummary[]> | null = null;

function load(): Promise<NodeSummary[]> {
  if (cache) return Promise.resolve(cache);
  inFlight ??= fetch(`${BASE_PATH}/search-index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<NodeSummary[]>) : []))
    .then((data) => {
      cache = data;
      return data;
    })
    .catch(() => []);
  return inFlight;
}

/**
 * The knowledge-graph search index, fetched once per browser session and shared
 * by every component that needs it. Returns an empty array until it arrives.
 *
 * `enabled: false` defers the fetch — the command palette only needs it once opened.
 */
export function useSearchIndex(enabled = true): NodeSummary[] {
  const [index, setIndex] = useState<NodeSummary[]>(() => cache ?? []);

  useEffect(() => {
    if (!enabled || cache) return;
    let live = true;
    load().then((data) => {
      if (live) setIndex(data);
    });
    return () => {
      live = false;
    };
  }, [enabled]);

  // A later mount can hit a warm cache while state still holds the empty default.
  return index.length === 0 && cache ? cache : index;
}
