import { cache } from "react";
import { loadAllContent } from "./loader";
import {
  hrefFor,
  type AnyNode,
  type ArchitectureNode,
  type BuildGoal,
  type ComparisonNode,
  type DocNode,
  type Edge,
  type NodeSummary,
  type NodeType,
  type Relation,
  type RoadmapNode,
  type SystemDesignNode,
} from "./types";

export interface KnowledgeGraph {
  nodes: Map<string, AnyNode>;
  edges: Edge[];
  /** adjacency: node id → edges touching it (both directions) */
  adjacency: Map<string, Edge[]>;
  builds: BuildGoal[];
  problems: string[];
}

const INVERSE: Partial<Record<Relation, Relation>> = {
  ALTERNATIVE_TO: "ALTERNATIVE_TO",
  RELATED_TO: "RELATED_TO",
  USED_WITH: "USED_WITH",
};

function edgeKey(e: Edge) {
  return `${e.from}|${e.to}|${e.rel}`;
}

/** Build the graph (edges + adjacency) from raw content. Pure & deterministic. */
export function buildGraph(): KnowledgeGraph {
  const { nodes: list, builds } = loadAllContent();
  const nodes = new Map<string, AnyNode>(list.map((n) => [n.id, n]));
  const problems: string[] = [];
  const edgeSet = new Map<string, Edge>();

  const add = (e: Edge) => {
    if (e.from === e.to) return;
    if (!nodes.has(e.to)) {
      problems.push(`${e.from}: edge → '${e.to}' (${e.rel}) points to unknown node`);
      return;
    }
    const key = edgeKey(e);
    if (!edgeSet.has(key)) edgeSet.set(key, e);
  };

  for (const n of list) {
    if ("related" in n) {
      for (const r of n.related) add({ from: n.id, to: r.to, rel: r.rel });
    }
    if (n.type === "technology" || n.type === "concept" || n.type === "pattern") {
      for (const c of n.usedFor) add({ from: n.id, to: c, rel: "RELATED_TO", derived: true });
      for (const p of n.prerequisites) add({ from: n.id, to: p, rel: "REQUIRES", derived: true });
      for (const p of n.learningPath) {
        if (nodes.has(p) && p !== n.id) add({ from: n.id, to: p, rel: "REQUIRES", derived: true });
      }
    }
    if (n.type === "architecture") {
      for (const an of n.nodes) {
        if (an.ref) {
          if (!nodes.has(an.ref)) {
            problems.push(`${n.id}: architecture node '${an.id}' ref → unknown '${an.ref}'`);
            continue;
          }
          add({ from: an.ref, to: n.id, rel: "USED_IN", derived: true });
        }
        for (const alt of an.alternatives ?? []) {
          if (!nodes.has(alt)) problems.push(`${n.id}: node '${an.id}' alternative '${alt}' unknown`);
        }
        for (const r of an.related ?? []) {
          if (!nodes.has(r)) problems.push(`${n.id}: node '${an.id}' related '${r}' unknown`);
        }
      }
      const ids = new Set(n.nodes.map((x) => x.id));
      for (const e of n.edges) {
        if (!ids.has(e.from) || !ids.has(e.to))
          problems.push(`${n.id}: edge ${e.from} → ${e.to} references unknown diagram node`);
      }
      for (const f of n.flows) {
        for (const p of f.path)
          if (!ids.has(p)) problems.push(`${n.id}: flow '${f.id}' path node '${p}' unknown`);
      }
      for (const v of n.versions ?? []) {
        for (const p of v.nodes)
          if (!ids.has(p)) problems.push(`${n.id}: version '${v.version}' node '${p}' unknown`);
      }
    }
    if (n.type === "comparison") {
      for (const s of n.subjects) add({ from: n.id, to: s, rel: "RELATED_TO", derived: true });
      if (n.subjects.length >= 2) {
        for (let i = 0; i < n.subjects.length; i++)
          for (let j = i + 1; j < n.subjects.length; j++)
            if (nodes.has(n.subjects[i]) && nodes.has(n.subjects[j]))
              add({ from: n.subjects[i], to: n.subjects[j], rel: "ALTERNATIVE_TO", derived: true });
      }
    }
    if (n.type === "roadmap") {
      for (const s of n.steps) {
        if (s.ref) {
          if (!nodes.has(s.ref)) problems.push(`${n.id}: roadmap step ref '${s.ref}' unknown`);
          else add({ from: s.ref, to: n.id, rel: "PART_OF", derived: true });
        }
      }
    }
    if (n.type === "system-design") {
      for (const step of n.steps) {
        const ids = new Set(step.nodes.map((x) => x.id));
        for (const an of step.nodes) {
          if (an.ref) {
            if (!nodes.has(an.ref)) problems.push(`${n.id}: step '${step.title}' node ref '${an.ref}' unknown`);
            else add({ from: an.ref, to: n.id, rel: "USED_IN", derived: true });
          }
        }
        for (const e of step.edges)
          if (!ids.has(e.from) || !ids.has(e.to))
            problems.push(`${n.id}: step '${step.title}' edge ${e.from} → ${e.to} unknown node`);
      }
    }
  }

  for (const b of builds) {
    for (const id of [b.architecture, b.systemDesign, ...b.technologies, ...b.concepts, ...b.patterns])
      if (id && !nodes.has(id)) problems.push(`build '${b.id}': unknown node '${id}'`);
  }

  // Symmetric relations get their inverse so neighbourhoods are consistent.
  for (const e of [...edgeSet.values()]) {
    const inv = INVERSE[e.rel];
    if (inv) {
      const back: Edge = { from: e.to, to: e.from, rel: inv, derived: true };
      const k = edgeKey(back);
      if (!edgeSet.has(k)) edgeSet.set(k, back);
    }
  }

  const edges = [...edgeSet.values()];
  const adjacency = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from)!.push(e);
    adjacency.get(e.to)!.push(e);
  }
  return { nodes, edges, adjacency, builds, problems };
}

