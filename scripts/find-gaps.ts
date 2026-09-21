/**
 * Terms the content already leans on that have no page of their own.
 *
 * Wave 7 was chosen from roadmap steps with no node. This is the same idea one
 * level down: if fifteen pages say "consistent hashing" and there is nowhere to
 * send the reader, that is a gap the site created itself.
 *
 * The watchlist is curated on purpose — scraping every capitalised phrase gives
 * noise, and the judgement about what deserves a page is the point.
 *
 *   pnpm gaps
 */
import fs from "node:fs";
import path from "node:path";
import { buildGraph } from "../src/lib/content/graph";

/**
 * Pages whose prose covers the same ground but which the graph does not link.
 *
 * Cosine similarity over the full-text index. Almost every strong pair is
 * already linked — the graph is dense and hand-curated, which is why this is a
 * report for an author rather than a "similar pages" box for a reader: shipping
 * it to readers would mostly restate the Related section. What is left after
 * the linked pairs are removed is the useful part: a candidate edge somebody
 * missed.
 */
function similarButUnlinked(): { a: string; b: string; score: number }[] {
  const file = path.join(process.cwd(), "public", "search-text.json");
  if (!fs.existsSync(file)) return [];
  const idx = JSON.parse(fs.readFileSync(file, "utf8")) as { ids: string[]; terms: Record<string, number[]> };
  const g = buildGraph();
  const n = idx.ids.length;

  const vectors: Map<string, number>[] = Array.from({ length: n }, () => new Map());
  for (const [term, docs] of Object.entries(idx.terms)) {
    const idf = Math.log(n / docs.length);
    if (idf < 1.2) continue; // a word on a fifth of the site says nothing about a pair
    for (const entry of docs) {
      const prominent = entry < 0;
      vectors[prominent ? -entry - 1 : entry].set(term, idf * (prominent ? 2.5 : 1));
    }
  }
  const norms = vectors.map((v) => Math.hypot(...v.values()));
  const linked = new Set<string>();
  for (const e of g.edges) linked.add([e.from, e.to].sort().join("|"));

  const pairs: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const key = [idx.ids[i], idx.ids[j]].sort().join("|");
      if (linked.has(key)) continue;
      // Two roadmaps, two architectures or two system designs always read
      // alike: each is a survey naming the same stack, so a high score says
      // nothing. They swamped the report with pairs nobody would ever link.
      const ta = g.nodes.get(idx.ids[i])?.type;
      const SURVEY = new Set(["roadmap", "architecture", "system-design", undefined]);
      if (ta === g.nodes.get(idx.ids[j])?.type && SURVEY.has(ta)) continue;
      const [small, large] = vectors[i].size < vectors[j].size ? [vectors[i], vectors[j]] : [vectors[j], vectors[i]];
      let dot = 0;
      for (const [t, w] of small) {
        const other = large.get(t);
        if (other) dot += w * other;
      }
      const score = dot / (norms[i] * norms[j] || 1);
      if (score > 0.12) pairs.push({ a: idx.ids[i], b: idx.ids[j], score });
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, 20);
}

/**
 * A term, and optionally the node that already covers it — "at-least-once" is
 * answered by the delivery-semantics page even though the slugs differ. Without
 * the second field the list keeps reporting work that is done.
 */
