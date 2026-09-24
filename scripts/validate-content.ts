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
import { FIRST_JOURNEY } from "../src/lib/site";
import { parseCompare, parseDecision, parseSequence, parseSteps, parseTimeline, type DecisionNode } from "../src/lib/fences";

/** Every ref a fence renderer will try to turn into a link. */
function fenceRefs(kind: string, body: string): string[] {
  const leaves = (d: DecisionNode | null): string[] =>
    d ? [...(d.ref ? [d.ref] : []), ...(d.answers ?? []).flatMap((a) => leaves(a.next))] : [];
  if (kind === "steps") return parseSteps(body).steps.map((x) => x.ref).filter((r): r is string => !!r);
  if (kind === "sequence") return parseSequence(body).participants.map((x) => x.ref).filter((r): r is string => !!r);
  if (kind === "compare") return parseCompare(body).header.map((h) => /\[([a-z0-9-]+)\]\s*$/.exec(h)?.[1]).filter((r): r is string => !!r);
  if (kind === "decision") return leaves(parseDecision(body).root);
  return [];
}

const SETUP_SECTIONS = ["TL;DR", "Why this pairing", "Set it up", "Verify", "Going to production", "When not to", "References"];

const REQUIRED_SECTIONS: Record<DocNode["type"] | "comparison", string[]> = {
  comparison: ["TL;DR", "Comparison", "Decision"],
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
  /** Page name, lowercased, to its id — for spotting a label that names another page. */
  const byName = new Map<string, string>();
  for (const n of g.nodes.values()) byName.set(n.name.toLowerCase(), n.id);


  for (const n of g.nodes.values()) {
    if (n.difficulty < 1 || n.difficulty > 5) problems.push(`${n.id}: difficulty must be 1–5`);
    if (n.tagline.length > 90) warnings.push(`${n.id}: tagline is long (${n.tagline.length} chars)`);

    // Every page states a review date to the reader, which is a promise that
    // someone looks. A technology's world moves faster than a concept's.
    const reviewed = n.meta?.lastReviewed;
    if (reviewed) {
      const months = (Date.now() - Date.parse(reviewed)) / (1000 * 60 * 60 * 24 * 30.4);
      const budget = n.type === "technology" ? 12 : 18;
      if (months > budget) warnings.push(`${n.id}: last reviewed ${reviewed}, ${Math.round(months)} months ago — the page tells the reader that date`);
    } else if (n.type === "technology") {
      warnings.push(`${n.id}: no lastReviewed date`);
    }

    // A setup guide is only worth following if it can be checked against the
    // projects' own documentation, works when you run it, and admits where the
    // combination is the wrong one.
    if (n.type === "setup") {
      for (const s of SETUP_SECTIONS) if (!n.sections[s]) problems.push(`${n.id}: missing required section '## ${s}'`);
      if (!/^```steps\s*$/m.test(n.sections["Set it up"] ?? "")) problems.push(`${n.id}: '## Set it up' needs a \`steps\` fence`);
      if (!/^```(yaml|ini|conf|nginx|toml|json|sh|bash|dockerfile|sql|ts|js|py|properties|xml)\s*$/m.test(n.sections["Set it up"] ?? "")) {
        problems.push(`${n.id}: '## Set it up' has no configuration or command block to copy`);
      }
      const primary = [...(n.sections["References"] ?? "").matchAll(/\]\((https:\/\/[^)\s]+)\)/g)];
      if (primary.length < n.components.length) {
        problems.push(`${n.id}: ${primary.length} reference link(s) for ${n.components.length} components — cite each project's own documentation`);
      }
      for (const c of n.components) {
        if (!/\d/.test(c.version)) problems.push(`${n.id}: component '${c.ref}' has version '${c.version}' — name the version it was written against`);
      }
    }

    if (n.type === "technology" || n.type === "concept" || n.type === "pattern" || n.type === "comparison") {
      for (const s of REQUIRED_SECTIONS[n.type]) {
        if (!n.sections[s]) problems.push(`${n.id}: missing required section '## ${s}'`);
      }
      // A comparison exists to refuse an unconditional recommendation. The
      // mechanism is a decision tree and a section per subject; without those
      // it is an opinion piece with a table.
      if (n.type === "comparison") {
        if (!/^```compare\s*$/m.test(n.sections["Comparison"] ?? "")) {
          problems.push(`${n.id}: '## Comparison' needs a \`compare\` fence`);
        }
        if (!/^```decision\s*$/m.test(n.sections["Decision"] ?? "")) {
          problems.push(`${n.id}: '## Decision' needs a \`decision\` fence — that is what stops it recommending a winner`);
        }
        const whens = n.sectionOrder.filter((h) => h.startsWith("When "));
        if (whens.length < n.subjects.length) {
          problems.push(`${n.id}: ${whens.length} 'When …' section(s) for ${n.subjects.length} subjects — each side needs its case made`);
        }
        // A title is a promise: "Kubernetes vs Serverless" tells the reader
        // this page is about Serverless, so /concept/serverless must link back
        // to it. That edge comes from `subjects` or from `related`, and when
        // neither names the node the title does, the comparison is invisible
        // from the page it is named after — which is how this page listed
        // Docker where it meant Serverless, unnoticed, for months.
        const linked = new Set([...n.subjects, ...n.related.map((r) => r.to)]);
        for (const side of n.name.split(/\s+vs\.?\s+/i)) {
          const key = side.trim().toLowerCase();
          const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const hit = [...g.nodes.values()].find(
            (c) => c.id !== n.id && (c.id === slug || c.name.toLowerCase() === key),
          );
          if (hit && !linked.has(hit.id)) {
            problems.push(
              `${n.id}: the title names '${hit.name}' but nothing links to ${hit.id} — add it to subjects or related, or the comparison never appears on its own page`,
            );
          }
        }
      }
      const degree = g.adjacency.get(n.id)?.length ?? 0;
      if (degree < 3) warnings.push(`${n.id}: only ${degree} edges — the graph will feel thin here`);
      for (const [heading, md] of Object.entries(n.sections)) {
        const fences = [...md.matchAll(/^```(\w+)/gm)].map((m) => m[1]);
        for (const f of fences) if (!KNOWN_FENCES.has(f)) warnings.push(`${n.id} › ${heading}: unknown fence '${f}'`);
        // A visual fence is parsed by its own grammar — `Label [node-id]` — and its
        // cells print as plain text, so a Markdown link inside one shows the reader
        // literal brackets. Same trap as a link written into a .json file.
        for (const block of md.matchAll(/^```(steps|sequence|compare|decision|timeline)\n([\s\S]*?)^```/gm)) {
          const bad = /\[[^\]\n]{1,60}\]\(\/[^)\n]{1,120}\)/.exec(block[2]);
          if (bad) problems.push(`${n.id} › ${heading}: Markdown link '${bad[0]}' inside a ${block[1]} fence — use \`Label [node-id]\``);

          // A fence that cannot be parsed renders as less than it says, without
          // an error anywhere: a dropped participant, a row short of a cell.
          // Nothing else on the site fails this quietly.
          const [kind, body] = [block[1], block[2]];
          if (kind === "sequence") {
            const d = parseSequence(body);
            if (d.participants.length === 0) problems.push(`${n.id} › ${heading}: sequence fence declares no participants`);
            if (d.messages.length === 0) problems.push(`${n.id} › ${heading}: sequence fence has no messages`);
            for (const msg of d.messages)
              for (const side of [msg.from, msg.to])
                if (side < 0 || side >= d.participants.length)
                  problems.push(`${n.id} › ${heading}: a sequence message points past the declared participants`);
          } else if (kind === "compare") {
            const d = parseCompare(body);
            const ragged = d.rows.filter((r) => r.length !== d.header.length);
            if (ragged.length) problems.push(`${n.id} › ${heading}: compare fence has ${d.header.length} columns but ${ragged.length} row(s) with a different cell count — "${ragged[0][0]}" has ${ragged[0].length}`);
          } else if (kind === "timeline") {
            const d = parseTimeline(body);
            const wrong = d.rows.filter((r) => r.length !== d.columns.length);
            if (wrong.length) problems.push(`${n.id} › ${heading}: timeline fence has ${d.columns.length} columns but ${wrong.length} row(s) with a different cell count`);
          } else if (kind === "steps" && parseSteps(body).steps.length === 0) {
            problems.push(`${n.id} › ${heading}: steps fence parsed to nothing`);
          } else if (kind === "decision" && !parseDecision(body).root) {
            problems.push(`${n.id} › ${heading}: decision fence parsed to nothing`);
          }

          // A `[node-id]` the renderer cannot resolve is a label that looks like
          // a link and is not one. `check:links` never sees these — they are not
          // Markdown links, and they only become hrefs at render time.
          for (const ref of fenceRefs(kind, body))
            if (!g.nodes.has(ref)) problems.push(`${n.id} › ${heading}: ${kind} fence refs '[${ref}]', which is not a node`);
        }
        // A link labelled with one page's name and pointing at another is the
        // one broken link nothing else can see: the target resolves, and it is
        // the right kind of page, so both existing checks pass. "Redis vs
        // Memcached" pointed at Redis for months.
        for (const m of md.matchAll(/\[([^\]\n]{2,60})\]\(\/(?:technology|concept|pattern|architecture|compare|roadmap|system-design)\/([a-z0-9-]+)\)/g)) {
          const named = byName.get(m[1].trim().toLowerCase());
          if (named && named !== m[2]) {
            problems.push(`${n.id} › ${heading}: link text "${m[1]}" is the name of '${named}' but it points at '${m[2]}'`);
          }
        }

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
      // The page offers an Evolution control; without versions it renders nothing,
      // and the "how did it get this way" half of the diagram is missing.
      if (!n.versions?.length) warnings.push(`${n.id}: architecture has no versions (no evolution tabs)`);
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

  // The radar is an editorial board, not a census — leaving Git or Linux off it
  // is a judgement, not an omission. But a technology page written after the
  // last assessment has never been judged at all, and nothing else would say so.
  const rated = new Set(g.radar.entries.map((e) => e.ref));
  for (const n of g.nodes.values()) {
    if (n.type !== "technology" || rated.has(n.id)) continue;
    const reviewed = (n as { meta?: { lastReviewed?: string } }).meta?.lastReviewed;
    // `>=`, not `>`: a page reviewed on the assessment date and still unrated
    // was not looked at. One reviewed earlier predates the assessment, so its
    // absence is a decision somebody already made.
    if (reviewed && String(reviewed) >= g.radar.assessedOn) {
      warnings.push(`radar: '${n.id}' was written after the last assessment (${g.radar.assessedOn}) and has no ring — give it one or decide it does not belong`);
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
