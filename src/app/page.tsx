import type { Metadata } from "next";
import Link from "next/link";
import { dailyPick, getArchitectures, getBuilds, getChallenges, getConcepts, getGraph, getNode, getPatterns, getTechnologies, getUniverse, summarize } from "@/lib/content/graph";
import { buildRefMap } from "@/lib/content/refs";
import { ChallengeCard } from "@/components/home/ChallengeCard";
import { hrefFor, TYPE_LABEL, type NodeType } from "@/lib/content/types";
import { site } from "@/lib/site";
import { todayKey } from "@/lib/local";
import { HomeSearch } from "@/components/home/HomeSearch";
import { SurpriseMe } from "@/components/home/SurpriseMe";
import { StreakBadge } from "@/components/home/StreakBadge";
import { GraphLoader } from "@/components/graph/GraphLoader";
import { Difficulty } from "@/components/ui/Badge";
import { JsonLd } from "@/components/ui/JsonLd";

export const metadata: Metadata = {
  title: { absolute: `${site.name} — ${site.tagline}` },
  description: site.description,
  alternates: { canonical: site.url },
};

const ENTRY_TYPES: { type: NodeType; blurb: string }[] = [
  { type: "technology", blurb: "Redis, Kafka, PostgreSQL…" },
  { type: "concept", blurb: "Cache, Transaction, CAP…" },
  { type: "pattern", blurb: "Cache Aside, Outbox…" },
  { type: "architecture", blurb: "Chat, E-commerce, RAG…" },
  { type: "comparison", blurb: "Redis vs Memcached…" },
  { type: "system-design", blurb: "URL shortener, step by step" },
  { type: "roadmap", blurb: "Backend, Frontend" },
];

/** The guided first journey from the product spec. */
const FIRST_JOURNEY = ["redis", "cache", "cache-aside", "e-commerce", "postgresql", "transaction", "distributed-system", "kafka", "event-driven-architecture", "microservices", "url-shortener"];