/** Memoised per request/build. */
export const getGraph = cache(buildGraph);

export function summarize(n: AnyNode, g: KnowledgeGraph): NodeSummary {
  return {
    id: n.id,
    type: n.type,
    name: n.name,
    tagline: n.tagline,
    category: n.category,
    tags: n.tags,
    difficulty: n.difficulty,
    href: hrefFor(n.type, n.id),
    degree: g.adjacency.get(n.id)?.length ?? 0,
  };
}

export function getNode(id: string): AnyNode | undefined {
  return getGraph().nodes.get(id);
}

export function getNodesByType<T extends AnyNode["type"]>(type: T) {
  return [...getGraph().nodes.values()].filter((n) => n.type === type) as Extract<
    AnyNode,
    { type: T }
  >[];
}

export const getTechnologies = () => getNodesByType("technology") as DocNode[];
export const getConcepts = () => getNodesByType("concept") as DocNode[];
export const getPatterns = () => getNodesByType("pattern") as DocNode[];
export const getArchitectures = () => getNodesByType("architecture") as ArchitectureNode[];
export const getComparisons = () => getNodesByType("comparison") as ComparisonNode[];
export const getRoadmaps = () => getNodesByType("roadmap") as RoadmapNode[];
export const getSystemDesigns = () => getNodesByType("system-design") as SystemDesignNode[];
export const getBuilds = () => getGraph().builds;

export interface Neighbor {
  node: NodeSummary;
  rel: Relation;
  /** "out" = this → neighbor ; "in" = neighbor → this */
  direction: "out" | "in";
}