const WATCH: (string | [term: string, coveredBy: string])[] = [
  ["consistent hashing", "consistent-hashing"],
  ["change data capture", "change-data-capture"], ["CDC", "change-data-capture"],
  ["Raft", "consensus"], ["quorum", "consensus"], ["split-brain", "consensus"], ["fencing token", "consensus"],
  ["at-least-once", "delivery-semantics"], ["exactly-once", "delivery-semantics"],
  ["WAL", "storage-engine"], ["write-ahead log", "storage-engine"], ["MVCC", "storage-engine"],
  ["LSM", "storage-engine"], ["B-tree", "storage-engine"], ["columnar", "storage-engine"],
  ["autoscaling", "autoscaling"], ["service discovery", "service-discovery"],
  ["canary", "canary-release"], ["blue-green", "blue-green-deployment"], ["chaos", "chaos-engineering"],
  ["CSRF", "owasp-top-10"], ["XSS", "owasp-top-10"], ["SQL injection", "owasp-top-10"],
  ["SSO", "oauth"], ["OIDC", "oauth"], ["SAML", "oauth"],
  ["data contract", "data-quality"], ["denormalisation", "dimensional-modeling"],
  ["fan-out", "fan-out"], ["p99", "tail-latency"], ["tail latency", "tail-latency"],
  ["backfill", "backfill"], ["head-of-line", "tail-latency"], ["retry storm", "retry"],
  ["cold start", "serverless"], ["single point of failure", "availability"],
  ["thundering herd", "cache-invalidation"], ["cache stampede", "cache-invalidation"],
  ["dual write", "outbox"], ["dual-write", "outbox"], ["shared database", "database-per-service"],
  ["write amplification", "storage-engine"], ["hot partition", "sharding"], ["hotspot", "sharding"],
  ["cascading failure", "circuit-breaker"], ["chatty", "microservices"],
  ["distributed monolith", "microservices"], ["noisy neighbour", "cloud-platform"],
  ["mTLS", "mtls"], ["mutual TLS", "mtls"], ["zero trust", "mtls"],
  ["OpenAPI", "openapi"], ["postmortem", "incident-response"], ["runbook", "incident-response"],
  // "N+1" mostly matches the redundancy sense (N+1 capacity); the query
  // anti-pattern has its own section on the SQL page.
  ["N+1 quer", "sql"],
  // Wave 9 wrote these; the mapping keeps them watched, so a term that starts
  // drifting away from its page still shows up here.
  ["trunk-based", "trunk-based-development"], ["monorepo", "monorepo"],
  ["WebAssembly", "webassembly"], ["wasm", "webassembly"], ["eBPF", "ebpf"],
  ["feature store", "feature-store"],
  // No page, and nothing covers them — these are the open candidates.
  "vector clock", "bloom filter", "spot instance", "expand-contract",
  "semantic versioning", "gossip", "read repair",
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

function main() {
  const g = buildGraph();
  const files = walk(path.join(process.cwd(), "content"));
  const texts = files.map((f) => fs.readFileSync(f, "utf8"));

  const rows: { term: string; uses: number; pages: number }[] = [];
  for (const entry of WATCH) {
    const term = typeof entry === "string" ? entry : entry[0];
    const covered = typeof entry === "string" ? term.toLowerCase().replace(/\s+/g, "-") : entry[1];
    if (g.nodes.has(covered)) continue; // a page already answers it
    const re = new RegExp(`(?<![\\w-])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "gi");
    let uses = 0;
    let pages = 0;
    for (const t of texts) {
      const n = t.match(re)?.length ?? 0;
      if (n) {
        uses += n;
        pages++;
      }
    }
    if (uses) rows.push({ term, uses, pages });
  }
  rows.sort((a, b) => b.uses - a.uses || b.pages - a.pages);

  console.log("Terms the content uses with no page behind them:\n");
  console.log("  uses  pages  term");
  for (const r of rows) console.log(`  ${String(r.uses).padStart(4)}  ${String(r.pages).padStart(5)}  ${r.term}`);
  console.log(`\n${rows.length} of ${WATCH.length} watched terms have no node. A high count is a page worth writing.`);

  const pairs = similarButUnlinked();
  if (pairs.length) {
    console.log("\nPages covering the same ground with no edge between them:\n");
    for (const p of pairs) console.log(`  ${p.score.toFixed(3)}  ${p.a} ↔ ${p.b}`);
    console.log("\nJudgement required: a high score can mean a missing link or just two pages about security.");
  }
}

main();
