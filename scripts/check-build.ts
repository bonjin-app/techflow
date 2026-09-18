/**
 * Two properties of the built site that nothing else checks: that every page is
 * still navigable without sight or a mouse, and that none of them has quietly
 * got fat.
 *
 * Static analysis of the exported HTML, so it needs no browser and runs in a
 * second. It cannot see colour contrast or focus order — those still need a
 * person — but it catches the regressions that arrive by accident.
 *
 *   pnpm check:build
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.join(process.cwd(), "out");

/** Gzip is what a static host serves, so raw bytes are the wrong budget. */
const BUDGET = {
  pageGzipKb: 45,
  totalJsGzipKb: 420,
};

function walk(dir: string, match: (f: string) => boolean): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, match) : match(full) ? [full] : [];
  });
}

const gzipKb = (buf: Buffer | string) => zlib.gzipSync(buf, { level: 9 }).length / 1024;

/** Text a screen reader would announce for an element's inner HTML. */
function accessibleText(inner: string): string {
  return inner
    .replace(/<[^>]*aria-label="([^"]*)"[^>]*>/g, " $1 ")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .trim();
}

function auditA11y(file: string, html: string): string[] {
  const rel = path.relative(OUT, file);
  const problems: string[] = [];

  if (!/<html[^>]*\slang="[a-z]{2}/i.test(html)) problems.push(`${rel}: <html> has no lang`);

  const titles = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titles || !titles[1].trim()) problems.push(`${rel}: empty or missing <title>`);

  for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
    if (!/\salt=/.test(img)) problems.push(`${rel}: <img> without alt — ${img.slice(0, 60)}`);
  }

  // Duplicate ids break every id-based ARIA relationship and anchor on the page.
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`${rel}: duplicate id "${id}"`);
    seen.add(id);
  }

  // One h1, and no skipped heading levels — this is the outline a screen reader navigates by.
  const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  const h1s = levels.filter((l) => l === 1).length;
  if (h1s !== 1) problems.push(`${rel}: ${h1s} <h1> elements, expected exactly 1`);
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) problems.push(`${rel}: heading jumps h${levels[i - 1]} → h${levels[i]}`);
  }

  // The name can come from the element's own aria-label as well as its content,
  // which is how every icon-only button on this site is labelled.
  const named = (attrs: string) => /\saria-label(ledby)?="[^"]+"/.test(attrs);
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    if (!named(m[1]) && !accessibleText(m[2])) problems.push(`${rel}: <button> with no accessible name — ${m[1].slice(0, 60)}`);
  }
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    if (named(m[1])) continue;
    if (!accessibleText(m[2])) problems.push(`${rel}: <a> with no accessible name — ${m[1].slice(0, 60)}`);
  }
  // Every input needs a name: aria-label, a label with a matching `for`, or a
  // label wrapped around it — the implicit association, which most of the
  // playground sliders use.
  const labelSpans = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    const input = m[0];
    if (/type="(hidden|submit|button)"/.test(input)) continue;
    if (/aria-label(ledby)?="[^"]+"/.test(input)) continue;
    const id = /\sid="([^"]+)"/.exec(input)?.[1];
    if (id && new RegExp(`<label[^>]*\\sfor="${id}"`).test(html)) continue;
    if (labelSpans.some(([start, end]) => m.index! > start && m.index! < end)) continue;
    problems.push(`${rel}: <input> with no label — ${input.slice(0, 70)}`);
  }
  return problems;
}

function main() {
  if (!fs.existsSync(OUT)) {
    console.error("✖ out/ not found — run `pnpm build` first.");
    process.exit(1);
  }

  const pages = walk(OUT, (f) => f.endsWith(".html"));
  const problems: string[] = [];
  let worst = { file: "", kb: 0 };

  for (const file of pages) {
    const html = fs.readFileSync(file, "utf8");
    problems.push(...auditA11y(file, html));
    const kb = gzipKb(html);
    if (kb > worst.kb) worst = { file: path.relative(OUT, file), kb };
    if (kb > BUDGET.pageGzipKb) problems.push(`${path.relative(OUT, file)}: ${kb.toFixed(0)}KB gzipped, over the ${BUDGET.pageGzipKb}KB page budget`);
  }

  const js = walk(path.join(OUT, "_next"), (f) => f.endsWith(".js"));
  const jsKb = js.reduce((a, f) => a + gzipKb(fs.readFileSync(f)), 0);
  if (jsKb > BUDGET.totalJsGzipKb) problems.push(`JavaScript totals ${jsKb.toFixed(0)}KB gzipped, over the ${BUDGET.totalJsGzipKb}KB budget`);

  for (const p of problems.slice(0, 25)) console.error(`  ✖ ${p}`);
  console.log(
    `\n${pages.length} pages audited · largest ${worst.file} at ${worst.kb.toFixed(0)}KB gzipped (budget ${BUDGET.pageGzipKb}) · ` +
      `${js.length} scripts totalling ${jsKb.toFixed(0)}KB gzipped (budget ${BUDGET.totalJsGzipKb})`,
  );
  if (problems.length) {
    console.error(`✖ ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log("✔ every page is navigable and inside its budget");
}

main();
