import Link from "next/link";
import type { AnyNode, NodeType } from "@/lib/content/types";
import { TYPE_LABEL } from "@/lib/content/types";
import { getGraph, summarize } from "@/lib/content/graph";
import { NodeGrid } from "@/components/ui/NodeCard";
import { Breadcrumbs } from "./PageHeader";
import { JsonLd } from "@/components/ui/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo";

/** Shared index page: title, blurb, nodes grouped by category. */
export function IndexPage({
  type,
  title,
  intro,
  nodes,
  groupBy = "category",
  aside,
}: {
  type: NodeType;
  title: string;
  intro: string;
  nodes: AnyNode[];
  groupBy?: "category" | "none";
  aside?: React.ReactNode;
}) {
  const g = getGraph();
  const summaries = nodes.map((n) => summarize(n, g)).sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name));
  const groups = new Map<string, typeof summaries>();
  for (const s of summaries) {
    const k = groupBy === "category" ? s.category : "all";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const crumbs = [
    { name: "Home", path: "/" },
    { name: TYPE_LABEL[type], path: `#` },
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd data={breadcrumbJsonLd(crumbs.slice(0, 1))} />
      <Breadcrumbs items={crumbs} />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-fg-muted">{intro}</p>
        </div>
        <div className="text-sm text-fg-faint">
          {summaries.length} {summaries.length === 1 ? "entry" : "entries"} ·{" "}
          <Link href="/explore" className="text-accent hover:underline">
            see the whole graph
          </Link>
        </div>
      </header>
      {aside}
      <div className="space-y-10">
        {ordered.map(([cat, items]) => (
          <section key={cat}>
            {groupBy === "category" && (
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-fg-faint">
                {cat} <span className="ml-1 text-fg-faint/70">{items.length}</span>
              </h2>
            )}
            <NodeGrid nodes={items} />
          </section>
        ))}
      </div>
    </div>
  );
}
