import type { Metadata } from "next";
import Link from "next/link";
import { getComparisons, getNode } from "@/lib/content/graph";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";

export const metadata: Metadata = pageMetadata({
  title: "Technology Comparisons & Decision Trees",
  description: "Redis vs Memcached, WebSocket vs SSE, Kafka vs RabbitMQ, PostgreSQL vs MongoDB — feature matrices plus interactive decision trees. No unconditional winners.",
  path: "/compare",
});

export default function Page() {
  const comps = getComparisons();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Compare", path: "#" }]} />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          Compare & decide
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Side-by-side matrices and decision trees you can click through. Every comparison ends with when to pick each option — never
          &ldquo;X is better&rdquo;.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {comps.map((c) => {
          const subjects = c.subjects.map((s) => getNode(s)).filter(Boolean);
          return (
            <Link key={c.id} href={`/compare/${c.id}`} className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
              <div className="flex items-center gap-3 text-lg font-semibold">
                {subjects.map((s, i) => (
                  <span key={s!.id} className="flex items-center gap-3">
                    {i > 0 && <span className="font-mono text-sm text-fg-faint">vs</span>}
                    <span data-type={s!.type} className="group-hover:underline">
                      {s!.name}
                    </span>
                  </span>
                ))}
              </div>
              <p className="mt-1 text-sm text-fg-muted">{c.tagline}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
