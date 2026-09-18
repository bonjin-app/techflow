import fs from "node:fs";
import path from "node:path";
import type { ApiNode, GraphApi } from "@/lib/useGraphApi";
import type { Relation } from "@/lib/content/types";

/**
 * The published graph, indexed the way the browser indexes it. Tests run against
 * the real content rather than a fixture on purpose: the algorithms are only
 * interesting against a graph with real hubs and real prerequisite chains, and a
 * fixture would drift from what ships.
 */
export function loadGraph(): GraphApi {
  const file = path.join(process.cwd(), "public", "api", "graph.json");
  if (!fs.existsSync(file)) throw new Error("public/api/graph.json missing — run `pnpm gen` first");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    nodes: ApiNode[];
    edges: { from: string; to: string; rel: Relation }[];
    counts: { nodes: number; edges: number };
  };
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

/** A tiny hand-built graph, for the cases the real one cannot produce on demand. */
export function makeGraph(
  nodes: { id: string; degree?: number; type?: string }[],
  edges: [from: string, to: string, rel: Relation][],
): GraphApi {
  const map = new Map<string, ApiNode>(
    nodes.map((n) => [
      n.id,
      { id: n.id, type: (n.type ?? "concept") as ApiNode["type"], name: n.id, tagline: "", category: "test", difficulty: 1, degree: n.degree ?? 1, href: `/concept/${n.id}` },
    ]),
  );
  const adjacency = new Map<string, { other: string; rel: Relation; direction: "out" | "in" }[]>();
  const push = (id: string, entry: { other: string; rel: Relation; direction: "out" | "in" }) => {
    const list = adjacency.get(id);
    if (list) list.push(entry);
    else adjacency.set(id, [entry]);
  };
  for (const [from, to, rel] of edges) {
    push(from, { other: to, rel, direction: "out" });
    push(to, { other: from, rel, direction: "in" });
  }
  return { nodes: map, adjacency, counts: { nodes: map.size, edges: edges.length } };
}
