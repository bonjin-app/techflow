/**
 * The search box is the front door: a question must be understood, and a
 * keyword must rank the page it names first. Both are promises the product
 * makes, and both have broken silently before.
 *
 *   pnpm check:intent
 */
import { buildGraph, getBuilds, getSearchIndex } from "../src/lib/content/graph";
import { detectIntent, type IntentKind } from "../src/lib/intent";
import { searchNodes } from "../src/lib/search";

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

  for (const f of failures) console.error(`  ✖ ${f}`);
  console.log(`\n${CASES.length} question(s) and ${RANKING.length} keyword(s) checked`);
  if (failures.length) {
    console.error(`✖ ${failures.length} search failure(s)`);
    process.exit(1);
  }
  console.log("✔ every example question is understood and every keyword ranks its page first");
}

main();
