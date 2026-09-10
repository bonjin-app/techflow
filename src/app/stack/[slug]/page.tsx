import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getNode, getStacks } from "@/lib/content/graph";
import { hrefFor, TYPE_LABEL } from "@/lib/content/types";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { SectionHeading } from "@/components/ui/Badge";
import { JsonLd } from "@/components/ui/JsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return getStacks().map((s) => ({ slug: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/stack/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = getStacks().find((x) => x.id === slug);
  if (!s) return {};
  return pageMetadata({
    title: `${s.name} stack: what it is made of and why`,
    description: s.tagline,
    path: `/stack/${s.id}`,
    type: "article",
  });
}

export default async function Page({ params }: PageProps<"/stack/[slug]">) {
  const { slug } = await params;
  const stack = getStacks().find((x) => x.id === slug);
  if (!stack) notFound();
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Stacks", path: "/stack" },
    { name: stack.name, path: `/stack/${stack.id}` },
  ];

  return (
    <article className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <header className="mb-8">
        <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Real-world stack</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl" style={{ letterSpacing: "-0.03em" }}>
          {stack.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-fg-muted">{stack.tagline}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-muted">
          <span>
            Updated <time dateTime={stack.updated}>{stack.updated}</time>
          </span>
          <span className="inline-flex items-center gap-1">
            Confidence
            <span
              className={`rounded px-1 font-mono text-[10px] uppercase ${
                stack.confidence === "high" ? "bg-ok/15 text-ok" : stack.confidence === "medium" ? "bg-warn/15 text-warn" : "bg-danger/15 text-danger"
              }`}
            >
              {stack.confidence}
            </span>
          </span>
        </div>
      </header>

      <p className="mb-6 max-w-3xl text-fg-muted">{stack.summary}</p>

      <div className="mb-10 max-w-3xl rounded-lg border border-border bg-surface p-4 text-sm">
        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Source &amp; basis</div>
        <p className="mt-1 text-fg-muted">{stack.basis}</p>
      </div>

      <section className="mb-12">
        <SectionHeading eyebrow="Layer by layer" title="What is in the stack, and why" />
        <div className="space-y-3">
          {stack.layers.map((layer) => (
            <div key={layer.label} className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint sm:pt-1">{layer.label}</div>
              <ul className="space-y-2">
                {layer.items.map((it, i) => {
                  const n = it.ref ? getNode(it.ref) : undefined;
                  return (
                    <li key={i} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                      <span className="shrink-0">
                        {n ? (
                          <Link href={hrefFor(n.type, n.id)} data-type={n.type} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
                            <span className="size-1.5 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                            {n.name}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
                            <span className="size-1.5 rounded-full bg-border-strong" aria-hidden />
                            {it.label}
                          </span>
                        )}
                      </span>
                      {it.note && <span className="text-sm text-fg-muted">{it.note}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {stack.whenToUse.length > 0 && (
          <section className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ok">Fits when</div>
            <ul className="space-y-1.5 text-sm text-fg">
              {stack.whenToUse.map((w) => (
                <li key={w} className="flex gap-2">
                  <span className="text-ok" aria-hidden>
                    +
                  </span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {stack.tradeoffs.length > 0 && (
          <section className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-danger">What it costs you</div>
            <ul className="space-y-1.5 text-sm text-fg">
              {stack.tradeoffs.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-danger" aria-hidden>
                    −
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {stack.related.length > 0 && (
        <section className="mt-12">
          <SectionHeading eyebrow="Go deeper" title="Related" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stack.related.map((id) => {
              const n = getNode(id);
              if (!n) return null;
              return (
                <Link key={id} href={hrefFor(n.type, n.id)} data-type={n.type} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
                  <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "var(--type)" }}>
                    {TYPE_LABEL[n.type]}
                  </div>
                  <div className="mt-1 font-semibold">{n.name}</div>
                  <div className="mt-1 text-sm text-fg-muted">{n.tagline}</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-12 flex flex-wrap gap-2 text-sm">
        <span className="text-fg-faint">Other stacks:</span>
        {getStacks()
          .filter((x) => x.id !== stack.id)
          .map((x) => (
            <Link key={x.id} href={`/stack/${x.id}`} className="rounded border border-border px-2 py-0.5 text-fg-muted hover:text-fg">
              {x.name}
            </Link>
          ))}
      </div>
    </article>
  );
}
