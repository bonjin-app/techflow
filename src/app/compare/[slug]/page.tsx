import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getComparisons, getNeighbors, getNode } from "@/lib/content/graph";
import { buildRefMap } from "@/lib/content/refs";
import { hrefFor } from "@/lib/content/types";
import { breadcrumbJsonLd, breadcrumbsFor, nodeMetadata, techArticleJsonLd } from "@/lib/seo";
import { Markdown } from "@/components/md/Markdown";
import { PageHeader } from "@/components/detail/PageHeader";
import { NeighborList } from "@/components/detail/NeighborList";
import { TrackVisit } from "@/components/detail/TrackVisit";
import { Difficulty, SectionHeading } from "@/components/ui/Badge";
import { JsonLd } from "@/components/ui/JsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return getComparisons().map((n) => ({ slug: n.id }));
}

export async function generateMetadata({ params }: PageProps<"/compare/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "comparison") return {};
  return nodeMetadata(node);
}

const ORDER = ["TL;DR", "Comparison", "Decision"];

export default async function Page({ params }: PageProps<"/compare/[slug]">) {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "comparison") notFound();
  const refs = buildRefMap();
  const subjects = node.subjects.map((s) => getNode(s)).filter(Boolean);
  const neighbors = getNeighbors(node.id);
  const s = node.sections;
  const rest = node.sectionOrder.filter((h) => !ORDER.includes(h) && h !== "_intro" && h !== "Related");

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <JsonLd data={[techArticleJsonLd(node), breadcrumbJsonLd(breadcrumbsFor(node))]} />
      <TrackVisit id={node.id} />
      <PageHeader node={node} />

      {/* Subjects */}
      <div className="mb-10 grid gap-3 sm:grid-cols-2">
        {subjects.map((sub) => (
          <Link key={sub!.id} href={hrefFor(sub!.type, sub!.id)} data-type={sub!.type} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{sub!.name}</span>
              <Difficulty level={sub!.difficulty} showLabel={false} />
            </div>
            <p className="mt-1 text-sm text-fg-muted">{sub!.tagline}</p>
          </Link>
        ))}
      </div>

      <div className="space-y-12">
        {s["TL;DR"] && (
          <section>
            <Markdown source={s["TL;DR"]} refs={refs} className="text-lg" />
          </section>
        )}
        {s["Comparison"] && (
          <section>
            <SectionHeading eyebrow="Side by side" title="Comparison" />
            <Markdown source={s["Comparison"]} refs={refs} className="max-w-none" />
          </section>
        )}
        {s["Decision"] && (
          <section>
            <SectionHeading eyebrow="Interactive" title="Which one should you use?" />
            <Markdown source={s["Decision"]} refs={refs} className="max-w-none" />
          </section>
        )}
        {rest.map((h) => (
          <section key={h}>
            <SectionHeading title={h} />
            <Markdown source={s[h]} refs={refs} />
          </section>
        ))}
        <section>
          <SectionHeading eyebrow="Keep exploring" title="Related" />
          {s["Related"] && <Markdown source={s["Related"]} refs={refs} className="mb-6" />}
          <NeighborList neighbors={neighbors} exclude={node.subjects} />
        </section>
      </div>
    </article>
  );
}
