/**
 * Validates every content file and the knowledge graph built from it.
 * Fails (exit 1) on broken links, missing required sections or bad shapes.
 *
 *   pnpm validate
 */
import { buildGraph } from "../src/lib/content/graph";
import type { DocNode } from "../src/lib/content/types";

const REQUIRED_SECTIONS: Record<DocNode["type"], string[]> = {
  technology: ["TL;DR", "Why", "Advantages", "Trade-offs", "When to use", "When not to use"],
  concept: ["TL;DR", "Why it matters"],
  pattern: ["Problem", "Solution", "How it works", "Advantages", "Disadvantages", "When to use", "When not to use"],
};

const KNOWN_FENCES = new Set(["steps", "sequence", "compare", "decision", "timeline", "text", "json", "http", "ts", "js", "sql", "bash", "yaml", "python", "java", "go"]);

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
          if (!g.nodes.has(m[2])) problems.push(`${n.id} › ${heading}: link to unknown node '/${m[1]}/${m[2]}'`);
        }
      }
    }
    if (n.type === "architecture") {
      if (n.flows.length === 0) warnings.push(`${n.id}: architecture has no flows (no ▶ Run animation)`);
      const refs = n.nodes.filter((x) => x.ref).length;
      if (refs === 0) problems.push(`${n.id}: no diagram node has a 'ref' — inspector cannot link to the graph`);
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
