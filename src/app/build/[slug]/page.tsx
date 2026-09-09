import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBuilds, getNode, resolveRefs } from "@/lib/content/graph";
import { hrefFor, TYPE_LABEL, type AnyNode } from "@/lib/content/types";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { ArchitectureView } from "@/components/canvas/ArchitectureView";
import { LearningPath } from "@/components/detail/LearningPath";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { Chip, SectionHeading } from "@/components/ui/Badge";
import { JsonLd } from "@/components/ui/JsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return getBuilds().map((b) => ({ slug: b.id }));
}

export async function generateMetadata({ params }: PageProps<"/build/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const b = getBuilds().find((x) => x.id === slug);
  if (!b) return {};
  return pageMetadata({
    title: `I want to build: ${b.name}`,
    description: `${b.tagline}. Recommended architecture, technologies, required concepts and a learning path.`,
    path: `/build/${b.id}`,
  });
}

function Group({ title, ids }: { title: string; ids: string[] }) {
  const nodes = ids.map((id) => getNode(id)).filter(Boolean) as AnyNode[];
  if (nodes.length === 0) return null;
  return (
    <div>
      <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">{title}</div>
      <ul className="space-y-1.5">
        {nodes.map((n) => (
          <li key={n.id}>
            <Link href={hrefFor(n.type, n.id)} data-type={n.type} className="group flex items-baseline gap-2 text-sm">
              <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: "var(--type)" }} aria-hidden />
              <span className="font-medium group-hover:underline">{n.name}</span>
              <span className="truncate text-xs text-fg-faint">{n.tagline}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function Page({ params }: PageProps<"/build/[slug]">) {
  const { slug } = await params;
  const b = getBuilds().find((x) => x.id === slug);
  if (!b) notFound();
  const arch = getNode(b.architecture);
  const sd = b.systemDesign ? getNode(b.systemDesign) : undefined;
  const path = resolveRefs(b.learningPath);
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "I want to build", path: "/#build" },
    { name: b.name, path: `/build/${b.id}` },
  ];

  return (
    <article className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <header className="mb-8">
        <div className="font-mono text-xs uppercase tracking-wider text-fg-faint">You want to build</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl" style={{ letterSpacing: "-0.03em" }}>
          {b.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-fg-muted">{b.tagline}</p>
        <ol className="mt-5 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          {["Architecture", "Technologies", "Concepts", "Learning path", sd ? "System design" : null].filter(Boolean).map((s, i, arr) => (
            <li key={s} className="flex items-center gap-2">
              <a href={`#${s!.toLowerCase().replace(/\s+/g, "-")}`} className="rounded border border-border bg-surface px-2 py-1 hover:text-fg">
                {s}
              </a>
              {i < arr.length - 1 && <span aria-hidden>↓</span>}
            </li>
          ))}
        </ol>
      </header>

      {arch && arch.type === "architecture" && (
        <section id="architecture" className="mb-12 scroll-mt-20">
          <SectionHeading eyebrow="Recommended architecture" title={arch.name}>
            <Link href={hrefFor(arch.type, arch.id)} className="text-sm text-accent hover:underline">
              Full walkthrough →
            </Link>
          </SectionHeading>
          <p className="mb-4 max-w-3xl text-sm text-fg-muted">{arch.summary}</p>
          <ArchitectureView arch={arch} />
        </section>
      )}

      <div className="grid gap-10 md:grid-cols-3">
        <section id="technologies" className="scroll-mt-20">
          <Group title="Recommended technologies" ids={b.technologies} />
        </section>
        <section id="concepts" className="scroll-mt-20">
          <Group title="Required concepts" ids={b.concepts} />
        </section>
        <section className="scroll-mt-20">
          <Group title="Patterns you will use" ids={b.patterns} />
        </section>
      </div>

      {path.length > 0 && (
        <section id="learning-path" className="mt-12 scroll-mt-20">
          <SectionHeading eyebrow="In order" title="Learning path" />
          <LearningPath items={path} title={`Learning path for ${b.name}`} />
        </section>
      )}

      {sd && (
        <section id="system-design" className="mt-12 scroll-mt-20">
          <SectionHeading eyebrow="Go deeper" title="System design walkthrough" />
          <Link href={hrefFor(sd.type, sd.id)} className="block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong">
            <div className="font-mono text-[10px] uppercase tracking-wider text-system-design">{TYPE_LABEL[sd.type]}</div>
            <div className="mt-1 text-lg font-semibold">Design a {sd.name}</div>
            <div className="mt-1 text-sm text-fg-muted">{sd.tagline}</div>
          </Link>
        </section>
      )}

      <div className="mt-12 flex flex-wrap gap-2">
        <span className="text-sm text-fg-faint">Other goals:</span>
        {getBuilds()
          .filter((x) => x.id !== b.id)
          .map((x) => (
            <Chip key={x.id} href={`/build/${x.id}`}>
              {x.name}
            </Chip>
          ))}
      </div>
    </article>
  );
}
