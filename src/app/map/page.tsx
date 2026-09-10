import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getGraph, summarize } from "@/lib/content/graph";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { MindMapPage } from "@/components/graph/MindMapPage";

export const metadata: Metadata = pageMetadata({
  title: "Mind Map",
  description: "Walk the knowledge graph as a mind map: one centre, a branch per kind of relationship, and every leaf re-centres the map without a page load.",
  path: "/map",
});

export default function Page() {
  const g = getGraph();
  // Suggest genuine hubs as starting points rather than an arbitrary node.
  const starts = [...g.nodes.values()]
    .filter((n) => ["technology", "concept", "pattern"].includes(n.type))
    .map((n) => summarize(n, g))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 10)
    .map(({ id, name, type }) => ({ id, name, type }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Mind map", path: "#" }]} />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
            Mind map
          </h1>
          <p className="mt-2 max-w-2xl text-fg-muted">
            One thing in the middle, a branch for each kind of relationship, and the things on it. Click any leaf to re-centre — the map keeps a trail
            so you can walk back. Nothing reloads.
          </p>
        </div>
        <Link href="/explore" className="text-sm text-accent hover:underline">
          Prefer the force graph? →
        </Link>
      </header>
      <Suspense fallback={<div className="grid-bg h-[520px] rounded-xl border border-border" />}>
        <MindMapPage starts={starts} />
      </Suspense>
    </div>
  );
}
