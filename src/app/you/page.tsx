import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { Progress } from "@/components/detail/Progress";

export const metadata: Metadata = pageMetadata({
  title: "Your progress",
  description:
    "What this browser remembers — pages you have ticked as known, your streak and what you have read — plus the pages whose prerequisites you have already covered.",
  path: "/you",
});

export default function Page() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Your progress", path: "#" }]} />
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          Your progress
        </h1>
        <p className="mt-3 max-w-2xl text-fg-muted">
          The site already remembers what you have ticked as known. This page does the one thing you cannot do by hand with 243 pages: cross that
          against the prerequisite graph and work out what is now readable — and which single page is standing in front of several others. It is all{" "}
          <Link href="/path" className="text-accent hover:underline">
            the same graph
          </Link>
          , read from your browser.
        </p>
      </header>
      <Progress />
    </div>
  );
}
