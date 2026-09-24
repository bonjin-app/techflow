import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getNeighbors, getNode, getSetups } from "@/lib/content/graph";
import { buildRefMap, collectMarkdownRefs } from "@/lib/content/refs";
import { ENVIRONMENT_LABEL, hrefFor } from "@/lib/content/types";
import { nodeMetadata, techArticleJsonLd } from "@/lib/seo";
import { Markdown } from "@/components/md/Markdown";
import { PageHeader } from "@/components/detail/PageHeader";
import { NeighborList } from "@/components/detail/NeighborList";
import { TrackVisit } from "@/components/detail/TrackVisit";
import { SectionHeading } from "@/components/ui/Badge";
import { JsonLd } from "@/components/ui/JsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return getSetups().map((n) => ({ slug: n.id }));
}

export async function generateMetadata({ params }: PageProps<"/setup/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "setup") return {};
  return nodeMetadata(node);
}

/** The order a builder needs them in, whatever order the file was written in. */
const ORDER: { key: string; eyebrow: string; title?: string }[] = [
  { key: "Why this pairing", eyebrow: "Compatibility" },
  { key: "Set it up", eyebrow: "Build it" },
  { key: "Verify", eyebrow: "Check it works" },
  { key: "Going to production", eyebrow: "What changes" },
  { key: "When not to", eyebrow: "Honest limits", title: "When not to use this combination" },
];

export default async function Page({ params }: PageProps<"/setup/[slug]">) {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "setup") notFound();
  const refs = buildRefMap(collectMarkdownRefs(Object.values(node.sections)));
  const neighbors = getNeighbors(node.id);
  const s = node.sections;
  const known = new Set(["TL;DR", "References", "Related", "_intro", ...ORDER.map((o) => o.key)]);
  const rest = node.sectionOrder.filter((h) => !known.has(h));

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <JsonLd data={techArticleJsonLd(node)} />
      <TrackVisit id={node.id} />
      <PageHeader node={node} />

      {/* What is being combined, at which version, where. */}
      <section aria-label="Components" className="mb-10">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Runs on</span>
          <span className="rounded-md border border-border bg-surface px-2 py-0.5 font-medium">{ENVIRONMENT_LABEL[node.environment]}</span>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {node.components.map((c) => {
            const target = getNode(c.ref);
            return (
              <li key={c.ref}>
                <Link
                  href={target ? hrefFor(target.type, target.id) : "#"}
                  data-type={target?.type}
                  className="block h-full rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{target?.name ?? c.ref}</span>
                    <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">{c.version}</span>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">{c.role}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="space-y-12">
        {s["TL;DR"] && (
          <section>
            <Markdown source={s["TL;DR"]} refs={refs} className="text-lg" />
          </section>
        )}
        {ORDER.filter((o) => s[o.key]).map((o) => (
          <section key={o.key}>
            <SectionHeading eyebrow={o.eyebrow} title={o.title ?? o.key} />
            <Markdown source={s[o.key]} refs={refs} className="max-w-none" />
          </section>
        ))}
        {rest.map((h) => (
          <section key={h}>
            <SectionHeading title={h} />
            <Markdown source={s[h]} refs={refs} />
          </section>
        ))}
        {s["References"] && (
          <section>
            <SectionHeading eyebrow="Primary sources" title="References" />
            <Markdown source={s["References"]} refs={refs} />
          </section>
        )}
        <section>
          <SectionHeading eyebrow="Keep exploring" title="Related" />
          <NeighborList neighbors={neighbors} exclude={node.components.map((c) => c.ref)} />
        </section>
      </div>
    </article>
  );
}
