import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const sources = walk(path.join(process.cwd(), "src")).filter((f) => /\.tsx?$/.test(f));
const rel = (f: string) => path.relative(process.cwd(), f);

/**
 * The site takes untrusted input in three places — a pasted JWT, a search query
 * and the path finder's parameters — and React escapes all of it. These guard
 * the two ways that stops being true: raw HTML rendered from something a user
 * controls, or a markdown pipeline taught to pass HTML through.
 */
describe("untrusted input stays data", () => {
  // Both of these are constants or JSON with `<` escaped. Anything else using
  // raw HTML needs a reason, and a reader of this test deserves to see it.
  const ALLOWED = ["src/app/layout.tsx", "src/components/ui/JsonLd.tsx"];

  it("renders raw HTML in exactly two known places", () => {
    const users = sources.filter((f) => fs.readFileSync(f, "utf8").includes("dangerouslySetInnerHTML")).map(rel);
    expect(users.sort()).toEqual(ALLOWED.sort());
  });

  it("escapes the sequence that would close a script tag out of structured data", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/ui/JsonLd.tsx"), "utf8");
    // JSON.stringify does not escape "<", so "</script>" inside any string
    // field would end the block and start markup.
    expect(src).toMatch(/replace\(\/<\/g, *"\\\\u003c"\)/);
  });

  it("does not let markdown carry HTML through", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    // react-markdown escapes HTML unless one of these is added to the pipeline.
    expect(deps.filter((d) => /rehype-raw|remark-html|rehype-sanitize/.test(d))).toEqual([]);
    for (const f of sources) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/allowDangerousHtml|skipHtml=\{false\}/);
    }
  });
});
