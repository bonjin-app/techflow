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
      <h1 className="mb-4 text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
        Search
      </h1>
      <Suspense fallback={<div className="h-14 rounded-xl border border-border bg-surface" />}>
        <SearchResults />
      </Suspense>
    </div>
  );
}
