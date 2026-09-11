import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArchitectures, getEgoGraph, getNeighbors, getNode } from "@/lib/content/graph";
import { getPractice, hasPractice } from "@/lib/practice";
import { breadcrumbJsonLd, breadcrumbsFor, nodeMetadata, techArticleJsonLd } from "@/lib/seo";
import { ArchitectureView, DecisionRecords } from "@/components/canvas/ArchitectureView";
import { GraphLoader } from "@/components/graph/GraphLoader";
import { MindMapLink } from "@/components/graph/MindMapLink";
import { PracticeSection } from "@/components/detail/PracticeSection";
import { PageHeader } from "@/components/detail/PageHeader";
import { NeighborList } from "@/components/detail/NeighborList";
import { TrackVisit } from "@/components/detail/TrackVisit";
import { SectionHeading } from "@/components/ui/Badge";
import { JsonLd } from "@/components/ui/JsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return getArchitectures().map((n) => ({ slug: n.id }));
}

export async function generateMetadata({ params }: PageProps<"/architecture/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "architecture") return {};
  return nodeMetadata(node);
}

export default async function Page({ params }: PageProps<"/architecture/[slug]">) {
  const { slug } = await params;
  const arch = getNode(slug);
  if (!arch || arch.type !== "architecture") notFound();
  const neighbors = getNeighbors(arch.id);
  const ego = getEgoGraph(arch.id, { depth: 1, maxNodes: 30 });
  const components = arch.nodes.filter((n) => n.ref);
  const practice = getPractice(arch.id);

  return (
    <article className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd data={[techArticleJsonLd(arch), breadcrumbJsonLd(breadcrumbsFor(arch))]} />
      <TrackVisit id={arch.id} />
      <PageHeader node={arch} />

      <p className="mb-6 max-w-3xl text-fg-muted">{arch.summary}</p>

      <ArchitectureView arch={arch} />

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-12">
          {arch.flows.length > 0 && (
            <section>
              <SectionHeading eyebrow="Request flows" title="What happens, step by step" />
              <div className="grid gap-4 md:grid-cols-2">
                {arch.flows.map((f) => (
                  <div key={f.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="mb-2 text-sm font-semibold">{f.name}</div>
                    <ol className="space-y-1.5 text-sm">
                      {f.path.map((p, i) => {
                        const n = arch.nodes.find((x) => x.id === p);
                        return (
                          <li key={i} className="flex gap-2">
                            <span className="w-4 shrink-0 font-mono text-[10px] text-fg-faint">{i + 1}</span>
                            <span>
                              <span className="font-medium">{n?.label}</span>
                              <span className="text-fg-muted"> — {f.steps[i]}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}

          {arch.decisions.length > 0 && (
            <section>
              <SectionHeading eyebrow="Architecture decision records" title="Why these components?" />
              <DecisionRecords decisions={arch.decisions} />
            </section>
          )}

          {arch.versions && arch.versions.length > 1 && (
            <section>
              <SectionHeading eyebrow="Scale journey" title="How this system grew" />
              <ol className="relative ml-2 border-l border-border">
                {arch.versions.map((v) => (
                  <li key={v.version} className="relative pb-5 pl-6 last:pb-0">
                    <span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-architecture" aria-hidden />
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] text-fg-faint">{v.version}</span>
                      <span className="font-semibold">{v.title}</span>
                      <span className="text-xs text-fg-faint">{v.nodes.length} components</span>
                    </div>
                    <p className="mt-1 text-sm text-fg-muted">{v.summary}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-fg-faint">Use the Evolution tabs on the diagram to see each stage.</p>
            </section>
          )}

          <section>
            <SectionHeading eyebrow="Knowledge graph" title="Connected technologies & concepts" />
            <GraphLoader data={ego} height={380} mode="ego" />
            <MindMapLink id={arch.id} name={arch.name} className="mt-3" />
          </section>

          {hasPractice(practice) && (
            <section>
              <SectionHeading eyebrow="Not just reading" title={`Try ${arch.name}`} />
              <PracticeSection practice={practice} />
            </section>
          )}

          <section>
            <SectionHeading eyebrow="Keep exploring" title="Related" />
            <NeighborList neighbors={neighbors} />
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">Components</div>
            <ul className="space-y-1.5 text-sm">
              {components.map((c) => {
                const n = getNode(c.ref!);
                return (
                  <li key={c.id} className="flex items-baseline justify-between gap-2">
                    <span className="text-fg-muted">{c.label}</span>
                    {n && (
                      <Link href={`/${n.type === "technology" ? "technology" : n.type === "pattern" ? "pattern" : "concept"}/${n.id}`} className="font-medium hover:underline" data-type={n.type}>
                        {n.name}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <details className="rounded-lg border border-border bg-surface p-4 text-sm">
            <summary className="cursor-pointer font-medium">Text description of the diagram</summary>
            <p className="mt-2 text-fg-muted">{arch.textAlternative}</p>
          </details>
        </aside>
      </div>
    </article>
  );
}
