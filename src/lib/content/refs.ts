import type { RefMap } from "@/components/md/refs";
import { getGraph } from "./graph";
import { hrefFor } from "./types";

/** id → {href,name,type} for every node (small enough to pass to client components). */
export function buildRefMap(ids?: Iterable<string>): RefMap {
  const g = getGraph();
  const out: RefMap = {};
  const list = ids ? [...ids] : [...g.nodes.keys()];
  for (const id of list) {
    const n = g.nodes.get(id);
    if (n) out[id] = { href: hrefFor(n.type, n.id), name: n.name, type: n.type };
  }
  return out;
}

/** Collect every node id mentioned by an architecture-like node set. */
export function collectArchRefs(nodes: { ref?: string; alternatives?: string[]; related?: string[] }[], extra: string[] = []) {
  const ids = new Set<string>(extra);
  for (const n of nodes) {
    if (n.ref) ids.add(n.ref);
    n.alternatives?.forEach((a) => ids.add(a));
    n.related?.forEach((r) => ids.add(r));
  }
  return ids;
}
