/**
 * Searching what the pages say, not only what they are called.
 *
 * `searchNodes` matches names, ids, tags and taglines, which cannot find
 * "thundering herd" or "coordinated omission" — both of which this site explains
 * at length. This is the second tier: an inverted index over the prose, fetched
 * only when someone actually searches.
 */
import { BASE_PATH } from "./useSearchIndex";

export interface TextIndex {
  ids: string[];
  /**
   * term → the pages containing it. A negative entry is `-(index + 1)` and means
   * the page uses the word more than twice — prominence without the cost of
   * storing a count per posting.
   */
  terms: Record<string, number[]>;
}

export interface TextHit {
  id: string;
  /** how many of the query's words the page contains */
  matched: number;
  /** the words it contains, for saying why it is here */
  words: string[];
}

let cache: TextIndex | null = null;
let inFlight: Promise<TextIndex | null> | null = null;

export function loadTextIndex(): Promise<TextIndex | null> {
  if (cache) return Promise.resolve(cache);
  inFlight ??= fetch(`${BASE_PATH}/search-text.json`)
    .then((r) => (r.ok ? (r.json() as Promise<TextIndex>) : null))
    .then((data) => {
      cache = data;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      if (!cache) inFlight = null;
    });
  return inFlight;
}

/** Query words worth looking up: the index drops anything shorter than three. */
export function queryTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length >= 3))];
}

/**
 * Pages containing the query's words, most complete match first. A page with
 * every word beats one with some, and among equals the rarer word wins —
 * a page that mentions "omission" is a better answer than one that mentions
 * "system".
 */
export function searchText(index: TextIndex, query: string, limit = 12): TextHit[] {
  const words = queryTerms(query).filter((w) => index.terms[w]);
  if (words.length === 0) return [];

  const scores = new Map<number, { matched: number; weight: number; words: string[] }>();
  for (const word of words) {
    const docs = index.terms[word];
    // rarer words say more about a page than common ones
    const weight = Math.log(index.ids.length / Math.max(docs.length, 1)) + 1;
    for (const entry of docs) {
      const prominent = entry < 0;
      const doc = prominent ? -entry - 1 : entry;
      const row = scores.get(doc) ?? { matched: 0, weight: 0, words: [] };
      row.matched++;
      row.weight += weight * (prominent ? 2.5 : 1);
      row.words.push(word);
      scores.set(doc, row);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1].matched - a[1].matched || b[1].weight - a[1].weight)
    .slice(0, limit)
    .map(([doc, row]) => ({ id: index.ids[doc], matched: row.matched, words: row.words }));
}
