import type { Metadata } from "next";
import Link from "next/link";
import { getStacks } from "@/lib/content/graph";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";

export const metadata: Metadata = pageMetadata({
  title: "Real-world Stacks",
  description: "Which technologies actually get combined in practice — startup MVP, B2B SaaS, real-time collaboration, analytics pipeline and AI products, with the trade-offs of each combination.",
  path: "/stack",
});

export default function Page() {
  const stacks = getStacks();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Stacks", path: "#" }]} />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          Real-world stacks
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Individual technologies are easy to read about; the interesting question is which ones end up next to each other. These are archetypes —
          not any specific company&apos;s stack — with the reason each piece is present and what the combination costs you.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {stacks.map((s) => (
          <Link key={s.id} href={`/stack/${s.id}`} className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold group-hover:underline">{s.name}</h2>
                <p className="mt-1 text-sm text-fg-muted">{s.tagline}</p>
              </div>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-fg-faint">{s.layers.length} layers</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] text-fg-muted">
              {s.layers.flatMap((l) => l.items).slice(0, 9).map((it, i) => (
                <span key={i} className="rounded border border-border px-1.5 py-0.5">
                  {it.label ?? it.ref}
                </span>
              ))}
              <span className="text-fg-faint">…</span>
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-8 max-w-2xl text-xs text-fg-faint">
        Every stack page states its basis, the date it was reviewed and a confidence level. Technology choices age; treat these as a starting point
        for a conversation, not as a recommendation to copy.
      </p>
    </div>
  );
}
