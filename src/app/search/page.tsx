import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadata } from "@/lib/seo";
import { SearchResults } from "@/components/search/SearchResults";
import { Breadcrumbs } from "@/components/detail/PageHeader";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Search the knowledge graph",
    description: "Search technologies, concepts, patterns, architectures, comparisons and roadmaps — results grouped by type.",
    path: "/search",
  }),
  robots: { index: false, follow: true },
};

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Search", path: "#" }]} />
      <h1 className="text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
        Search
      </h1>
      <p className="mb-4 mt-2 max-w-2xl text-sm text-fg-muted">
        Type a keyword, or ask the way you would ask a colleague — &ldquo;I want to build a chat app but I don&apos;t get why I need Redis and
        Kafka&rdquo;. Questions are matched against the graph in your browser, so you get a goal and the pages behind it rather than a list of
        documents.
      </p>
      <Suspense fallback={<div className="h-14 rounded-xl border border-border bg-surface" />}>
        <SearchResults />
      </Suspense>
    </div>
  );
}
