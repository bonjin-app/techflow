/**
 * Writes the client search index to `public/search-index.json`.
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

  const out = path.join(process.cwd(), "public", "search-index.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(index));
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`✔ public/search-index.json — ${index.length} nodes, ${kb} KB`);
}

main();
