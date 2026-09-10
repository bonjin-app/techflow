import type { Metadata } from "next";
import Link from "next/link";
import { getGraph } from "@/lib/content/graph";
import { RELATION_LABEL, type Relation } from "@/lib/content/types";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { SectionHeading } from "@/components/ui/Badge";

export const metadata: Metadata = pageMetadata({
  title: "JSON API",
  description: "The whole TechFlow knowledge graph as static JSON — every node, every edge, every relation. No key, no rate limit, regenerated on each build.",
  path: "/api-docs",
});

function Code({ children }: { children: React.ReactNode }) {
  return <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 font-mono text-xs leading-relaxed">{children}</pre>;
}

export default function Page() {
  const g = getGraph();
  const nodeCount = g.nodes.size;
  // Distinct edges, matching what the API publishes.
  const seen = new Set<string>();
  for (const e of g.edges) {
    const a = `${e.from}|${e.to}|${e.rel}`;
    const b = `${e.to}|${e.from}|${e.rel}`;
    if (!seen.has(a) && !seen.has(b)) seen.add(a);
  }
  const relations = Object.entries(RELATION_LABEL) as [Relation, string][];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "JSON API", path: "#" }]} />
      <header className="mb-8">
        <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">For developers</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          The graph as JSON
        </h1>
        <p className="mt-3 max-w-2xl text-fg-muted">
          The interesting part of this site is the graph, so it is published as plain static JSON alongside the pages. No key, no rate limit, no
          scraping. It is regenerated on every build, which means it always matches what you see on the site.
        </p>
      </header>

      <section className="mb-10 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Nodes", value: nodeCount },
          { label: "Edges", value: seen.size },
          { label: "Relation types", value: relations.length },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-surface p-4">
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">{s.label}</div>
            <div className="mt-1 font-mono text-2xl tabular-nums">{s.value}</div>
          </div>
        ))}
      </section>

      <section className="mb-10">
        <SectionHeading eyebrow="Endpoints" title="Four files" />
        <div className="space-y-4 text-sm">
          {[
            { path: "/api/index.json", what: "What is here, how many of each, and when it was generated." },
            { path: "/api/graph.json", what: "Every node and every distinct edge, plus the relation vocabulary. This is the one to start with." },
            { path: "/api/nodes/{id}.json", what: "One node with its neighbourhood, prerequisites, learning path and section headings." },
            { path: "/search-index.json", what: "The compact node list the site's own search uses — ids, names, taglines, categories, degrees." },
          ].map((e) => (
            <div key={e.path} className="rounded-lg border border-border bg-surface p-4">
              <code className="font-mono text-[13px] font-semibold text-accent">{e.path}</code>
              <p className="mt-1 text-fg-muted">{e.what}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <SectionHeading eyebrow="Try it" title="Curl" />
        <Code>{`# what is available
curl -s https://techflow.dev/api/index.json | jq

# one node and everything it touches
curl -s https://techflow.dev/api/nodes/redis.json | jq '{name, neighbours: (.neighbours | length)}'

# the ten most connected nodes
curl -s https://techflow.dev/api/graph.json \\
  | jq -r '.nodes | sort_by(-.degree) | .[:10] | .[] | "\\(.degree)\\t\\(.name)"'

# everything Redis is an alternative to
curl -s https://techflow.dev/api/graph.json \\
  | jq -r '.edges[] | select(.rel == "ALTERNATIVE_TO" and (.from == "redis" or .to == "redis"))'`}</Code>
        <p className="mt-2 text-xs text-fg-faint">
          Replace the host with wherever this copy is deployed. On a sub-path deployment the files sit under that prefix.
        </p>
      </section>

      <section className="mb-10">
        <SectionHeading eyebrow="Vocabulary" title="Relations" />
        <p className="mb-3 max-w-2xl text-sm text-fg-muted">
          Every edge carries one of these. Symmetric relations are published once, in one direction — treat{" "}
          <code className="font-mono text-xs">ALTERNATIVE_TO</code>, <code className="font-mono text-xs">USED_WITH</code> and{" "}
          <code className="font-mono text-xs">RELATED_TO</code> as undirected.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2/60">
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-fg-faint">rel</th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-fg-faint">reads as</th>
              </tr>
            </thead>
            <tbody>
              {relations.map(([rel, label]) => (
                <tr key={rel} className="border-t border-border">
                  <td className="px-4 py-2">
                    <code className="font-mono text-xs">{rel}</code>
                  </td>
                  <td className="px-4 py-2 text-fg-muted">A {label} B</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <SectionHeading eyebrow="Shape" title="A node, abridged" />
        <Code>{`{
  "id": "redis",
  "type": "technology",
  "name": "Redis",
  "tagline": "In-memory data structure store used as cache, message broker and shared state",
  "category": "database",
  "tags": ["Database", "Cache", "Distributed System", "In-memory"],
  "difficulty": 3,
  "href": "/technology/redis",
  "meta": { "lastReviewed": "2026-09-09", "version": "Redis 8.x", "confidence": "high" },
  "neighbours": [
    { "id": "cache", "name": "Cache", "type": "concept", "rel": "RELATED_TO", "direction": "out", "href": "/concept/cache" }
  ],
  "usedFor": ["cache", "session", "distributed-lock"],
  "prerequisites": ["http", "backend", "database", "cache"],
  "learningPath": ["programming-fundamentals", "http", "database"],
  "sections": ["TL;DR", "Practical", "Deep Dive", "Why"]
}`}</Code>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5 text-sm text-fg-muted">
        <h2 className="mb-2 text-sm font-semibold text-fg">Fair use</h2>
        <p>
          Take it, graph it, feed it to your own tools. Each node carries a <code className="font-mono text-xs">meta.lastReviewed</code> date and a
          confidence level — the content is an editorial assessment, not a benchmark, so keep those alongside anything you republish. If you build
          something with it, the graph is also browsable as a{" "}
          <Link href="/map" className="text-accent hover:underline">
            mind map
          </Link>{" "}
          and a{" "}
          <Link href="/explore" className="text-accent hover:underline">
            force graph
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
