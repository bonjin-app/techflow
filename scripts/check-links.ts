/**
 * Smoke-tests the static export in `out/`: every internal link must resolve to a
 * file that was actually generated, and every generated page must be reachable.
 *
 * `pnpm validate` checks the content graph; this checks the rendered site, so it
 * catches route/link mismatches the graph cannot see.
 *
 *   pnpm build && pnpm check:links
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const BASE = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

/** "/technology/redis" → does out/technology/redis.html (or /index.html) exist? */
function resolves(href: string): boolean {
  const clean = href.replace(/[?#].*$/, "");
  const rel = clean === "/" ? "index.html" : clean.replace(/^\//, "");
  if (fs.existsSync(path.join(OUT, rel))) return true;
  if (fs.existsSync(path.join(OUT, `${rel}.html`))) return true;
  if (fs.existsSync(path.join(OUT, rel, "index.html"))) return true;
  return false;
}

function main() {
  if (!fs.existsSync(OUT)) {
    console.error("✖ out/ not found — run `pnpm build` first.");
    process.exit(1);
  }
  const pages = walk(OUT);
  const broken = new Map<string, Set<string>>(); // href → pages that link to it
  const linkedTo = new Set<string>();
  let checked = 0;

  for (const file of pages) {
    const html = fs.readFileSync(file, "utf8");
    const from = "/" + path.relative(OUT, file).replace(/\.html$/, "").replace(/\/index$/, "");
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      let href = m[1];
      if (!href.startsWith("/")) continue; // external, anchors, mailto
      if (BASE && href.startsWith(BASE + "/")) href = href.slice(BASE.length) || "/";
      if (/^\/_next\//.test(href) || /\.(json|xml|txt|ico|png|svg|webmanifest|js|css)$/.test(href)) continue;
      checked++;
      linkedTo.add(href.replace(/[?#].*$/, ""));
      if (!resolves(href)) {
        if (!broken.has(href)) broken.set(href, new Set());
        broken.get(href)!.add(from);
      }
    }
  }

  // Pages nothing links to (excluding the ones that are intentionally standalone).
  const EXPECTED_ORPHANS = new Set(["/404", "/_not-found"]);
  const orphans = pages
    .map((f) => "/" + path.relative(OUT, f).replace(/\.html$/, "").replace(/\/index$/, ""))
    .map((p) => (p === "/index" ? "/" : p))
    .filter((p) => p !== "/" && !linkedTo.has(p) && !EXPECTED_ORPHANS.has(p));

  for (const [href, froms] of broken) {
    console.error(`  ✖ ${href} — linked from ${[...froms].slice(0, 3).join(", ")}${froms.size > 3 ? ` (+${froms.size - 3} more)` : ""}`);
  }
  for (const o of orphans) console.warn(`  ⚠ ${o} — generated but nothing links to it`);

  console.log(`\n${pages.length} pages, ${checked} internal links checked`);
  if (broken.size > 0) {
    console.error(`✖ ${broken.size} broken link target(s)`);
    process.exit(1);
  }
  console.log(`✔ all internal links resolve (${orphans.length} orphan page(s))`);
}

main();
