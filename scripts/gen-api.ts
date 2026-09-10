/**
 * Generates the static JSON API under `public/api/`.
 *
 * Two audiences:
 *   1. The mind map, which needs the whole edge list once so a reader can wander
 *      from node to node without a page load.
 *   2. Developers. The graph is the interesting part of this site; a static host
 *      can serve it as JSON for free, so `curl` works and nobody has to scrape HTML.
 *
 *   pnpm gen:api
 */
import fs from "node:fs";
import path from "node:path";
import { buildGraph, getNeighbors, summarize } from "../src/lib/content/graph";
import { hrefFor, RELATION_LABEL } from "../src/lib/content/types";

const OUT = path.join(process.cwd(), "public", "api");

function writeJson(rel: string, data: unknown) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  return fs.statSync(file).size;
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  const g = buildGraph();

  // ── /api/graph.json — every node and every distinct edge
  const nodes = [...g.nodes.values()].map((n) => {
    const s = summarize(n, g);
    return {
      id: s.id,
      type: s.type,
      name: s.name,
      tagline: s.tagline,
      category: s.category,
      difficulty: s.difficulty,
      degree: s.degree,
      href: s.href,
    };
  });

  const seen = new Set<string>();
  const edges: { from: string; to: string; rel: string }[] = [];
  for (const e of g.edges) {
    const key = `${e.from}|${e.to}|${e.rel}`;
    const inverse = `${e.to}|${e.from}|${e.rel}`;
    // symmetric relations are stored both ways internally; publish one
    if (seen.has(key) || seen.has(inverse)) continue;
    seen.add(key);
    edges.push({ from: e.from, to: e.to, rel: e.rel });
  }

  const graphBytes = writeJson("graph.json", {
    generated: new Date().toISOString().slice(0, 10),
    counts: { nodes: nodes.length, edges: edges.length },
    relations: RELATION_LABEL,
    nodes,
    edges,
  });

  // ── /api/nodes/<id>.json — one node with its neighbourhood
  let nodeBytes = 0;
  for (const n of g.nodes.values()) {
    const neighbours = getNeighbors(n.id).map((x) => ({
      id: x.node.id,
      name: x.node.name,
      type: x.node.type,
      rel: x.rel,
      direction: x.direction,
      href: x.node.href,
    }));
    const base = {
      id: n.id,
      type: n.type,
      name: n.name,
      tagline: n.tagline,
      category: n.category,
      tags: n.tags,
      difficulty: n.difficulty,
      href: hrefFor(n.type, n.id),
      meta: n.meta ?? null,
      neighbours,
    };
    let extra: Record<string, unknown>;
    switch (n.type) {
      case "technology":
      case "concept":
      case "pattern":
        extra = { usedFor: n.usedFor, prerequisites: n.prerequisites, learningPath: n.learningPath, sections: n.sectionOrder };
        break;
      case "architecture":
        extra = {
          summary: n.summary,
          components: n.nodes.map((c) => ({ id: c.id, label: c.label, kind: c.kind, ref: c.ref ?? null })),
          flows: n.flows.map((f) => f.name),
        };
        break;
      case "comparison":
        extra = { subjects: n.subjects, sections: n.sectionOrder };
        break;
      case "roadmap":
        extra = { summary: n.summary, steps: n.steps };
        break;
      case "system-design":
        extra = { summary: n.summary, requirements: n.requirements, steps: n.steps.map((s) => ({ title: s.title, scale: s.scale ?? null })) };
        break;
    }
    nodeBytes += writeJson(path.join("nodes", `${n.id}.json`), { ...base, ...extra });
  }

  // ── /api/index.json — how to use it, so a curl lands somewhere useful
  writeJson("index.json", {
    name: "TechFlow knowledge graph",
    description: "Static JSON of the whole graph. No auth, no rate limit, regenerated on every build.",
    generated: new Date().toISOString().slice(0, 10),
    license: "Content is TechFlow's editorial assessment; check the review date on each node.",
    endpoints: {
      "/api/graph.json": "every node and edge, plus the relation vocabulary",
      "/api/nodes/{id}.json": "one node with its neighbourhood and structure",
      "/search-index.json": "compact node list used by the site's own search",
      "/build-goals.json": "the 'I want to build …' goals",
    },
    counts: { nodes: nodes.length, edges: edges.length },
  });

  // ── /llms.txt — a flat map of the site for tools that read one file
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://techflow.dev";
  const byType = new Map<string, typeof nodes>();
  for (const n of nodes) {
    const list = byType.get(n.type);
    if (list) list.push(n);
    else byType.set(n.type, [n]);
  }
  const llms = [
    "# TechFlow",
    "",
    "> An interactive developer knowledge graph: how technologies, concepts, patterns,",
    "> architectures and system designs connect. Every page states its trade-offs and",
    "> when not to use the thing. Content is an editorial assessment with a review date.",
    "",
    `The whole graph is available as JSON: ${site}/api/graph.json (${nodes.length} nodes, ${edges.length} edges).`,
    `Per node: ${site}/api/nodes/{id}.json — see ${site}/api-docs`,
    "",
  ];
  for (const [type, list] of [...byType.entries()].sort()) {
    llms.push(`## ${type}`, "");
    for (const n of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
      llms.push(`- [${n.name}](${site}${n.href}): ${n.tagline}`);
    }
    llms.push("");
  }
  fs.writeFileSync(path.join(process.cwd(), "public", "llms.txt"), llms.join("\n"));

  console.log(
    `✔ public/api — graph.json ${(graphBytes / 1024).toFixed(1)} KB, ` +
      `${g.nodes.size} node files ${(nodeBytes / 1024).toFixed(0)} KB total`,
  );
  console.log(`✔ public/llms.txt — ${nodes.length} pages listed`);
}

main();
