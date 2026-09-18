import fs from "node:fs";
import path from "node:path";

/**
 * Every distinct route shape, plus a deterministic spread through each long
 * tail. Sweeping the real sitemap rather than a hand-written list is what
 * caught the phone overflow on /radar and six /build pages — nobody would
 * have thought to list those.
 */
export function samplePages(): string[] {
  const xml = fs.readFileSync(path.join(process.cwd(), "out", "sitemap.xml"), "utf8");
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/")
    .sort();
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
