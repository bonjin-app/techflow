"use client";

import { useCallback, useEffect, useState } from "react";
import type { NodeType, Relation } from "./content/types";
import { BASE_PATH } from "./useSearchIndex";

export interface ApiNode {
  id: string;
  type: NodeType;
  name: string;
  tagline: string;
  category: string;
  difficulty: number;
  degree: number;
  href: string;
}

export interface ApiEdge {
  from: string;
  to: string;
  rel: Relation;
}

export interface GraphApi {
  nodes: Map<string, ApiNode>;
  /** id → the edges touching it, direction preserved */
  adjacency: Map<string, { other: string; rel: Relation; direction: "out" | "in" }[]>;
  counts: { nodes: number; edges: number };
}

function index(raw: { nodes: ApiNode[]; edges: ApiEdge[]; counts: GraphApi["counts"] }): GraphApi {
  const nodes = new Map(raw.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, { other: string; rel: Relation; direction: "out" | "in" }[]>();
  const push = (id: string, entry: { other: string; rel: Relation; direction: "out" | "in" }) => {
    const list = adjacency.get(id);
    if (list) list.push(entry);
    else adjacency.set(id, [entry]);
  };
  for (const e of raw.edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    push(e.from, { other: e.to, rel: e.rel, direction: "out" });
    push(e.to, { other: e.from, rel: e.rel, direction: "in" });
  }
  return { nodes, adjacency, counts: raw.counts };
}

let cache: GraphApi | null = null;
let inFlight: Promise<GraphApi | null> | null = null;

function load(): Promise<GraphApi | null> {
  if (cache) return Promise.resolve(cache);
  inFlight ??= fetch(`${BASE_PATH}/api/graph.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => {
      if (!raw) return null;
      cache = index(raw);
      return cache;
    })
    .catch(() => null)
    .finally(() => {
      // A failed fetch must not be cached as "in flight" forever, or Retry
      // would hand the caller the same rejection it already saw.
      if (!cache) inFlight = null;
    });
  return inFlight;
}

/**
 * The whole graph, fetched once. The mind map needs every edge so a reader can
 * walk from node to node without a page load; the same file is the public
 * `/api/graph.json` a developer can curl.
 */
export function useGraphApi(): { graph: GraphApi | null; loading: boolean; failed: boolean; retry: () => void } {
  // One piece of state, written only from the async callback and from the retry
  // handler: setting state synchronously inside the effect would cascade renders.
  const [state, setState] = useState<{ graph: GraphApi | null; status: "loading" | "ready" | "failed" }>(() =>
    cache ? { graph: cache, status: "ready" } : { graph: null, status: "loading" },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (cache) return;
    let live = true;
    load().then((g) => {
      if (live) setState({ graph: g, status: g ? "ready" : "failed" });
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    inFlight = null;
    setState({ graph: null, status: "loading" });
    setAttempt((a) => a + 1);
  }, []);

  return { graph: state.graph, loading: state.status === "loading", failed: state.status === "failed", retry };
}
