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
  // No page, and nothing covers them — these are the open candidates.
  "vector clock", "bloom filter", "spot instance", "expand-contract", "trunk-based",
  "monorepo", "semantic versioning", "WebAssembly", "eBPF", "gossip", "read repair",
  "feature store",
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
}

main();
