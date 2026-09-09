import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { PLAYGROUNDS } from "./registry";

export const metadata: Metadata = pageMetadata({
  title: "Developer Playground",
  description: "Run the concepts in your browser: a cache simulator with eviction policies and hit ratio, a load balancer simulator, and a JWT decoder.",
  path: "/playground",
});

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Playground", path: "#" }]} />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          Developer Playground
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Reading about a cache is one thing; watching the hit ratio fall apart under a sequential scan is another. Everything here runs in your
          browser — no server, nothing sent anywhere.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {PLAYGROUNDS.map((p) => (
          <Link key={p.slug} href={`/playground/${p.slug}`} className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
            <div className="text-2xl" aria-hidden>
              {p.icon}
            </div>
            <h2 className="mt-3 text-lg font-semibold group-hover:underline">{p.title}</h2>
            <p className="mt-1 text-sm text-fg-muted">{p.blurb}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-fg-faint">
              {p.concepts.map((c) => (
                <span key={c.href} className="rounded border border-border px-1.5 py-0.5">
                  {c.label}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
