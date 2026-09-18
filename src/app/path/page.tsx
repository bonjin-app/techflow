import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { PathQuery } from "@/components/graph/PathQuery";

export const metadata: Metadata = pageMetadata({
  title: "Find a Path",
  description:
    "Ask the knowledge graph two questions a list of pages cannot answer: how are these two technologies connected, and what do I need to understand before this one.",
  path: "/path",
});

export default function Page() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Find a path", path: "#" }]} />
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          Find a path
        </h1>
        <p className="mt-3 max-w-2xl text-fg-muted">
          Three questions a list of pages cannot answer. <strong className="font-semibold text-fg">How are these connected?</strong> walks the graph
          between any two pages and shows every relationship on the way.{" "}
          <strong className="font-semibold text-fg">What do they share?</strong> finds the pages that touch both, most specific first.{" "}
          <strong className="font-semibold text-fg">What do I need first?</strong> follows the prerequisites backwards and orders them so nothing comes
          before what it depends on. All three run in your browser against the same{" "}
          <Link href="/api-docs" className="text-accent hover:underline">
            graph JSON
          </Link>{" "}
          the site is built from.
        </p>
      </header>

      <Suspense fallback={<div className="rounded-xl border border-border bg-surface p-8 text-sm text-fg-faint">loading the graph…</div>}>
        <PathQuery />
      </Suspense>

      <section className="mt-10 rounded-lg border border-border bg-surface p-5 text-sm text-fg-muted">
        <h2 className="mb-2 text-sm font-semibold text-fg">How the route is chosen</h2>
        <p>
          The shortest route is rarely the most useful one. Almost everything on this site connects through a few hub pages — Backend, HTTP, Database —
          so an unweighted search answers nearly every question with “they are both connected to Backend”, which explains nothing. Entering a page
          therefore costs more the more edges it has, and a hop costs less when the relationship is specific: <em>requires</em> and <em>implements</em>{" "}
          say something, <em>related to</em> is the catch-all. The result is often a hop longer and always more explanatory. Turn the checkbox off to
          see the difference.
        </p>
      </section>
    </div>
  );
}
