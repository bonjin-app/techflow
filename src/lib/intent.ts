import type { NodeSummary } from "./content/types";

/**
 * Turns a sentence into a route through the graph.
 *
 * Someone types "I want to build a chat app but I don't understand why I need
 * Redis and Kafka". A keyword search answers with pages containing the word
 * "chat"; what they actually asked for is a goal, the technologies they named,
 * and the concepts that connect them. This module recognises the shape of the
 * question locally — no model, no network — and hands back the pieces the
 * search page assembles into an answer.
 *
 * It is deliberately conservative: if nothing recognisable is in the sentence it
 * returns null and the page falls back to ordinary ranked search.
 */

export type IntentKind = "build" | "why" | "compare" | "how" | "learn";

export interface BuildTarget {
  id: string;
  name: string;
  tagline: string;
}

export interface Intent {
  kind: IntentKind;
  /** The "I want to build …" goal the sentence points at, if any. */
  goal?: BuildTarget;
  /** Nodes named in the sentence, most relevant first. */
  mentioned: NodeSummary[];
  /** A comparison node covering the two things being weighed up. */
  comparison?: NodeSummary;
  /** One sentence describing what we think was asked, shown back to the reader. */
  reading: string;
  /** Which words drove the match — shown so the reader can see it is not magic. */
  matched: string[];
}

/** Goal keywords → build id. Multi-word phrases are checked first. */
const GOAL_WORDS: [string[], string][] = [
  [["real-time chat", "realtime chat", "chat app", "chat server", "messaging app", "chat", "messaging"], "real-time-chat"],
  [["online store", "e-commerce", "ecommerce", "shop", "checkout", "cart", "storefront"], "e-commerce"],
  [["ai app", "ai application", "rag", "chatbot", "llm app", "assistant", "semantic search"], "ai-application"],
  [["saas", "multi-tenant", "multitenant", "subscription app", "b2b app"], "saas"],
  [["notification", "push notification", "email sending", "alerting users", "sms"], "notification"],
  [["video", "streaming platform", "video platform", "vod"], "video-platform"],
  [["search engine", "search feature", "autocomplete", "full-text search", "site search"], "search-engine"],
  [["analytics", "data platform", "dashboard", "reporting", "event pipeline", "warehouse"], "data-platform"],
  [["iot", "telemetry", "devices", "sensors"], "iot-product"],
];

const KIND_WORDS: [string[], IntentKind][] = [
  [["want to build", "build a", "building a", "make a", "making a", "create a", "how do i build", "i need to build"], "build"],
  [["vs", "versus", "or should i", "which one", "difference between", "compare"], "compare"],
  [["why do i need", "why use", "why would", "do i need", "why is", "why does"], "why"],
  [["how does", "how do i", "how to", "how should"], "how"],
  [["learn", "study", "roadmap", "where do i start", "getting started", "beginner"], "learn"],
];

/** Words that are too generic to treat as a node mention. */
const STOP = new Set([
  "a", "an", "and", "the", "for", "with", "to", "of", "in", "on", "is", "are", "do", "does", "i", "my", "me", "we",
  "want", "need", "build", "building", "make", "making", "use", "using", "how", "why", "what", "when", "which",
  "should", "would", "can", "could", "but", "not", "dont", "don", "understand", "know", "app", "application",
  "server", "service", "system", "data", "user", "users", "best", "good", "better", "vs", "versus", "or",
]);

function norm(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s/+-]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Shorthand developers actually type, mapped to node ids. Only unambiguous ones. */
const ALIASES: Record<string, string> = {
  postgres: "postgresql",
  psql: "postgresql",
  mongo: "mongodb",
  k8s: "kubernetes",
  kube: "kubernetes",
  rabbit: "rabbitmq",
  "node js": "nodejs",
  node: "nodejs",
  "next js": "nextjs",
  websockets: "websocket",
  webhooks: "webhook",
  embeddings: "embedding",
  "vector db": "vector-database",
  "vector store": "vector-database",
  llms: "llm",
  agents: "ai-agent",
  microservice: "microservices",
  queues: "message-queue",
  queue: "message-queue",
};

