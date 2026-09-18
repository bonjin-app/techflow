/**
 * Writes the client search indexes to `public/`.
 *
 * The index used to be embedded in every page's HTML via the command palette,
 * which added tens of kilobytes to all 180 pages. Now it is one static file the
 * palette fetches on first use and the browser caches.
 *
 *   pnpm gen:index
 */
import fs from "node:fs";
import path from "node:path";
import { buildGraph, summarize } from "../src/lib/content/graph";

function write(name: string, data: unknown) {
  const out = path.join(process.cwd(), "public", name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data));
  return (fs.statSync(out).size / 1024).toFixed(1);
}

function main() {
  const g = buildGraph();
  const index = [...g.nodes.values()]
    .map((n) => summarize(n, g))
    // drop `tags` — search matches on them, but they cost bytes; keep the useful fields
    .map(({ id, type, name, tagline, category, tags, difficulty, href, degree }) => ({
      id,
      type,
      name,
      tagline,
      category,
      tags,
      difficulty,
      href,
      degree,
    }))
    .sort((a, b) => b.degree - a.degree);

  const kb = write("search-index.json", index);
  console.log(`✔ public/search-index.json — ${index.length} nodes, ${kb} KB`);

  // ── full text ────────────────────────────────────────────
  // Name matching cannot find "thundering herd" or "coordinated omission", both
  // of which this site explains at length. An inverted index over the prose
  // makes the 243 pages searchable by what they say, not only by what they are
  // called. It is fetched only when someone searches, never by the palette.
  const STOP = new Set(
    ("a an and or of to in on is are be as it its that this for with from by at not you your we they if then than so " +
      "but can could should would do does did have has had will when where which who what how why more most other some " +
      "such no nor too very just only also into over under again further once here there all any both each few own same " +
      "now one two three them their there's it's dont don't been being was were").split(" "),
  );
  const ids: string[] = [];
  const postings = new Map<string, number[]>();
  for (const n of g.nodes.values()) {
    const sections = "sections" in n ? (n.sections as Record<string, string>) : undefined;
    // Architectures and system designs carry their prose in JSON fields, so fall
    // back to the whole node rather than indexing nothing for them.
    const body = sections ? Object.values(sections).join(" ") : JSON.stringify(n);
    const words = body
      .toLowerCase()
      .replace(/```[\s\S]*?```/g, " ") // code blocks are noise in a prose search
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/);
    const doc = ids.length;
    ids.push(n.id);
    const counts = new Map<string, number>();
    for (const w of words) {
      const term = w.replace(/^-+|-+$/g, "");
      if (term.length < 3 || term.length > 24 || STOP.has(term)) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
    for (const [term, count] of counts) {
      // A page that says "amplification" five times is about it; one that says it
      // once mentions it. Storing the count would double the file, so prominence
      // is encoded in the sign: negative means "said it more than twice".
      postings.set(term, [...(postings.get(term) ?? []), count > 2 ? -(doc + 1) : doc]);
    }
  }
  // A term on a quarter of the site does not narrow anything down.
  const terms: Record<string, number[]> = {};
  for (const [term, docs] of postings) if (docs.length <= ids.length * 0.25) terms[term] = docs;
  const tkb = write("search-text.json", { ids, terms });
  console.log(`✔ public/search-text.json — ${ids.length} pages, ${Object.keys(terms).length} terms, ${tkb} KB`);

  // "I want to build …" goals, so the search page can recognise a goal in a sentence.
  // `pages` is what the goal is made of, so a client can say how far in a
  // reader is without fetching ten more files.
  const goals = g.builds.map(({ id, name, tagline, technologies, concepts, patterns }) => ({
    id,
    name,
    tagline,
    pages: [...new Set([...technologies, ...concepts, ...patterns])],
  }));
  const gkb = write("build-goals.json", goals);
  console.log(`✔ public/build-goals.json — ${goals.length} goals, ${gkb} KB`);
}

main();
