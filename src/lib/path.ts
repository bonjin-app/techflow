import type { Relation } from "./content/types";
import type { GraphApi } from "./useGraphApi";

export interface Hop {
  from: string;
  to: string;
  rel: Relation;
  direction: "out" | "in";
}

/**
 * How explanatory each kind of edge is. A REQUIRES or IMPLEMENTS hop says
 * something specific about why two pages are next to each other; RELATED_TO is
 * the catch-all and makes a weaker link in a chain, so it costs more.
 */
const REL_COST: Record<Relation, number> = {
  REQUIRES: 0.8,
  IMPLEMENTS: 0.8,
  SOLVES: 0.85,
  PART_OF: 0.9,
  ALTERNATIVE_TO: 1,
  USED_IN: 1,
  USED_WITH: 1.1,
  RELATED_TO: 1.25,
};

/**
 * Passing through a hub is cheap for the algorithm and useless for the reader:
 * almost everything connects through Backend or HTTP, and "they are both
 * connected to Backend" explains nothing. Entering a node costs more the more
 * edges it has, so the search prefers a slightly longer route made of specific
 * steps over a short one through the middle of the graph.
 */
function hubPenalty(degree: number): number {
  return Math.log2(Math.max(degree, 1) + 1) / 4;
}

/** Dijkstra over the undirected graph, weighted to prefer explanatory routes. */
export function findPath(graph: GraphApi, from: string, to: string, opts: { avoidHubs?: boolean } = {}): Hop[] | null {
  if (from === to || !graph.nodes.has(from) || !graph.nodes.has(to)) return null;
  const avoidHubs = opts.avoidHubs ?? true;

  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, Hop>();
  const done = new Set<string>();
  // The graph is a few thousand edges, so a linear scan for the minimum is
  // simpler than a heap and fast enough to run on every keystroke.
  const queue = new Set<string>([from]);

  while (queue.size) {
    let current: string | null = null;
    let best = Infinity;
    for (const id of queue) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        current = id;
      }
    }
    if (current === null) break;
    queue.delete(current);
    done.add(current);
    if (current === to) break;

    for (const edge of graph.adjacency.get(current) ?? []) {
      if (done.has(edge.other)) continue;
      const node = graph.nodes.get(edge.other);
      if (!node) continue;
      const step = REL_COST[edge.rel] + (avoidHubs && edge.other !== to ? hubPenalty(node.degree) : 0);
      const next = best + step;
      if (next < (dist.get(edge.other) ?? Infinity)) {
        dist.set(edge.other, next);
        prev.set(edge.other, { from: current, to: edge.other, rel: edge.rel, direction: edge.direction });
        queue.add(edge.other);
      }
    }
  }

  if (!prev.has(to)) return null;
  const hops: Hop[] = [];
  let cursor = to;
  while (cursor !== from) {
    const hop = prev.get(cursor);
    if (!hop) return null;
    hops.unshift(hop);
    cursor = hop.from;
  }
  return hops;
}

export interface RouteStep {
  id: string;
  /** how many prerequisites deep — 0 is a starting point */
  depth: number;
  known: boolean;
}

/**
 * Everything `target` requires, ordered so nothing appears before what it
 * depends on. REQUIRES runs from a node to its prerequisite and the validator
 * rejects cycles, so this is a topological sort of a DAG.
 *
 * Known nodes stay in the list, marked — a route that silently omits them reads
 * as if they were never needed, and the reader loses the shape of the subject.
 */
export function learningRoute(graph: GraphApi, target: string, known: Set<string>): RouteStep[] {
  if (!graph.nodes.has(target)) return [];

  const required = new Set<string>();
  const walk = (id: string) => {
    for (const edge of graph.adjacency.get(id) ?? []) {
      if (edge.rel !== "REQUIRES" || edge.direction !== "out") continue;
      if (required.has(edge.other) || edge.other === target) continue;
      required.add(edge.other);
      walk(edge.other);
    }
  };
  walk(target);

  // Depth = longest chain of prerequisites below a node, so the ordering puts
  // foundations first even when two branches meet.
  const depthOf = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    const cached = depthOf.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0; // defensive: the validator forbids cycles
    seen.add(id);
    let d = 0;
    for (const edge of graph.adjacency.get(id) ?? []) {
      if (edge.rel !== "REQUIRES" || edge.direction !== "out") continue;
      if (!required.has(edge.other)) continue;
      d = Math.max(d, depth(edge.other, seen) + 1);
    }
    seen.delete(id);
    depthOf.set(id, d);
    return d;
  };

  const steps = [...required].map((id) => ({ id, depth: depth(id, new Set()), known: known.has(id) }));
  steps.sort((a, b) => a.depth - b.depth || (graph.nodes.get(b.id)?.degree ?? 0) - (graph.nodes.get(a.id)?.degree ?? 0));
  steps.push({ id: target, depth: Math.max(0, ...steps.map((s) => s.depth)) + 1, known: known.has(target) });
  return steps;
}

