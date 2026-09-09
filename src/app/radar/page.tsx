import type { Metadata } from "next";
import { getNode, getRadar } from "@/lib/content/graph";
import { hrefFor } from "@/lib/content/types";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { RadarChart, type RadarItem } from "@/components/radar/RadarChart";

export const metadata: Metadata = pageMetadata({
  title: "Technology Radar",
  description: "TechFlow's assessment of which technologies and techniques to adopt, trial, assess or treat with caution — with the reasoning and the date, never as absolute truth.",
  path: "/radar",
});

export default function Page() {
  const radar = getRadar();
  const items: RadarItem[] = radar.entries
    .map((e) => {
      const n = getNode(e.ref);
      if (!n) return null;
      return { ref: e.ref, name: n.name, href: hrefFor(n.type, n.id), type: n.type, ring: e.ring, quadrant: e.quadrant, note: e.note, moved: e.moved };
    })
    .filter(Boolean) as RadarItem[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Technology Radar", path: "#" }]} />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
            Technology Radar
          </h1>
          <p className="mt-2 max-w-2xl text-fg-muted">
            Where we would place {items.length} technologies and techniques for a team starting a product in 2026. Click a quadrant label to
            focus, hover a dot for the reasoning, click to open the page.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-fg-muted">
          <div>
            <span className="font-mono uppercase tracking-wider text-fg-faint">TechFlow assessment</span> · {radar.assessedOn}
          </div>
          <div className="text-fg-faint">Editorial opinion, not a benchmark.</div>
        </div>
      </header>
      <RadarChart items={items} />
      <section className="mt-12 max-w-3xl rounded-lg border border-border bg-surface p-5 text-sm text-fg-muted">
        <h2 className="mb-2 text-sm font-semibold text-fg">How to read this</h2>
        <p>{radar.method}</p>
      </section>
    </div>
  );
}
