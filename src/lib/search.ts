import type { NodeSummary, NodeType } from "./content/types";
import { ALIASES } from "./aliases";

export interface SearchHit {
  item: NodeSummary;
  score: number;
}

const TYPE_ORDER: NodeType[] = [
  "technology",
  "concept",
  "pattern",
  "architecture",
  "comparison",
  "system-design",
  "roadmap",
];

function norm(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s/-]/gu, " ");
}

/**
 * Letters and digits only. Nobody types the punctuation in a name: "ci cd" and
 * "cicd" both mean CI/CD, "fan out" means Fan-out, "next js" means Next.js.
 * Comparing on this form makes those the exact matches they plainly are.
 */
function flat(s: string) {
  return norm(s).replace(/[^\p{L}\p{N}]/gu, "");
}

/** Subsequence match ("rds" → "redis") — returns a small score or 0. */
function fuzzy(query: string, target: string): number {
  let qi = 0;
  let streak = 0;
  let score = 0;
  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i] === query[qi]) {
      qi++;
      streak++;
      score += 1 + streak * 0.5;
    } else streak = 0;
  }
  return qi === query.length ? score / (target.length + 1) : 0;
}

/**
 * Damerau-Levenshtein, capped. Subsequence matching cannot see a transposition
 * — "redsi" needs an 'i' after the 's' and Redis has none — and transposing two
 * keys is the typo people actually make.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  let prevPrev: number[] = prev2;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prevPrev[j - 2] + 1);
      row.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Rank nodes for a query. Exact name > prefix > word match > tag/tagline >
 * fuzzy. Ties broken by graph degree so hub nodes surface first.
 */
export function searchNodes(index: NodeSummary[], rawQuery: string, limit = 24): SearchHit[] {
  const q = norm(rawQuery).trim();
  if (!q) return [];
  const qFlat = flat(rawQuery);
  const words = q.split(/\s+/).filter(Boolean);
  // "k8s", "adr", "postgres" — what people type instead of the page's name.
  const aliased = ALIASES[q];
  const wordAliases = new Set(words.map((w) => ALIASES[w]).filter(Boolean));
  const hits: SearchHit[] = [];
  for (const item of index) {
    const name = norm(item.name);
    const tags = item.tags.map(norm);
    const tagline = norm(item.tagline);
    const id = item.id;
    let score = 0;
    // An exact name is not a hint, it is the answer, so it outranks everything
    // a partial match can accumulate. Typing "SQL" used to return SQLite and
    // "Authentication" the authentication *system*, each beating the page named
    // exactly that by a single point picked up from a tag.
    if (name === q || id === q || id === aliased || flat(name) === qFlat || flat(id) === qFlat) score += 1000;
    // A prefix of a short name is a better match than a prefix of a long one:
    // "cach" means Cache, not Cache Invalidation, even though both start with it.
    else if (name.startsWith(q) || id.startsWith(q)) score += 60 + Math.round((40 * q.length) / Math.max(name.length, 1));
    else if (name.includes(q)) score += 40;
    if (wordAliases.has(id)) score += 30;
    for (const w of words) {
      if (w.length < 2) continue;
      if (name.split(/\s+/).some((n) => n.startsWith(w))) score += 20;
      if (tags.some((t) => t === w)) score += 14;
      else if (tags.some((t) => t.includes(w))) score += 8;
      if (tagline.includes(w)) score += 6;
      if (norm(item.category) === w) score += 6;
    }
    if (score === 0 && q.length >= 3) {
      score += fuzzy(q, name) * 25;
      if (score === 0) {
        // one typo in a short query, two in a longer one
        const budget = q.length <= 6 ? 1 : 2;
        const d = Math.min(editDistance(q, name, budget), editDistance(q, id, budget));
        if (d <= budget) score += 30 - d * 8;
      }
    }
    if (score > 0) hits.push({ item, score: score + Math.min(item.degree, 20) * 0.15 });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function groupByType(hits: SearchHit[]): { type: NodeType; items: NodeSummary[] }[] {
  const map = new Map<NodeType, NodeSummary[]>();
  for (const h of hits) {
    if (!map.has(h.item.type)) map.set(h.item.type, []);
    map.get(h.item.type)!.push(h.item);
  }
  return TYPE_ORDER.filter((t) => map.has(t)).map((type) => ({ type, items: map.get(type)! }));
}