/** Node names/ids named in the sentence. Longest names win, so "vector database" beats "database". */
function findMentions(q: string, index: NodeSummary[]): { nodes: NodeSummary[]; words: string[] } {
  const hay = ` ${q} `;
  const hits: { node: NodeSummary; weight: number; word: string }[] = [];
  const claimed: [number, number][] = [];

  const candidates = index
    .filter((n) => ["technology", "concept", "pattern"].includes(n.type))
    .flatMap((n) => {
      const names = new Set<string>([norm(n.name), n.id.replace(/-/g, " ")]);
      // "Server-Sent Events (SSE)" should also match "sse"
      const paren = /\(([^)]+)\)/.exec(n.name);
      if (paren) names.add(norm(paren[1]));
      for (const [alias, id] of Object.entries(ALIASES)) if (id === n.id) names.add(alias);
      return [...names].filter((t) => t.length > 1 && !STOP.has(t)).map((term) => ({ node: n, term }));
    })
    .sort((a, b) => b.term.length - a.term.length);

  for (const { node, term } of candidates) {
    const at = hay.indexOf(` ${term} `);
    if (at === -1) continue;
    // do not match inside a span already taken by a longer name
    if (claimed.some(([s, e]) => at >= s && at < e)) continue;
    claimed.push([at, at + term.length + 2]);
    if (hits.some((h) => h.node.id === node.id)) continue;
    hits.push({ node, weight: term.length + node.degree * 0.05, word: term });
  }

  hits.sort((a, b) => b.weight - a.weight);
  return { nodes: hits.slice(0, 6).map((h) => h.node), words: hits.slice(0, 6).map((h) => h.word) };
}

/** Longest phrase across all goals wins, so "chatbot" is not read as "chat". */
const GOAL_TERMS: { term: string; id: string }[] = GOAL_WORDS.flatMap(([words, id]) => words.map((term) => ({ term, id })))
  .sort((a, b) => b.term.length - a.term.length);

/** Whole-word/phrase containment: " chat " matches, "chatbot" does not. */
function has(q: string, term: string) {
  return ` ${q} `.includes(` ${term} `);
}

function findGoal(q: string, builds: BuildTarget[]): { goal?: BuildTarget; word?: string } {
  for (const { term, id } of GOAL_TERMS) {
    if (!has(q, term)) continue;
    const goal = builds.find((b) => b.id === id);
    if (goal) return { goal, word: term };
  }
  return {};
}

const KIND_TERMS: { term: string; kind: IntentKind }[] = KIND_WORDS.flatMap(([words, kind]) => words.map((term) => ({ term, kind })))
  .sort((a, b) => b.term.length - a.term.length);

function findKind(q: string): { kind: IntentKind; word?: string } {
  for (const { term, kind } of KIND_TERMS) if (has(q, term)) return { kind, word: term };
  return { kind: "learn" };
}

/**
 * Recognise a question. Returns null when the sentence is just a keyword or two
 * — ordinary search already handles that better than a guess would.
 */
export function detectIntent(rawQuery: string, index: NodeSummary[], builds: BuildTarget[]): Intent | null {
  const q = norm(rawQuery);
  if (!q) return null;
  const words = q.split(" ");
  // one or two bare words is a lookup, not a question
  const looksLikeSentence = words.length >= 3;

  const { kind, word: kindWord } = findKind(q);
  const { goal, word: goalWord } = findGoal(q, builds);
  const { nodes: mentioned, words: mentionWords } = findMentions(q, index);

  // A question can name a goal *and* a choice ("build a chatbot, RAG or fine-tuning?"),
  // so look for a comparison whenever two named things share one, not only when the
  // phrasing happened to read as a comparison.
  const comparison =
    mentioned.length >= 2
      ? index.find(
          (n) => n.type === "comparison" && mentioned.slice(0, 4).filter((m) => n.id.split(/-vs-|-/).includes(m.id) || n.id.includes(m.id)).length >= 2,
        )
      : undefined;

  const hasSignal = !!goal || comparison || (looksLikeSentence && mentioned.length > 0 && kindWord);
  if (!hasSignal) return null;

  const names = mentioned.map((m) => m.name);
  let reading: string;
  if (goal && comparison) reading = `You want to build ${goal.name}, and you are choosing between ${names.slice(0, 2).join(" and ")}.`;
  else if (goal && names.length > 0) reading = `You want to build ${goal.name}, and you asked about ${names.slice(0, 3).join(", ")}.`;
  else if (goal) reading = `You want to build ${goal.name}.`;
  else if (comparison) reading = `You are weighing up ${names.slice(0, 2).join(" against ")}.`;
  else if (kind === "why") reading = `You are asking why ${names[0]} is needed.`;
  else if (kind === "how") reading = `You are asking how ${names[0]} works.`;
  else reading = `You are looking for a path through ${names.slice(0, 3).join(", ")}.`;

  return {
    kind: goal ? "build" : comparison ? "compare" : kind,
    goal,
    mentioned,
    comparison,
    reading,
    matched: [goalWord, kindWord, ...mentionWords].filter((w): w is string => !!w),
  };
}
