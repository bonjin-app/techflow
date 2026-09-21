/**
 * The three things the reader asks the graph directly: a question in the search
 * box, a keyword, and a path between two pages. All of them are promises the
 * product makes, and the first two have broken silently before.
 *
 *   pnpm check:intent
 */
import { buildGraph, getBuilds, getSearchIndex, summarize } from "../src/lib/content/graph";
import { detectIntent, type IntentKind } from "../src/lib/intent";
import { searchNodes } from "../src/lib/search";
import { commonGround, coverage, findPath, frontier, learningRoute } from "../src/lib/path";
import type { ApiNode, GraphApi } from "../src/lib/useGraphApi";
import { RELATION_LABEL, type Relation } from "../src/lib/content/types";

interface Case {
  q: string;
  kind: IntentKind;
  /** node id, build goal id or comparison id the answer must point at */
  hits: string;
}

const CASES: Case[] = [
  // the four from the spec
  { q: "Why Redis?", kind: "why", hits: "redis" },
  { q: "When is Kafka needed?", kind: "when", hits: "kafka" },
  { q: "WebSocket vs SSE?", kind: "compare", hits: "websocket-vs-sse" },
  { q: "How do I design a payment system?", kind: "how", hits: "payment-system" },
  // the shapes people actually type
  { q: "I want to build an online store", kind: "build", hits: "e-commerce" },
  { q: "should I use postgres or mongodb", kind: "compare", hits: "postgresql-vs-mongodb" },
  { q: "what is idempotency", kind: "why", hits: "idempotency" },
  { q: "where do I start as a backend developer", kind: "learn", hits: "backend" },
  { q: "I want to build a mobile app", kind: "build", hits: "mobile-app" },
];

/** query → the id that must come first. Abbreviations and typos included. */
const RANKING: [string, string][] = [
  ["redis", "redis"],
  ["cach", "cache"],
  ["rate limiting", "rate-limiting"],
  ["k8s", "kubernetes"],
  ["adr", "architecture-decision-record"],
  ["postgres", "postgresql"],
  ["redsi", "redis"],
  ["kuberentes", "kubernetes"],
  ["docekr", "docker"],
];

/** The path finder runs against the published graph shape, so build that here. */
function asGraphApi(): GraphApi {
  const g = buildGraph();
  const nodes = new Map<string, ApiNode>();
  for (const n of g.nodes.values()) {
    const s = summarize(n, g);
    nodes.set(s.id, { id: s.id, type: s.type, name: s.name, tagline: s.tagline, category: s.category, difficulty: s.difficulty, degree: s.degree, href: s.href });
  }
  const adjacency = new Map<string, { other: string; rel: Relation; direction: "out" | "in" }[]>();
  const push = (id: string, e: { other: string; rel: Relation; direction: "out" | "in" }) => {
    const list = adjacency.get(id);
    if (list) list.push(e);
    else adjacency.set(id, [e]);
  };
  for (const e of g.edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    push(e.from, { other: e.to, rel: e.rel, direction: "out" });
    push(e.to, { other: e.from, rel: e.rel, direction: "in" });
  }
  return { nodes, adjacency, counts: { nodes: nodes.size, edges: g.edges.length } };
}

