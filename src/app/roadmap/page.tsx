import type { Metadata } from "next";
import Link from "next/link";
import { getRoadmaps } from "@/lib/content/graph";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";

export const metadata: Metadata = pageMetadata({
  title: "Developer Roadmaps",
  description: "Ordered learning paths for backend and frontend developers. Every step links to its TechFlow page; tick off what you know and your progress is saved locally.",
  path: "/roadmap",
});

export default function Page() {
  const roadmaps = getRoadmaps();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Roadmaps", path: "#" }]} />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          Roadmaps
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          What to learn, in what order, and why each step comes where it does. Each node opens the matching page in the knowledge graph.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {roadmaps.map((r) => (
          <Link key={r.id} href={`/roadmap/${r.id}`} className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
            <div className="font-mono text-[10px] uppercase tracking-wider text-roadmap">Roadmap</div>
            <h2 className="mt-1 text-lg font-semibold group-hover:underline">{r.name}</h2>
            <p className="mt-1 text-sm text-fg-muted">{r.tagline}</p>
            <div className="mt-3 flex flex-wrap gap-1 text-[11px] text-fg-faint">
              {r.steps.slice(0, 8).map((s, i) => (
                <span key={i} className="after:mx-1 after:content-['→'] last:after:content-none">
                  {s.label}
                </span>
              ))}
              <span>… {r.steps.length} steps</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
