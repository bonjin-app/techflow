import fs from "node:fs";
import path from "node:path";

/**
 * Every page in the built sitemap. Sweeps cheap enough to run per page use
 * this: a sample covers about a fifth of the site and rotates as content is
 * added, so a violation can sit unseen for months and then surface on an
 * unrelated commit — which is exactly how a code block that could not be
 * scrolled by keyboard went unnoticed.
 */
/** Where the host mounts this site: "" at a domain root, "/<repo>" on Pages. */
export const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

/**
 * A site-relative route as the server actually serves it. Playwright's baseURL
 * cannot do this: a path beginning with "/" throws away the base URL's own
 * path, so "/concept/cache" would never reach "/techflow/concept/cache".
 */
export const at = (route: string) => `${BASE}${route}`;

export function allPages(): string[] {
  // Site-relative, with the host's mount point removed: Playwright's baseURL
  // carries it, so a test never has to know whether the site sits at the root
  // or under /<repo>.
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  const xml = fs.readFileSync(path.join(process.cwd(), "out", "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(/^https?:\/\/[^/]+/, ""))
    .map((p) => (base && p.startsWith(base) ? p.slice(base.length) : p))
    .map((p) => p.replace(/\/$/, "") || "/")
    .sort();
}

/** A spread for sweeps too slow to run 288 times: every route shape, then every
 *  nth page of each long tail. */
export function samplePages(): string[] {
  const paths = allPages();
  const byShape = new Map<string, string[]>();
  for (const p of paths) {
    const shape = p === "/" ? "/" : `/${p.split("/")[1]}`;
    byShape.set(shape, [...(byShape.get(shape) ?? []), p]);
  }
  const picked: string[] = [];
  for (const [, list] of byShape) {
    picked.push(list[0]);
    for (let i = 1; i < list.length; i += Math.max(1, Math.ceil(list.length / 5))) picked.push(list[i]);
  }
  return [...new Set(picked)];
}
