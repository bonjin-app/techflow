"use client";

import { useEffect, useState } from "react";
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
    .catch(() => null);
  return inFlight;
}

/**
 * The whole graph, fetched once. The mind map needs every edge so a reader can
 * walk from node to node without a page load; the same file is the public
 * `/api/graph.json` a developer can curl.
 */
export function useGraphApi(): { graph: GraphApi | null; loading: boolean } {
  const [graph, setGraph] = useState<GraphApi | null>(() => cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let live = true;
    load().then((g) => {
      if (!live) return;
      setGraph(g);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return { graph, loading };
}