function checkPaths(): string[] {
  const api = asGraphApi();
  const fail: string[] = [];

  // Every pair of well-connected pages should be reachable, and in few hops —
  // a path of ten is a graph problem, not an answer.
  for (const [a, b] of [
    ["redis", "distributed-system"],
    ["swift", "kafka"],
    ["jwt", "sharding"],
    ["openapi", "tail-latency"],
    ["cache", "microservices"],
  ]) {
    const hops = findPath(api, a, b);
    if (!hops) fail.push(`path ${a} → ${b}: no route at all`);
    else if (hops.length > 4) fail.push(`path ${a} → ${b}: ${hops.length} hops — too far to explain anything`);
    else if (hops.some((h) => !RELATION_LABEL[h.rel])) fail.push(`path ${a} → ${b}: a hop has no relation label`);
  }

  // Hub avoidance has to change something, or the weighting is doing nothing.
  const plain = findPath(api, "jwt", "sharding", { avoidHubs: false });
  const weighted = findPath(api, "jwt", "sharding", { avoidHubs: true });
  if (plain && weighted && plain.length <= weighted.length && JSON.stringify(plain) === JSON.stringify(weighted)) {
    fail.push("path jwt → sharding: hub avoidance made no difference");
  }

  // A learning route must end at the target and start at something with no
  // prerequisites of its own, or the ordering is wrong.
  const route = learningRoute(api, "saga", new Set());
  if (route.length < 3) fail.push(`learning route to saga: only ${route.length} step(s)`);
  if (route[route.length - 1]?.id !== "saga") fail.push("learning route to saga: does not end at saga");
  if (route[0]?.depth !== 0) fail.push("learning route to saga: does not start at a node with no prerequisites");
  const seen = new Set<string>();
  for (const step of route) {
    for (const e of api.adjacency.get(step.id) ?? []) {
      if (e.rel === "REQUIRES" && e.direction === "out" && route.some((r) => r.id === e.other) && !seen.has(e.other)) {
        fail.push(`learning route to saga: ${step.id} comes before its prerequisite ${e.other}`);
      }
    }
    seen.add(step.id);
  }
  // The progress page's whole claim is that ticking a page opens others. If
  // nothing is ever ready or nearly ready, the page has nothing to say.
  const known = new Set(["programming-fundamentals", "http", "backend", "database", "sql", "rest", "cache", "transaction"]);
  const f = frontier(api, known);
  if (f.ready.length < 3) fail.push(`frontier: only ${f.ready.length} page(s) ready after ticking eight foundations`);
  if (f.nearly.length < 3) fail.push(`frontier: only ${f.nearly.length} page(s) one step away`);
  if (f.ready.some((id) => known.has(id))) fail.push("frontier: a ticked page was listed as ready to read");
  for (const { id, missing } of f.nearly) {
    if (known.has(missing)) fail.push(`frontier: ${id} is blocked on ${missing}, which is already known`);
  }
  // Shared ground must answer with something specific, not "both are on a roadmap".
  const shared = commonGround(api, "redis", "kafka");
  if (!shared || shared.shared.length < 3) fail.push("common ground redis ∩ kafka: too few shared pages");
  else {
    const top = shared.shared[0];
    const node = api.nodes.get(top.id);
    if (node?.type === "roadmap") fail.push(`common ground redis ∩ kafka: leads with a roadmap (${top.id}), which says nothing`);
    if (node?.type === "comparison") fail.push(`common ground redis ∩ kafka: leads with the comparison of the two, which restates the question`);
  }
  if (commonGround(api, "redis", "redis") !== null) fail.push("common ground: a page compared with itself should return null");

  const cov = coverage(api, known);
  const counted = cov.reduce((a, c) => a + c.known, 0);
  if (counted !== [...known].filter((id) => api.nodes.has(id)).length) fail.push(`coverage: counted ${counted} known pages, expected ${known.size}`);

  return fail;
}

function main() {
  buildGraph();
  const index = getSearchIndex();
  const builds = getBuilds().map((b) => ({ id: b.id, name: b.name, tagline: b.tagline }));
  const failures: string[] = [];

  for (const c of CASES) {
    const i = detectIntent(c.q, index, builds);
    if (!i) {
      failures.push(`"${c.q}" — no answer card at all`);
      continue;
    }
    if (i.kind !== c.kind) failures.push(`"${c.q}" — read as '${i.kind}', expected '${c.kind}'`);
    const found = [i.goal?.id, i.comparison?.id, ...i.mentioned.map((m) => m.id)].filter(Boolean);
    if (!found.includes(c.hits)) failures.push(`"${c.q}" — did not find '${c.hits}' (found ${found.join(", ") || "nothing"})`);
  }

  for (const [q, want] of RANKING) {
    const first = searchNodes(index, q, 1)[0]?.item.id;
    if (first !== want) failures.push(`search "${q}" — ranked '${first ?? "nothing"}' first, expected '${want}'`);
  }

  // The floor for a knowledge graph: a page wins a search for its own name,
  // typed as it is written and typed the way a phone keyboard produces it —
  // lowercase, no punctuation. "SQL" used to return SQLite and "ci cd" nothing
  // relevant at all, each because a partial match had out-accumulated an exact
  // one. Derived from the content, so it keeps holding as pages are added.
  let named = 0;
  for (const n of index) {
    for (const q of new Set([n.name, n.name.toLowerCase().replace(/[^a-z0-9]+/gi, " ").trim()])) {
      named++;
      const first = searchNodes(index, q, 1)[0]?.item.id;
      if (first !== n.id) failures.push(`search "${q}" — ranked '${first ?? "nothing"}' first, but that is the name of '${n.id}'`);
    }
  }

  failures.push(...checkPaths());

  for (const f of failures) console.error(`  ✖ ${f}`);
  console.log(`\n${CASES.length} question(s), ${RANKING.length} keyword(s), ${named} name(s) and 15 graph assertion(s) checked`);
  if (failures.length) {
    console.error(`✖ ${failures.length} search failure(s)`);
    process.exit(1);
  }
  console.log("✔ questions understood, keywords ranked, paths found");
}

main();
