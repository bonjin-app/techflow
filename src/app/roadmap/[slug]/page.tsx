import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNode, getRoadmaps, resolveRefs } from "@/lib/content/graph";
import { breadcrumbJsonLd, breadcrumbsFor, nodeMetadata, techArticleJsonLd } from "@/lib/seo";
import { PageHeader } from "@/components/detail/PageHeader";
import { LearningPath } from "@/components/detail/LearningPath";
import { TrackVisit } from "@/components/detail/TrackVisit";
import { GraphLoader } from "@/components/graph/GraphLoader";
import { MindMapLink } from "@/components/graph/MindMapLink";
import { getEgoGraph } from "@/lib/content/graph";
import { SectionHeading } from "@/components/ui/Badge";
import { JsonLd } from "@/components/ui/JsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return getRoadmaps().map((n) => ({ slug: n.id }));
}

export async function generateMetadata({ params }: PageProps<"/roadmap/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "roadmap") return {};
  return nodeMetadata(node);
}

export default async function Page({ params }: PageProps<"/roadmap/[slug]">) {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "roadmap") notFound();
  const resolved = resolveRefs(node.steps.map((s) => s.ref ?? s.label));
  const items = node.steps.map((s, i) => ({
    id: s.ref,
    label: s.label,
    href: resolved[i].href,
    type: resolved[i].type,
    note: s.note,
    stage: s.stage,
  }));
  const ego = getEgoGraph(node.id, { depth: 1, maxNodes: 40 });
  const stages = [...new Set(node.steps.map((s) => s.stage).filter(Boolean))] as string[];

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <JsonLd data={[techArticleJsonLd(node), breadcrumbJsonLd(breadcrumbsFor(node))]} />
      <TrackVisit id={node.id} />
      <PageHeader node={node} />
      <p className="mb-8 max-w-3xl text-fg-muted">{node.summary}</p>

      {stages.length > 0 && (
        <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs">
          {stages.map((st, i) => (
            <li key={st} className="flex items-center gap-2">
              <span className="rounded-md border border-border bg-surface px-2 py-1 font-medium">{st}</span>
              {i < stages.length - 1 && <span className="text-fg-faint" aria-hidden>→</span>}
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section>
          <SectionHeading eyebrow="Ordered path" title={`${node.steps.length} steps`} />
          <LearningPath items={items} title="Your roadmap" />
        </section>
        <section>
          <SectionHeading eyebrow="Knowledge graph" title="Topics on this roadmap" />
          <GraphLoader data={ego} height={520} mode="ego" />
          <MindMapLink id={node.id} name={node.name} className="mt-3" />
        </section>
      </div>
    </article>
  );
}
