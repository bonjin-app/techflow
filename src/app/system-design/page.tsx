import type { Metadata } from "next";
import Link from "next/link";
import { getSystemDesigns } from "@/lib/content/graph";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { Difficulty } from "@/components/ui/Badge";

export const metadata: Metadata = pageMetadata({
  title: "System Design, step by step",
  description: "Design real systems the way they actually grow: start simple, hit a bottleneck, add exactly one thing, explain why. Each step is an interactive diagram with alternatives.",
  path: "/system-design",
});

export default function Page() {
  const designs = getSystemDesigns();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "System Design", path: "#" }]} />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          System Design
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Systems are not designed all at once. Each walkthrough starts with the simplest thing that works and adds one component per
          bottleneck — with the reasoning and the alternatives at every step.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {designs.map((d) => (
          <Link key={d.id} href={`/system-design/${d.id}`} className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-system-design">System design</div>
                <h2 className="mt-1 text-lg font-semibold group-hover:underline">Design a {d.name}</h2>
                <p className="mt-1 text-sm text-fg-muted">{d.tagline}</p>
              </div>
              <Difficulty level={d.difficulty} showLabel={false} />
            </div>
            <ol className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
              {d.steps.map((s, i) => (
                <li key={i} className="rounded border border-border px-1.5 py-0.5 text-fg-muted">
                  {s.scale ?? `Step ${i + 1}`}
                </li>
              ))}
            </ol>
          </Link>
        ))}
      </div>
    </div>
  );
}
