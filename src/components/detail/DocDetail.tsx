import Link from "next/link";
import type { DocNode } from "@/lib/content/types";
import { getEgoGraph, getNeighbors, resolveRefs } from "@/lib/content/graph";
import { buildRefMap, collectMarkdownRefs } from "@/lib/content/refs";
import { breadcrumbJsonLd, breadcrumbsFor, techArticleJsonLd } from "@/lib/seo";
import { Markdown } from "@/components/md/Markdown";
import { GraphLoader } from "@/components/graph/GraphLoader";
import { Chip, SectionHeading } from "@/components/ui/Badge";
import { JsonLd } from "@/components/ui/JsonLd";
import { PageHeader } from "./PageHeader";
import { NeighborList } from "./NeighborList";
import { LearningPath } from "./LearningPath";
import { TrackVisit } from "./TrackVisit";
import { LevelTabs } from "./LevelTabs";

/** Sections that get a dedicated layout; anything else renders in authored order at the end. */
const LEVEL_SECTIONS = ["TL;DR", "Practical", "Deep Dive"];
const KNOWN = new Set([
  ...LEVEL_SECTIONS,
  "Why",
  "Why it matters",
  "Visual",
  "Problem",
  "Solution",
  "How it works",
  "Solutions",
  "Advantages",
  "Trade-offs",
  "Disadvantages",
  "When to use",
  "When not to use",
  "Real-world",
  "Related",
]);

function Section({ id, title, eyebrow, children }: { id: string; title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border pt-8">
      <SectionHeading id={`${id}-h`} title={title} eyebrow={eyebrow} />
      {children}
    </section>
  );
}