/** Distinct neighbours of a node, ordered by relation priority then degree. */
export function getNeighbors(id: string): Neighbor[] {
  const g = getGraph();
  const seen = new Map<string, Neighbor>();
  for (const e of g.adjacency.get(id) ?? []) {
    const otherId = e.from === id ? e.to : e.from;
    const other = g.nodes.get(otherId);
    if (!other) continue;
    const direction = e.from === id ? "out" : "in";
    const cand: Neighbor = { node: summarize(other, g), rel: e.rel, direction };
    const prev = seen.get(otherId);
    // prefer declared (non-derived) outgoing edges when several exist
    if (!prev || (prev.direction === "in" && direction === "out") || (!e.derived && prev.direction === direction)) {
      seen.set(otherId, cand);
    }
  }
  const prio: Record<Relation, number> = {
    ALTERNATIVE_TO: 0,
    USED_WITH: 1,
    RELATED_TO: 2,
    SOLVES: 3,
    IMPLEMENTS: 4,
    USED_IN: 5,
    REQUIRES: 6,
    PART_OF: 7,
  };
  return [...seen.values()].sort(
    (a, b) => prio[a.rel] - prio[b.rel] || b.node.degree - a.node.degree || a.node.name.localeCompare(b.node.name),
  );
}

export interface GraphView {
  nodes: (NodeSummary & { center?: boolean; depth: number })[];
  edges: { from: string; to: string; rel: Relation }[];
}

/**
 * Ego graph: the centre node, its neighbours (depth 1) and optionally
 * neighbours-of-neighbours (depth 2, capped) — the "Relationship Graph".
 */
export function getEgoGraph(id: string, opts: { depth?: number; maxNodes?: number } = {}): GraphView {
  const g = getGraph();
  const depth = opts.depth ?? 2;
  const maxNodes = opts.maxNodes ?? 28;
  const centre = g.nodes.get(id);
  if (!centre) return { nodes: [], edges: [] };
  const levels = new Map<string, number>([[id, 0]]);
  let frontier = [id];
  for (let d = 1; d <= depth && levels.size < maxNodes; d++) {
    const next: string[] = [];
    for (const f of frontier) {
      const ns = getNeighbors(f);
      for (const n of ns) {
        if (levels.size >= maxNodes) break;
        // depth-2 only for technology/concept/pattern to keep the picture readable
        if (d > 1 && !["technology", "concept", "pattern"].includes(n.node.type)) continue;
        if (!levels.has(n.node.id)) {
          levels.set(n.node.id, d);
          next.push(n.node.id);
        }
      }
    }
    frontier = next;
  }
  const ids = new Set(levels.keys());
  const edges: GraphView["edges"] = [];
  const seenPair = new Set<string>();
  for (const e of g.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    edges.push({ from: e.from, to: e.to, rel: e.rel });
  }
  return {
    nodes: [...levels.entries()].map(([nid, d]) => ({
      ...summarize(g.nodes.get(nid)!, g),
      center: nid === id,
      depth: d,
    })),
    edges,
  };
}

/** Whole-graph view for /explore and the home universe (undirected, de-duplicated). */
export function getUniverse(types?: NodeType[]): GraphView {
  const g = getGraph();
  const allowed = new Set(types ?? ["technology", "concept", "pattern", "architecture"]);
  const nodes = [...g.nodes.values()].filter((n) => allowed.has(n.type));
  const ids = new Set(nodes.map((n) => n.id));
  const seenPair = new Set<string>();
  const edges: GraphView["edges"] = [];
  for (const e of g.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    edges.push({ from: e.from, to: e.to, rel: e.rel });
  }
  return { nodes: nodes.map((n) => ({ ...summarize(n, g), depth: 0 })), edges };
}

/** Compact index for the client-side search / command palette. */
export function getSearchIndex(): NodeSummary[] {
  const g = getGraph();
  return [...g.nodes.values()].map((n) => summarize(n, g));
}

/** Resolve a list of ids-or-labels into display items (used by learning paths). */
export function resolveRefs(items: string[]): { id?: string; label: string; href?: string; type?: NodeType }[] {
  const g = getGraph();
  return items.map((it) => {
    const n = g.nodes.get(it);
    if (n) return { id: n.id, label: n.name, href: hrefFor(n.type, n.id), type: n.type };
    return { label: it };
  });
}

/** Deterministic "daily" pick so every visitor sees the same item on a given day. */
export function dailyPick<T>(items: T[], dateKey: string, salt = 0): T | undefined {
  if (items.length === 0) return undefined;
  let h = 2166136261 ^ salt;
  for (const ch of dateKey) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return items[Math.abs(h) % items.length];
}
