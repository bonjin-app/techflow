import type { NodeSummary, NodeType } from "./content/types";

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
 * Rank nodes for a query. Exact name > prefix > word match > tag/tagline >
 * fuzzy. Ties broken by graph degree so hub nodes surface first.
 */
export function searchNodes(index: NodeSummary[], rawQuery: string, limit = 24): SearchHit[] {
  const q = norm(rawQuery).trim();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  for (const item of index) {
    const name = norm(item.name);
    const tags = item.tags.map(norm);
    const tagline = norm(item.tagline);
    const id = item.id;
    let score = 0;
    if (name === q || id === q) score += 100;
    else if (name.startsWith(q) || id.startsWith(q)) score += 60;
    else if (name.includes(q)) score += 40;
    for (const w of words) {
      if (w.length < 2) continue;
      if (name.split(/\s+/).some((n) => n.startsWith(w))) score += 20;
      if (tags.some((t) => t === w)) score += 14;
      else if (tags.some((t) => t.includes(w))) score += 8;
      if (tagline.includes(w)) score += 6;
      if (norm(item.category) === w) score += 6;
    }
    if (score === 0 && q.length >= 3) score += fuzzy(q, name) * 25;
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