export function DocDetail({ node }: { node: DocNode }) {
  const s = node.sections;
  // Only the ids this page links to — the full map would be serialised into every page.
  const refs = buildRefMap(collectMarkdownRefs(Object.values(s)));
  const neighbors = getNeighbors(node.id);
  const ego = getEgoGraph(node.id, { depth: 2, maxNodes: 26 });
  const usedFor = resolveRefs(node.usedFor);
  const prereqs = resolveRefs(node.prerequisites);
  const path = resolveRefs(node.learningPath);
  const archUsedIn = neighbors.filter((n) => n.node.type === "architecture");
  const alternatives = neighbors.filter((n) => n.rel === "ALTERNATIVE_TO");
  const comparisons = neighbors.filter((n) => n.node.type === "comparison");

  const why = s["Why"] ?? s["Why it matters"];
  const pros = s["Advantages"];
  const cons = s["Trade-offs"] ?? s["Disadvantages"];
  const extras = node.sectionOrder.filter((h) => !KNOWN.has(h) && h !== "_intro");

  const toc: { id: string; label: string }[] = [
    { id: "overview", label: "Overview" },
    ...(node.type === "technology" && node.usedFor.length ? [{ id: "used-for", label: "Used for" }] : []),
    { id: "graph", label: "Relationship graph" },
    ...(why ? [{ id: "why", label: "Why" }] : []),
    ...(node.type === "pattern" && s["Problem"] ? [{ id: "problem", label: "Problem" }] : []),
    ...(node.type === "pattern" && s["Solution"] ? [{ id: "solution", label: "Solution" }] : []),
    ...(s["Visual"] ? [{ id: "visual", label: "Visual" }] : []),
    ...(s["How it works"] || s["Solutions"] ? [{ id: "how", label: s["How it works"] ? "How it works" : "Solutions" }] : []),
    ...(pros || cons ? [{ id: "tradeoffs", label: "Trade-offs" }] : []),
    ...(s["When to use"] || s["When not to use"] ? [{ id: "when", label: "When to use" }] : []),
    ...(prereqs.length ? [{ id: "prerequisites", label: "Prerequisites" }] : []),
    ...(path.length ? [{ id: "learning-path", label: "Learning path" }] : []),
    ...(archUsedIn.length ? [{ id: "architectures", label: "Architectures" }] : []),
    ...(s["Real-world"] ? [{ id: "real-world", label: "Real-world" }] : []),
    { id: "related", label: "Related" },
  ];

  return (
    <article className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd data={[techArticleJsonLd(node), breadcrumbJsonLd(breadcrumbsFor(node))]} />
      <TrackVisit id={node.id} />
      <PageHeader node={node} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-10">
          {/* Overview — 3 depth levels */}
          <section id="overview" className="scroll-mt-20">
            <LevelTabs
              levels={LEVEL_SECTIONS.filter((l) => s[l]).map((l) => ({
                key: l,
                label: l === "TL;DR" ? "TL;DR · 30s" : l === "Practical" ? "Practical" : "Deep dive",
                content: <Markdown source={s[l]} refs={refs} />,
              }))}
            />
            {s["_intro"] && <Markdown source={s["_intro"]} refs={refs} className="mt-4" />}
          </section>

          {node.type === "technology" && usedFor.length > 0 && (
            <section id="used-for" className="scroll-mt-20">
              <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">Used for</div>
              <div className="flex flex-wrap gap-2">
                {usedFor.map((u) => (
                  <Chip key={u.label} href={u.href} type={u.type}>
                    {u.label}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          {/* Relationship graph */}
          <Section id="graph" title="Relationship graph" eyebrow="How it connects">
            <p className="mb-3 max-w-2xl text-sm text-fg-muted">
              Everything {node.name} touches — concepts it relies on, patterns that use it, alternatives, and architectures where it appears.
              Click any node to keep exploring, or{" "}
              <Link href={`/map?focus=${node.id}`} className="text-accent hover:underline">
                open it as a mind map
              </Link>
              .
            </p>
            <GraphLoader data={ego} height={420} mode="ego" />
          </Section>

          {why && (
            <Section id="why" title={node.type === "pattern" ? "Problem" : node.type === "technology" ? `Why ${node.name}?` : "Why it matters"} eyebrow={node.type === "pattern" ? "Problem → Solution" : "The problem it solves"}>
              <Markdown source={why} refs={refs} />
            </Section>
          )}
          {node.type === "pattern" && s["Problem"] && (
            <Section id="problem" title="Problem" eyebrow="What hurts">
              <Markdown source={s["Problem"]} refs={refs} />
            </Section>
          )}
          {node.type === "pattern" && s["Solution"] && (
            <Section id="solution" title="Solution" eyebrow="The idea">
              <Markdown source={s["Solution"]} refs={refs} />
            </Section>
          )}
          {s["Visual"] && (
            <Section id="visual" title="Visual" eyebrow="See it">
              <Markdown source={s["Visual"]} refs={refs} />
            </Section>
          )}
          {(s["How it works"] || s["Solutions"]) && (
            <Section id="how" title={s["How it works"] ? "How it works" : "Solutions"} eyebrow="Mechanism">
              <Markdown source={s["How it works"] ?? s["Solutions"]} refs={refs} />
            </Section>
          )}

          {(pros || cons) && (
            <Section id="tradeoffs" title="Trade-offs" eyebrow="Honest picture">
              <div className="grid gap-6 md:grid-cols-2">
                {pros && (
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ok">Advantages</div>
                    <Markdown source={pros} refs={refs} variant="plus" className="text-sm" />
                  </div>
                )}
                {cons && (
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-danger">Trade-offs</div>
                    <Markdown source={cons} refs={refs} variant="minus" className="text-sm" />
                  </div>
                )}
              </div>
            </Section>
          )}

          {(s["When to use"] || s["When not to use"]) && (
            <Section id="when" title="When to use — and when not to" eyebrow="Decision">
              <div className="grid gap-6 md:grid-cols-2">
                {s["When to use"] && (
                  <div>
                    <div className="mb-2 text-sm font-semibold text-ok">Use {node.name} when</div>
                    <Markdown source={s["When to use"]} refs={refs} className="text-sm" />
                  </div>
                )}
                {s["When not to use"] && (
                  <div>
                    <div className="mb-2 text-sm font-semibold text-danger">Don&apos;t use {node.name} when</div>
                    <Markdown source={s["When not to use"]} refs={refs} className="text-sm" />
                  </div>
                )}
              </div>
              {(alternatives.length > 0 || comparisons.length > 0) && (
                <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                  {alternatives.length > 0 && <span className="text-fg-faint">Alternatives:</span>}
                  {alternatives.map((a) => (
                    <Chip key={a.node.id} href={a.node.href} type={a.node.type}>
                      {a.node.name}
                    </Chip>
                  ))}
                  {comparisons.map((c) => (
                    <Link key={c.node.id} href={c.node.href} className="ml-2 text-accent hover:underline">
                      {c.node.name} →
                    </Link>
                  ))}
                </div>
              )}
            </Section>
          )}

          {prereqs.length > 0 && (
            <Section id="prerequisites" title="Prerequisites" eyebrow="Before you start">
              <ol className="flex flex-wrap items-center gap-2 text-sm">
                {prereqs.map((p, i) => (
                  <li key={p.label} className="flex items-center gap-2">
                    {p.href ? (
                      <Link href={p.href} data-type={p.type} className="rounded-md border border-border bg-surface px-3 py-1.5 font-medium hover:border-border-strong">
                        {p.label}
                      </Link>
                    ) : (
                      <span className="rounded-md border border-border px-3 py-1.5">{p.label}</span>
                    )}
                    {i < prereqs.length && <span className="text-fg-faint" aria-hidden>→</span>}
                  </li>
                ))}
                <li data-type={node.type} className="rounded-md border px-3 py-1.5 font-semibold" style={{ borderColor: "var(--type)" }}>
                  {node.name}
                </li>
              </ol>
            </Section>
          )}

          {path.length > 0 && (
            <Section id="learning-path" title="Learning path" eyebrow="Your progress">
              <LearningPath items={path} currentId={node.id} />
            </Section>
          )}

          {archUsedIn.length > 0 && (
            <Section id="architectures" title="Where it appears" eyebrow="Architectures">
              <div className="grid gap-3 sm:grid-cols-2">
                {archUsedIn.map((a) => (
                  <Link key={a.node.id} href={a.node.href} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-architecture">Architecture</div>
                    <div className="mt-1 font-semibold">{a.node.name}</div>
                    <div className="mt-1 text-sm text-fg-muted">{a.node.tagline}</div>
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {s["Real-world"] && (
            <Section id="real-world" title="Real-world usage" eyebrow="In production">
              <Markdown source={s["Real-world"]} refs={refs} />
            </Section>
          )}

          {extras.map((h) => (
            <Section key={h} id={h.toLowerCase().replace(/\W+/g, "-")} title={h}>
              <Markdown source={s[h]} refs={refs} />
            </Section>
          ))}

          <Section id="related" title="Related" eyebrow="Keep exploring">
            <NeighborList neighbors={neighbors} />
          </Section>
        </div>

        {/* Sticky TOC */}
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-20 text-sm">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">On this page</div>
            <ul className="space-y-1 border-l border-border">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-fg-muted hover:border-fg hover:text-fg">
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </article>
  );
}
