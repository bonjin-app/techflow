import { describe, expect, it } from "vitest";
import { coverage, findPath, frontier, learningRoute } from "@/lib/path";
import { loadGraph, makeGraph } from "./helpers";

const graph = loadGraph();

describe("findPath", () => {
  it("returns null for a node that is not there, and for a node to itself", () => {
    expect(findPath(graph, "redis", "redis")).toBeNull();
    expect(findPath(graph, "redis", "does-not-exist")).toBeNull();
  });

  it("produces a contiguous chain from the start to the destination", () => {
    const hops = findPath(graph, "jwt", "sharding");
    expect(hops).not.toBeNull();
    expect(hops![0].from).toBe("jwt");
    expect(hops![hops!.length - 1].to).toBe("sharding");
    for (let i = 1; i < hops!.length; i++) expect(hops![i].from).toBe(hops![i - 1].to);
  });

  it("only uses edges that exist in the graph", () => {
    const hops = findPath(graph, "swift", "kafka")!;
    for (const hop of hops) {
      const edges = graph.adjacency.get(hop.from) ?? [];
      expect(edges.some((e) => e.other === hop.to && e.rel === hop.rel)).toBe(true);
    }
  });

  it("never revisits a node", () => {
    const hops = findPath(graph, "openapi", "tail-latency")!;
    const chain = ["openapi", ...hops.map((h) => h.to)];
    expect(new Set(chain).size).toBe(chain.length);
  });

  it("prefers a specific route over one through a hub", () => {
    // A tiny graph with one hub everything touches and one direct-ish route.
    const g = makeGraph(
      [{ id: "a" }, { id: "b" }, { id: "hub", degree: 400 }, { id: "mid", degree: 3 }],
      [
        ["a", "hub", "RELATED_TO"],
        ["hub", "b", "RELATED_TO"],
        ["a", "mid", "REQUIRES"],
        ["mid", "b", "REQUIRES"],
      ],
    );
    expect(findPath(g, "a", "b", { avoidHubs: true })!.map((h) => h.to)).toEqual(["mid", "b"]);
    // Without the penalty both routes are two hops, so the relation cost decides.
    expect(findPath(g, "a", "b", { avoidHubs: false })!.length).toBe(2);
  });

  it("finds a route between two pages in the real graph without wandering", () => {
    for (const [a, b] of [
      ["redis", "distributed-system"],
      ["cache", "microservices"],
      ["swift", "kafka"],
    ] as const) {
      const hops = findPath(graph, a, b);
      expect(hops, `${a} → ${b}`).not.toBeNull();
      expect(hops!.length, `${a} → ${b}`).toBeLessThanOrEqual(4);
    }
  });
});

describe("learningRoute", () => {
  it("ends at the target", () => {
    const route = learningRoute(graph, "saga", new Set());
    expect(route.at(-1)!.id).toBe("saga");
  });

  it("never lists a page before something that page requires", () => {
    const route = learningRoute(graph, "saga", new Set());
    const inRoute = new Set(route.map((s) => s.id));
    const seen = new Set<string>();
    for (const step of route) {
      for (const edge of graph.adjacency.get(step.id) ?? []) {
        if (edge.rel !== "REQUIRES" || edge.direction !== "out") continue;
        if (inRoute.has(edge.other)) expect(seen.has(edge.other), `${step.id} listed before its prerequisite ${edge.other}`).toBe(true);
      }
      seen.add(step.id);
    }
  });

  it("starts from something with no prerequisites of its own", () => {
    expect(learningRoute(graph, "saga", new Set())[0].depth).toBe(0);
  });

  it("marks known pages instead of dropping them", () => {
    const route = learningRoute(graph, "saga", new Set(["http"]));
    const http = route.find((s) => s.id === "http");
    expect(http).toBeDefined();
    expect(http!.known).toBe(true);
  });

  it("returns just the node when it has no prerequisites", () => {
    const g = makeGraph([{ id: "root" }, { id: "other" }], [["other", "root", "RELATED_TO"]]);
    expect(learningRoute(g, "root", new Set()).map((s) => s.id)).toEqual(["root"]);
  });

  it("is empty for an unknown id", () => {
    expect(learningRoute(graph, "nope", new Set())).toEqual([]);
  });
});

describe("frontier", () => {
  const known = new Set(["programming-fundamentals", "http", "backend", "database", "sql", "rest", "cache", "transaction"]);

  it("never lists a page the reader already knows", () => {
    const f = frontier(graph, known);
    for (const id of f.ready) expect(known.has(id)).toBe(false);
    for (const n of f.nearly) expect(known.has(n.id)).toBe(false);
  });

  it("lists as ready only pages whose prerequisites are all known", () => {
    const f = frontier(graph, known);
    expect(f.ready.length).toBeGreaterThan(0);
    for (const id of f.ready) {
      const prereqs = (graph.adjacency.get(id) ?? []).filter((e) => e.rel === "REQUIRES" && e.direction === "out");
      expect(prereqs.length).toBeGreaterThan(0);
      for (const p of prereqs) expect(known.has(p.other), `${id} needs ${p.other}`).toBe(true);
    }
  });

  it("names a real, still-unknown blocker for every nearly-ready page", () => {
    const f = frontier(graph, known);
    expect(f.nearly.length).toBeGreaterThan(0);
    for (const { id, missing } of f.nearly) {
      expect(known.has(missing)).toBe(false);
      const prereqs = (graph.adjacency.get(id) ?? []).filter((e) => e.rel === "REQUIRES" && e.direction === "out");
      expect(prereqs.filter((p) => !known.has(p.other)).map((p) => p.other)).toEqual([missing]);
    }
  });

  it("ignores pages that declare no prerequisites — they are starting points", () => {
    const g = makeGraph([{ id: "root" }, { id: "leaf" }], [["leaf", "root", "REQUIRES"]]);
    expect(frontier(g, new Set(["root"])).ready).toEqual(["leaf"]);
    expect(frontier(g, new Set()).ready).toEqual([]);
  });
});

describe("coverage", () => {
  it("counts each type once and only counts known pages", () => {
    const known = new Set(["redis", "cache", "not-a-node"]);
    const rows = coverage(graph, known);
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(graph.nodes.size);
    expect(rows.reduce((a, r) => a + r.known, 0)).toBe(2);
  });
});
