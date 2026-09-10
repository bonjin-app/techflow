import type { Metadata } from "next";
import Link from "next/link";
import { getGraph, getUniverse } from "@/lib/content/graph";
import { hrefFor } from "@/lib/content/types";
import { pageMetadata } from "@/lib/seo";
import { GraphLoader } from "@/components/graph/GraphLoader";
import { Breadcrumbs } from "@/components/detail/PageHeader";

export const metadata: Metadata = pageMetadata({
  title: "Explore the Knowledge Graph",
  description: "The whole TechFlow graph in one view: technologies, concepts, patterns and architectures and every link between them. Drag, zoom, hover, click.",
  path: "/explore",
});

export default function Page() {
  const universe = getUniverse(["technology", "concept", "pattern", "architecture", "comparison", "system-design"]);
  const g = getGraph();
  const hubs = [...g.nodes.values()]
    .map((n) => ({ n, d: g.adjacency.get(n.id)?.length ?? 0 }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Explore", path: "#" }]} />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
            The whole graph
          </h1>
          <p className="mt-2 max-w-2xl text-fg-muted">
            {universe.nodes.length} nodes, {universe.edges.length} connections. Hover a node to see its neighbourhood, click to open it. Use the legend to
            filter by type.
          </p>
        </div>
        <div className="text-xs text-fg-faint">
          <Link href="/map" className="mb-2 block text-sm text-accent hover:underline">
            Walk it as a mind map →
          </Link>
          Hubs:{" "}
          {hubs.map((h, i) => (
            <span key={h.n.id}>
              {i > 0 && " · "}
              <Link href={hrefFor(h.n.type, h.n.id)} className="text-fg-muted hover:text-fg">
                {h.n.name}
              </Link>
            </span>
          ))}
        </div>
      </header>
      <GraphLoader data={universe} height={680} mode="universe" eager />
    </div>
  );
}
