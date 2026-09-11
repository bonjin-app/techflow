/**
 * Validates every content file and the knowledge graph built from it.
 * Fails (exit 1) on broken links, missing required sections or bad shapes.
 *
 *   pnpm validate
 */
import fs from "node:fs";
import path from "node:path";
import { buildGraph, getNeighbors } from "../src/lib/content/graph";
import { hrefFor, type DocNode } from "../src/lib/content/types";

const REQUIRED_SECTIONS: Record<DocNode["type"], string[]> = {
  technology: ["TL;DR", "Why", "Advantages", "Trade-offs", "When to use", "When not to use"],
  concept: ["TL;DR", "Why it matters"],
  pattern: ["Problem", "Solution", "How it works", "Advantages", "Disadvantages", "When to use", "When not to use"],
};

const KNOWN_FENCES = new Set(["steps", "sequence", "compare", "decision", "timeline", "text", "json", "http", "ts", "tsx", "js", "jsx", "sql", "bash", "yaml", "python", "java", "go", "kotlin", "swift", "dart", "rust", "hcl", "html", "css"]);

function main() {
  let g;
  try {
    g = buildGraph();
  } catch (e) {
    console.error(`✖ ${(e as Error).message}`);
    process.exit(1);
  }
  const problems = [...g.problems];
  const warnings: string[] = [];

  for (const n of g.nodes.values()) {
    if (n.difficulty < 1 || n.difficulty > 5) problems.push(`${n.id}: difficulty must be 1–5`);
    if (n.tagline.length > 90) warnings.push(`${n.id}: tagline is long (${n.tagline.length} chars)`);

    if (n.type === "technology" || n.type === "concept" || n.type === "pattern") {
      for (const s of REQUIRED_SECTIONS[n.type]) {
        if (!n.sections[s]) problems.push(`${n.id}: missing required section '## ${s}'`);
      }
      const degree = g.adjacency.get(n.id)?.length ?? 0;
      if (degree < 3) warnings.push(`${n.id}: only ${degree} edges — the graph will feel thin here`);
      for (const [heading, md] of Object.entries(n.sections)) {
        const fences = [...md.matchAll(/^```(\w+)/gm)].map((m) => m[1]);
        for (const f of fences) if (!KNOWN_FENCES.has(f)) warnings.push(`${n.id} › ${heading}: unknown fence '${f}'`);
        // internal links must resolve
        for (const m of md.matchAll(/\]\(\/(technology|concept|pattern|architecture|compare|roadmap|system-design)\/([a-z0-9-]+)\)/g)) {
          const target = g.nodes.get(m[2]);
          if (!target) {
            problems.push(`${n.id} › ${heading}: link to unknown node '/${m[1]}/${m[2]}'`);
            continue;
          }
          // The id can exist under a different route — /concept/microservices when
          // microservices is an architecture. That 404s, so check the segment too.
          const href = hrefFor(target.type, target.id);
          if (href !== `/${m[1]}/${m[2]}`) {
            problems.push(`${n.id} › ${heading}: link '/${m[1]}/${m[2]}' has the wrong type — it is ${href}`);
          }
        }
      }
    }
    if (n.type === "architecture") {
      if (n.flows.length === 0) warnings.push(`${n.id}: architecture has no flows (no ▶ Run animation)`);
      const refs = n.nodes.filter((x) => x.ref).length;
      if (refs === 0) problems.push(`${n.id}: no diagram node has a 'ref' — inspector cannot link to the graph`);
    }
  }

  // A cycle in REQUIRES edges means a learning path that can never be started.
  {
    const requires = new Map<string, string[]>();
    for (const e of g.edges) {
      if (e.rel !== "REQUIRES") continue;
      if (!requires.has(e.from)) requires.set(e.from, []);
      requires.get(e.from)!.push(e.to);
    }
    const state = new Map<string, 0 | 1 | 2>(); // unvisited | on stack | done
    const stack: string[] = [];
    const reported = new Set<string>();
    const walk = (id: string) => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) {
        const cycle = [...stack.slice(stack.indexOf(id)), id];
        const key = [...cycle].sort().join("|");
        if (!reported.has(key)) {
          reported.add(key);
          problems.push(`prerequisite cycle: ${cycle.join(" → ")}`);
        }
        return;
      }
      state.set(id, 1);
      stack.push(id);
      for (const next of requires.get(id) ?? []) walk(next);
      stack.pop();
      state.set(id, 2);
    };
    for (const id of g.nodes.keys()) walk(id);
  }

  // A roadmap step or stack item written as plain text when a node of that name
  // exists is a missed link — the graph should absorb it.
  const byName = new Map<string, string>();
  for (const n of g.nodes.values()) byName.set(n.name.toLowerCase(), n.id);
  for (const n of g.nodes.values()) {
    if (n.type !== "roadmap") continue;
    for (const step of n.steps) {
      if (step.ref) continue;
      const hit = byName.get(step.label.toLowerCase());
      // Two different gaps: a link we could make today, and a page nobody has
      // written. Both leave the reader at a dead end, so both are reported.
      if (hit) warnings.push(`${n.id}: step '${step.label}' has no ref but node '${hit}' exists`);
      else warnings.push(`${n.id}: step '${step.label}' has no node — the path dead-ends here`);
    }
  }
  // The product's first success criterion is a specific walk: from Redis to the
  // idea of a distributed system, one click per hop, feeling like the pieces
  // connect. It broke once when nobody was watching, so it is a test now.
  const FIRST_JOURNEY = ["redis", "cache", "cache-aside", "e-commerce", "postgresql", "transaction", "distributed-system"];
  for (let i = 0; i < FIRST_JOURNEY.length - 1; i++) {
    const [a, b] = [FIRST_JOURNEY[i], FIRST_JOURNEY[i + 1]];
    if (!getNeighbors(a).some((n) => n.node.id === b)) {
      problems.push(`first journey: '${a}' → '${b}' is not one click — the reader hits a dead end here`);
    }
  }

  // No JSON field is rendered as Markdown — every one of them is printed as
  // plain text — so a link written in a .json file shows the reader raw
  // brackets. Cheaper to catch here than in a screenshot.
  const CONTENT = path.join(process.cwd(), "content");
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : full.endsWith(".json") ? [full] : [];
    });
  for (const file of walk(CONTENT)) {
    const text = fs.readFileSync(file, "utf8");
    const hit = /\[[^\]\n]{1,80}\]\(\/[^)\n]{1,120}\)/.exec(text);
    if (hit) problems.push(`${path.relative(CONTENT, file)}: Markdown link '${hit[0]}' in JSON — it renders as literal text`);
  }

  for (const st of g.stacks) {
    for (const layer of st.layers) {
      for (const item of layer.items) {
        if (item.ref || !item.label) continue;
        const hit = byName.get(item.label.toLowerCase());
        if (hit) warnings.push(`stack '${st.id}': item '${item.label}' has no ref but node '${hit}' exists`);
      }
    }
  }

  for (const w of warnings) console.warn(`  ⚠ ${w}`);
  for (const p of problems) console.error(`  ✖ ${p}`);

  const counts: Record<string, number> = {};
  for (const n of g.nodes.values()) counts[n.type] = (counts[n.type] ?? 0) + 1;
  console.log(
    `\n${g.nodes.size} nodes, ${g.edges.length} edges, ${g.builds.length} build goals, ` +
      `${g.stacks.length} stacks, ${g.challenges.length} challenges, ${g.radar.entries.length} radar entries — ` +
      Object.entries(counts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", "),
  );
  if (problems.length) {
    console.error(`\n✖ ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`✔ content OK (${warnings.length} warning(s))`);
}

main();