export default function Home() {
  const g = getGraph();
  const builds = getBuilds();
  const today = todayKey();
  const dailyConcept = dailyPick(getConcepts(), today, 1);
  const dailyArch = dailyPick(getArchitectures(), today, 2);
  const dailyChallenge = dailyPick(getChallenges(), today, 3);
  const challengeRefs = dailyChallenge ? buildRefMap([...dailyChallenge.related, ...dailyChallenge.options.map((o) => o.ref).filter(Boolean) as string[]]) : {};
  const journey = FIRST_JOURNEY.map((id) => getNode(id)).filter(Boolean);
  const randomPool = [...getTechnologies(), ...getConcepts(), ...getPatterns()].map((n) => ({ href: hrefFor(n.type, n.id) }));

  // Universe: keep the picture readable — well-connected nodes only.
  const full = getUniverse(["technology", "concept", "pattern", "architecture"]);
  const keep = new Set(
    full.nodes
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 44)
      .map((n) => n.id),
  );
  const universe = {
    nodes: full.nodes.filter((n) => keep.has(n.id)),
    edges: full.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  };

  const counts = Object.fromEntries(ENTRY_TYPES.map((t) => [t.type, [...g.nodes.values()].filter((n) => n.type === t.type).length]));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: site.name,
          url: site.url,
          description: site.description,
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${site.url}/search?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="grid-bg absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-fg-faint">{site.name}</div>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ letterSpacing: "-0.035em" }}>
            Understand technology.
            <br />
            <span className="text-fg-muted">See how it connects.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-fg-muted sm:text-lg">
            An interactive knowledge graph for developers. Not a list of tools — the reasons, trade-offs and connections between them.
          </p>
          <div className="mt-8">
            <HomeSearch suggestions={["redis", "why kafka", "websocket vs sse", "race condition", "cache aside"]} />
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {ENTRY_TYPES.map((t) => (
              <Link
                key={t.type}
                href={t.type === "comparison" ? "/compare" : t.type === "system-design" ? "/system-design" : `/${t.type}`}
                data-type={t.type}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
              >
                <span className="size-1.5 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                {TYPE_LABEL[t.type]}
                <span className="font-mono text-[10px] text-fg-faint">{counts[t.type]}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-20 px-4 py-12 sm:px-6">
        <StreakBadge />

        {/* Universe */}
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Interactive technology universe</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Everything is connected</h2>
              <p className="mt-1 max-w-xl text-sm text-fg-muted">
                The most connected part of the graph. Hover to see a node&apos;s neighbourhood, click to open it, drag to rearrange.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SurpriseMe ids={randomPool} />
              <Link href="/explore" className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted hover:text-fg">
                Full graph →
              </Link>
            </div>
          </div>
          <GraphLoader data={universe} height={520} mode="universe" eager />
        </section>

        {/* I want to build */}
        <section id="build" className="scroll-mt-20">
          <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Start from a goal</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">What do you want to build?</h2>
          <p className="mt-1 max-w-xl text-sm text-fg-muted">Pick a goal → recommended architecture → technologies → required concepts → learning path.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {builds.map((b) => {
              const arch = getNode(b.architecture);
              return (
                <Link key={b.id} href={`/build/${b.id}`} className="group flex flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
                  <span className="text-base font-semibold group-hover:underline">{b.name}</span>
                  <span className="mt-1 text-xs text-fg-muted">{b.tagline}</span>
                  <span className="mt-4 flex flex-wrap gap-1">
                    {b.technologies.slice(0, 4).map((t) => (
                      <span key={t} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-faint">
                        {getNode(t)?.name ?? t}
                      </span>
                    ))}
                  </span>
                  {arch && <span className="mt-auto pt-3 text-[11px] text-architecture">{arch.name} →</span>}
                </Link>
              );
            })}
          </div>
        </section>

        {/* First journey */}
        <section>
          <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">A guided path</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Start with Redis. End at system design.</h2>
          <p className="mt-1 max-w-xl text-sm text-fg-muted">
            One technology page leads to the concept behind it, the pattern that uses it, the architecture it lives in, and the design questions it raises.
          </p>
          <ol className="no-scrollbar mt-5 flex items-center gap-2 overflow-x-auto pb-2">
            {journey.map((n, i) => (
              <li key={n!.id} className="flex shrink-0 items-center gap-2">
                <Link
                  href={hrefFor(n!.type, n!.id)}
                  data-type={n!.type}
                  className="flex flex-col rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong"
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "var(--type)" }}>
                    {TYPE_LABEL[n!.type]}
                  </span>
                  <span className="text-sm font-semibold">{n!.name}</span>
                </Link>
                {i < journey.length - 1 && <span className="text-fg-faint" aria-hidden>→</span>}
              </li>
            ))}
          </ol>
        </section>

        {/* Daily */}
        <section className="grid gap-4 md:grid-cols-2">
          {dailyConcept && (
            <Link href={hrefFor("concept", dailyConcept.id)} className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-concept">Today&apos;s concept</span>
                <Difficulty level={dailyConcept.difficulty} showLabel={false} />
              </div>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight group-hover:underline">{dailyConcept.name}</h3>
              <p className="mt-1 text-sm text-fg-muted">{dailyConcept.tagline}</p>
              <p className="mt-4 text-xs text-fg-faint">~5 min · changes daily</p>
            </Link>
          )}
          {dailyArch && (
            <Link href={hrefFor("architecture", dailyArch.id)} className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-architecture">Architecture of the day</span>
                <Difficulty level={dailyArch.difficulty} showLabel={false} />
              </div>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight group-hover:underline">{dailyArch.name}</h3>
              <p className="mt-1 text-sm text-fg-muted">{dailyArch.tagline}</p>
              <p className="mt-4 text-xs text-fg-faint">
                {dailyArch.nodes.length} components · {dailyArch.flows.length} animated flows
              </p>
            </Link>
          )}
        </section>

        {/* Daily challenge + practice */}
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {dailyChallenge && (
            <div>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-fg-faint">Today&apos;s challenge</div>
              <ChallengeCard challenge={dailyChallenge} refs={challengeRefs} />
              <Link href="/challenge" className="mt-2 inline-block text-sm text-accent hover:underline">
                All challenges →
              </Link>
            </div>
          )}
          <div className="grid gap-4">
            <Link href="/radar" className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
              <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Technology radar</div>
              <h3 className="mt-1 text-lg font-semibold group-hover:underline">Adopt · Trial · Assess · Caution</h3>
              <p className="mt-1 text-sm text-fg-muted">Where we would place each technology for a new project in 2026 — with the reasoning, dated.</p>
            </Link>
            <Link href="/playground" className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
              <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Developer playground</div>
              <h3 className="mt-1 text-lg font-semibold group-hover:underline">Cache · Rate limiter · Transports</h3>
              <p className="mt-1 text-sm text-fg-muted">Simulate eviction policies, limiter algorithms, balancing and real-time transports in your browser.</p>
            </Link>
            <Link href="/stack" className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
              <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Real-world stacks</div>
              <h3 className="mt-1 text-lg font-semibold group-hover:underline">What actually gets combined</h3>
              <p className="mt-1 text-sm text-fg-muted">Startup MVP, B2B SaaS, real-time, analytics and AI — layer by layer, with the cost of each combination.</p>
            </Link>
          </div>
        </section>

        {/* Most connected */}
        <section>
          <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Hubs</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Most connected nodes</h2>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[...g.nodes.values()]
              .filter((n) => ["technology", "concept", "pattern"].includes(n.type))
              .map((n) => summarize(n, g))
              .sort((a, b) => b.degree - a.degree)
              .slice(0, 8)
              .map((n) => (
                <Link key={n.id} href={n.href} data-type={n.type} className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-border-strong">
                  <span className="size-2 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold group-hover:underline">{n.name}</span>
                    <span className="block text-xs text-fg-faint">{TYPE_LABEL[n.type]}</span>
                  </span>
                  <span className="font-mono text-xs text-fg-faint">{n.degree}</span>
                </Link>
              ))}
          </div>
        </section>

        {/* Keyboard */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-fg-muted">
            <span className="font-medium text-fg">Keyboard first</span>
            <span>
              <kbd>/</kbd> search
            </span>
            <span>
              <kbd>⌘</kbd>
              <kbd>K</kbd> command palette
            </span>
            <span>
              <kbd>G</kbd> then <kbd>T</kbd> technologies
            </span>
            <span>
              <kbd>G</kbd> then <kbd>A</kbd> architecture
            </span>
            <span>
              <kbd>G</kbd> then <kbd>R</kbd> roadmaps
            </span>
            <span>
              <kbd>⌘</kbd>
              <kbd>⇧</kbd>
              <kbd>D</kbd> developer mode
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