export interface Frontier {
  /** every prerequisite ticked — these are readable now */
  ready: string[];
  /** exactly one prerequisite missing, with the id of that prerequisite */
  nearly: { id: string; missing: string }[];
}

/**
 * What a reader can pick up next, given what they have ticked as known.
 *
 * A page is *ready* when everything it requires is already known — which is the
 * only honest definition of "you could read this now". *Nearly* is one step
 * behind, and is usually the more useful list, because it names the single page
 * standing between the reader and several others.
 */
export function frontier(graph: GraphApi, known: Set<string>, types?: Set<string>): Frontier {
  const ready: string[] = [];
  const nearly: { id: string; missing: string }[] = [];
  for (const node of graph.nodes.values()) {
    if (known.has(node.id)) continue;
    if (types && !types.has(node.type)) continue;
    const prereqs = (graph.adjacency.get(node.id) ?? []).filter((e) => e.rel === "REQUIRES" && e.direction === "out").map((e) => e.other);
    if (prereqs.length === 0) continue; // a starting point, not a frontier
    const missing = prereqs.filter((p) => !known.has(p));
    if (missing.length === 0) ready.push(node.id);
    else if (missing.length === 1) nearly.push({ id: node.id, missing: missing[0] });
  }
  const byDegree = (a: string, b: string) => (graph.nodes.get(b)?.degree ?? 0) - (graph.nodes.get(a)?.degree ?? 0);
  ready.sort(byDegree);
  nearly.sort((a, b) => byDegree(a.id, b.id));
  return { ready, nearly };
}

/** How many pages of each type are ticked, against how many exist. */
export function coverage(graph: GraphApi, known: Set<string>): { type: string; known: number; total: number }[] {
  const totals = new Map<string, { known: number; total: number }>();
  for (const node of graph.nodes.values()) {
    const row = totals.get(node.type) ?? { known: 0, total: 0 };
    row.total++;
    if (known.has(node.id)) row.known++;
    totals.set(node.type, row);
  }
  return [...totals.entries()]
    .map(([type, row]) => ({ type, ...row }))
    .sort((a, b) => b.total - a.total);
}

export interface SharedNode {
  id: string;
  /** how each side relates to it */
  relToA: Relation;
  relToB: Relation;
}

export interface CommonGround {
  /** a direct edge between the two, if there is one */
  direct?: { rel: Relation; direction: "out" | "in" };
  shared: SharedNode[];
}

/**
 * What two pages have in common. Ordered by how much the shared neighbour
 * narrows things down: everything on this site touches Backend, so "both are
 * related to Backend" is not an answer — the interesting shared pages are the
 * specific ones, which is the same reasoning the path weighting uses.
 */
export function commonGround(graph: GraphApi, a: string, b: string): CommonGround | null {
  if (a === b || !graph.nodes.has(a) || !graph.nodes.has(b)) return null;

  const edgesOfA = new Map<string, Relation>();
  let direct: CommonGround["direct"];
  for (const e of graph.adjacency.get(a) ?? []) {
    if (e.other === b) direct = { rel: e.rel, direction: e.direction };
    // keep the most specific relation when two pages are linked more than once
    const existing = edgesOfA.get(e.other);
    if (!existing || REL_COST[e.rel] < REL_COST[existing]) edgesOfA.set(e.other, e.rel);
  }

  const shared: SharedNode[] = [];
  for (const e of graph.adjacency.get(b) ?? []) {
    const relToA = edgesOfA.get(e.other);
    if (!relToA || e.other === a) continue;
    if (shared.some((s) => s.id === e.other)) continue;
    shared.push({ id: e.other, relToA, relToB: e.rel });
  }

  // "Both are on the backend roadmap" is true of eighty pages and answers
  // nothing; "both are used in Chat System" is an actual answer. A roadmap is a
  // curriculum rather than a relationship, and a comparison of exactly these two
  // is a restatement of the question — so both are pushed down.
  const informativeness = (s: SharedNode) => {
    const node = graph.nodes.get(s.id);
    const membership = s.relToA === "PART_OF" && s.relToB === "PART_OF" ? 3 : 0;
    const tautology = node?.type === "comparison" ? 2 : 0;
    return REL_COST[s.relToA] + REL_COST[s.relToB] + hubPenalty(node?.degree ?? 1) * 2 + membership + tautology;
  };
  shared.sort((x, y) => informativeness(x) - informativeness(y));
  return { direct, shared };
}
