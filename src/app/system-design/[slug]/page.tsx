import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPractice, hasPractice } from "@/lib/practice";
import { getEgoGraph, getNeighbors, getNode, getSystemDesigns } from "@/lib/content/graph";
import { buildRefMap, collectArchRefs } from "@/lib/content/refs";
import { breadcrumbJsonLd, breadcrumbsFor, nodeMetadata, techArticleJsonLd } from "@/lib/seo";
import { StepJourney } from "@/components/canvas/StepJourney";
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
  return getSystemDesigns().map((n) => ({ slug: n.id }));
}

export async function generateMetadata({ params }: PageProps<"/system-design/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "system-design") return {};
  return nodeMetadata(node);
}

export default async function Page({ params }: PageProps<"/system-design/[slug]">) {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "system-design") notFound();
  const ids = collectArchRefs(
    node.steps.flatMap((s) => s.nodes),
    node.steps.flatMap((s) => s.alternatives ?? []),
  );
  const refs = buildRefMap(ids);
  const neighbors = getNeighbors(node.id);
  const ego = getEgoGraph(node.id, { depth: 1, maxNodes: 30 });
  const practice = getPractice(node.id);

  return (
    <article className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd data={[techArticleJsonLd(node), breadcrumbJsonLd(breadcrumbsFor(node))]} />
      <TrackVisit id={node.id} />
      <PageHeader node={node} />
      <p className="mb-6 max-w-3xl text-fg-muted">{node.summary}</p>

      {node.requirements.length > 0 && (
        <section className="mb-8">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">Requirements</div>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {node.requirements.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-fg-faint" aria-hidden>▪</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-12">
        <SectionHeading eyebrow="Scale journey" title="Grow the system one bottleneck at a time" />
        <StepJourney steps={node.steps} refs={refs} />
      </section>

      <div className="grid gap-12 lg:grid-cols-2">
        <section>
          <SectionHeading eyebrow="Knowledge graph" title="Everything this design touches" />
          <GraphLoader data={ego} height={400} mode="ego" />
          <MindMapLink id={node.id} name={node.name} className="mt-3" />
        </section>
        <section className="space-y-8">
          <div>
            <SectionHeading eyebrow="Keep exploring" title="Related" />
            <NeighborList neighbors={neighbors} />
          </div>
          {hasPractice(practice) && (
            <div>
              <SectionHeading eyebrow="Not just reading" title={`Try ${node.name}`} />
              <PracticeSection practice={practice} />
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
