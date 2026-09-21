import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = <T>(rel: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;

interface GraphNode {
  id: string;
  type: string;
  name: string;
  href: string;
}
interface Graph {
  relations: Record<string, string>;
  nodes: GraphNode[];
  edges: { from: string; to: string; rel: string }[];
}
interface Index {
  endpoints: Record<string, string>;
}

const graph = read<Graph>("public/api/graph.json");
const index = read<Index>("public/api/index.json");
const nodeDir = path.join(process.cwd(), "public/api/nodes");

/**
 * The API is the one promise on this site made to something other than a
 * reader. A page that drifts is visibly wrong; a response that drifts is
 * silently wrong, in somebody else's program.
 */
describe("the published API", () => {
  it("lists every node it serves, and serves every node it lists", () => {
    const listed = new Set(graph.nodes.map((n) => n.id));
    const served = new Set(fs.readdirSync(nodeDir).map((f) => f.replace(/\.json$/, "")));
    expect([...listed].filter((id) => !served.has(id))).toEqual([]);
    expect([...served].filter((id) => !listed.has(id))).toEqual([]);
  });

  it("has no edge pointing at a node it does not publish", () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    const dangling = graph.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
    expect(dangling).toEqual([]);
  });

  it("publishes a label for every relation its edges actually use", () => {
    const used = [...new Set(graph.edges.map((e) => e.rel))].sort();
    expect(used.filter((r) => !graph.relations[r])).toEqual([]);
  });

  it("serves every endpoint index.json advertises", () => {
    for (const endpoint of Object.keys(index.endpoints)) {
      const probe = endpoint.replace("{id}", graph.nodes[0].id).replace(/^\//, "");
      expect(fs.existsSync(path.join(process.cwd(), "public", probe)), endpoint).toBe(true);
    }
  });

  it("agrees with itself: a node file matches the graph's entry for it", () => {
    for (const n of graph.nodes) {
      const own = read<GraphNode>(`public/api/nodes/${n.id}.json`);
      expect({ id: own.id, type: own.type, name: own.name, href: own.href }).toEqual({
        id: n.id,
        type: n.type,
        name: n.name,
        href: n.href,
      });
    }
  });

  // The docs page carries a hand-written sample response. It is the one part of
  // the API surface a change to the generator cannot update, so it is the one
  // part that can quietly start describing a response nobody serves.
  it("the documented sample response has the fields the API actually returns", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/api-docs/page.tsx"), "utf8");
    const sample = /\{\s*\n\s*"id": "redis",[\s\S]*?\n\}/.exec(src)?.[0];
    expect(sample, "the sample response block moved or changed shape").toBeTruthy();

    const documented = JSON.parse(sample!) as Record<string, unknown>;
    const actual = read<Record<string, unknown>>("public/api/nodes/redis.json");

    // Every documented field exists on the real response — the page is abridged
    // by design, so the reverse is allowed.
    expect(Object.keys(documented).filter((k) => !(k in actual))).toEqual([]);

    const docNeighbour = (documented.neighbours as Record<string, unknown>[])[0];
    const realNeighbour = (actual.neighbours as Record<string, unknown>[])[0];
    expect(Object.keys(docNeighbour).sort()).toEqual(Object.keys(realNeighbour).sort());
    expect(Object.keys(documented.meta as object).sort()).toEqual(Object.keys(actual.meta as object).sort());
  });
});
