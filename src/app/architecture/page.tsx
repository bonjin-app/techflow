import type { Metadata } from "next";
import Link from "next/link";
import { getArchitectures, getGraph, summarize } from "@/lib/content/graph";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { Difficulty } from "@/components/ui/Badge";

export const metadata: Metadata = pageMetadata({
  title: "Architecture Explorer",
  description: "Interactive, animated architecture diagrams — press Run to watch a request travel through the system, click any component to see why it is there.",
  path: "/architecture",
});

export default function Page() {
  const g = getGraph();
  const archs = getArchitectures().sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name));
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Architecture", path: "#" }]} />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          Architecture Explorer
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Not pictures — working diagrams. Run a request through the system, step through it, inspect every component and read the decision
          records behind it. Each component links back into the knowledge graph.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {archs.map((a) => {
          const s = summarize(a, g);
          const techs = a.nodes.filter((n) => n.ref && g.nodes.get(n.ref)?.type === "technology").map((n) => g.nodes.get(n.ref!)!.name);
          return (
            <Link key={a.id} href={s.href} className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold group-hover:underline">{a.name}</h2>
                  <p className="mt-1 text-sm text-fg-muted">{a.tagline}</p>
                </div>
                <Difficulty level={a.difficulty} showLabel={false} />
              </div>
              <MiniDiagram arch={a} />
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-fg-muted">
                {[...new Set(techs)].slice(0, 6).map((t) => (
                  <span key={t} className="rounded border border-border px-1.5 py-0.5">
                    {t}
                  </span>
                ))}
                <span className="ml-auto text-fg-faint">
                  {a.nodes.length} components · {a.flows.length} flows
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Static thumbnail of the architecture grid. */
function MiniDiagram({ arch }: { arch: ReturnType<typeof getArchitectures>[number] }) {
  const cols = Math.max(...arch.nodes.map((n) => n.x)) + 1;
  const rows = Math.max(...arch.nodes.map((n) => n.y)) + 1;
  const cw = 60;
  const ch = 34;
  const w = cols * cw;
  const h = rows * ch;
  const c = (n: { x: number; y: number }) => ({ x: n.x * cw + cw / 2, y: n.y * ch + ch / 2 });
  const byId = new Map(arch.nodes.map((n) => [n.id, n]));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-28 w-full" aria-hidden>
      {arch.edges.map((e, i) => {
        const a = c(byId.get(e.from)!);
        const b = c(byId.get(e.to)!);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray={e.style === "dashed" ? "3 3" : undefined} />;
      })}
      {arch.nodes.map((n) => {
        const p = c(n);
        return <rect key={n.id} x={p.x - 22} y={p.y - 8} width={44} height={16} rx={4} fill="var(--surface-2)" stroke="var(--border-strong)" />;
      })}
    </svg>
  );
}
