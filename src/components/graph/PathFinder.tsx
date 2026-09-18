"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useGraphApi } from "@/lib/useGraphApi";
import { GraphUnavailable } from "./GraphUnavailable";
import { useLocalRaw } from "@/lib/useLocal";
import { KEYS, setKnown } from "@/lib/local";
import { RELATION_LABEL, TYPE_LABEL } from "@/lib/content/types";
import { commonGround, findPath, learningRoute } from "@/lib/path";
import { NodePicker } from "./NodePicker";
import { CopyButton } from "@/components/ui/CopyButton";

type Mode = "connection" | "common" | "route";

function readKnown(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Two questions the graph can answer that a list of pages cannot: how are these
 * two things connected, and what do I have to understand first.
 */
export function PathFinder({ initialFrom, initialTo }: { initialFrom?: string; initialTo?: string }) {
  const { graph, loading, failed, retry } = useGraphApi();
  const [from, setFrom] = useState(initialFrom ?? "redis");
  const [to, setTo] = useState(initialTo ?? "distributed-system");
  const [mode, setMode] = useState<Mode>("connection");
  const [avoidHubs, setAvoidHubs] = useState(true);
  const knownRaw = useLocalRaw(KEYS.known);
  const known = useMemo(() => readKnown(knownRaw), [knownRaw]);

  const syncUrl = useCallback((a: string, b: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("from", a);
      url.searchParams.set("to", b);
      window.history.replaceState(null, "", url);
    } catch {
      /* history blocked — the page still works */
    }
  }, []);

  const nodes = useMemo(() => (graph ? [...graph.nodes.values()] : []), [graph]);
  const hops = useMemo(() => (graph && mode === "connection" ? findPath(graph, from, to, { avoidHubs }) : null), [graph, from, to, mode, avoidHubs]);
  const route = useMemo(() => (graph && mode === "route" ? learningRoute(graph, to, known) : []), [graph, to, mode, known]);
  const common = useMemo(() => (graph && mode === "common" ? commonGround(graph, from, to) : null), [graph, from, to, mode]);

  if (failed) return <GraphUnavailable retry={retry} />;
  if (loading || !graph) return <div className="rounded-xl border border-border bg-surface p-8 text-sm text-fg-faint">loading the graph…</div>;

  const fromNode = graph.nodes.get(from);
  const toNode = graph.nodes.get(to);

  /**
   * The answer as Markdown, so it can leave the site — into an onboarding doc,
   * an issue, a pull request description. Absolute links, because a checklist
   * pasted elsewhere is useless if its links are relative to this page.
   */
  const asMarkdown = () => {
    const site = typeof window === "undefined" ? "" : window.location.origin;
    const link = (id: string) => {
      const n = graph.nodes.get(id);
      return n ? `[${n.name}](${site}${n.href})` : id;
    };
    if (mode === "connection" && hops) {
      const lines = [`## ${fromNode?.name} → ${toNode?.name}`, "", `- ${link(from)}`];
      for (const hop of hops) lines.push(`- *${RELATION_LABEL[hop.rel]}* → ${link(hop.to)}`);
      return lines.join("\n");
    }
    if (mode === "common" && common) {
      const lines = [`## What ${fromNode?.name} and ${toNode?.name} share`, ""];
      if (common.direct) lines.push(`They are linked directly (${RELATION_LABEL[common.direct.rel]}).`, "");
      for (const s of common.shared.slice(0, 12)) lines.push(`- ${link(s.id)}`);
      return lines.join("\n");
    }
    if (mode === "route" && route.length > 0) {
      const lines = [`## What to read before ${toNode?.name}`, ""];
      for (const step of route) lines.push(`- [${step.known ? "x" : " "}] ${link(step.id)}`);
      return lines.join("\n");
    }
    return "";
  };
  const chain = hops ? [from, ...hops.map((h) => h.to)] : [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <NodePicker
          label={mode === "route" ? "Already reading about" : "From"}
          nodes={nodes}
          value={fromNode}
          placeholder="Redis"
          onChange={(id) => {
            setFrom(id);
            syncUrl(id, to);
          }}
        />
        <NodePicker
          label={mode === "route" ? "I want to understand" : "To"}
          nodes={nodes}
          value={toNode}
          placeholder="Distributed System"
          onChange={(id) => {
            setTo(id);
            syncUrl(from, id);
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div role="tablist" aria-label="What to work out" className="flex rounded-lg border border-border p-0.5">
          {(
            [
              ["connection", "How are they connected?"],
              ["common", "What do they share?"],
              ["route", "What do I need first?"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === m ? "bg-surface text-fg" : "text-fg-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "connection" && (
          <label className="flex items-center gap-2 text-fg-muted">
            <input type="checkbox" checked={avoidHubs} onChange={(e) => setAvoidHubs(e.target.checked)} className="accent-[var(--accent)]" />
            Avoid routing through hubs
          </label>
        )}
        <CopyButton className="ml-auto" text={asMarkdown} label="Copy as Markdown" title="Copy this answer as a Markdown list, with absolute links" />
      </div>

      {mode === "connection" && <ConnectionView graph={graph} chain={chain} hops={hops} from={fromNode?.name} to={toNode?.name} avoidHubs={avoidHubs} />}
      {mode === "common" && <CommonView graph={graph} common={common} a={fromNode?.name ?? from} b={toNode?.name ?? to} />}
      {mode === "route" && <RouteView graph={graph} route={route} target={toNode?.name ?? to} />}
    </div>
  );
}

function ConnectionView({
  graph,
  chain,
  hops,
  from,
  to,
  avoidHubs,
}: {
  graph: NonNullable<ReturnType<typeof useGraphApi>["graph"]>;
  chain: string[];
  hops: ReturnType<typeof findPath>;
  from?: string;
  to?: string;
  avoidHubs: boolean;
}) {
  if (!hops) {
    return (
      <p className="rounded-xl border border-border bg-surface p-5 text-sm text-fg-muted">
        {from === to ? "Pick two different pages." : `No route from ${from} to ${to} — which usually means one of them is new and lightly linked.`}
      </p>
    );
  }
  return (
    <div>
      <p className="mb-3 text-sm text-fg-muted">
        {hops.length} {hops.length === 1 ? "hop" : "hops"}. Every step is a real relationship between two pages, not a search result.
        {avoidHubs
          ? " Hub pages are avoided where a more specific route exists, because “they are both connected to Backend” explains nothing."
          : " Hub avoidance is off, so this is the shortest route regardless of how general the pages in the middle are."}
      </p>
      <ol aria-label="Route between the two pages" className="space-y-2">
        {chain.map((id, i) => {
          const node = graph.nodes.get(id);
          if (!node) return null;
          const hop = i > 0 ? hops[i - 1] : undefined;
          return (
            <li key={id}>
              {hop && (
                <div className="ml-4 flex items-center gap-2 py-1 text-xs text-fg-faint">
                  <span aria-hidden>↓</span>
                  <span className="font-mono uppercase tracking-wider">{RELATION_LABEL[hop.rel]}</span>
                </div>
              )}
              <Link
                href={node.href}
                data-type={node.type}
                className="group flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong"
              >
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg group-hover:underline">{node.name}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">
                    {TYPE_LABEL[node.type]} · {node.tagline}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CommonView({
  graph,
  common,
  a,
  b,
}: {
  graph: NonNullable<ReturnType<typeof useGraphApi>["graph"]>;
  common: ReturnType<typeof commonGround>;
  a: string;
  b: string;
}) {
  if (!common) {
    return <p className="rounded-xl border border-border bg-surface p-5 text-sm text-fg-muted">Pick two different pages.</p>;
  }
  if (common.shared.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface p-5 text-sm text-fg-muted">
        {a} and {b} share nothing directly. That is a real answer — try{" "}
        <span className="font-medium text-fg">How are they connected?</span> for the route between them.
      </p>
    );
  }
  return (
    <div>
      <p className="mb-3 text-sm text-fg-muted">
        {common.direct ? (
          <>
            They are linked directly ({RELATION_LABEL[common.direct.rel]}), and {common.shared.length} other{" "}
            {common.shared.length === 1 ? "page touches" : "pages touch"} both.
          </>
        ) : (
          <>
            {common.shared.length} {common.shared.length === 1 ? "page touches" : "pages touch"} both. Roadmaps and the comparison of these two are
            pushed down — “both are on the backend roadmap” is true of eighty pages and answers nothing.
          </>
        )}
      </p>
      <ul aria-label={`What ${a} and ${b} share`} className="space-y-1.5">
        {common.shared.slice(0, 12).map((s) => {
          const node = graph.nodes.get(s.id);
          if (!node) return null;
          return (
            <li key={s.id}>
              <Link
                href={node.href}
                data-type={node.type}
                className="group flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                <span className="text-sm font-medium text-fg group-hover:underline">{node.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                  {a} {RELATION_LABEL[s.relToA]} · {b} {RELATION_LABEL[s.relToB]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RouteView({
  graph,
  route,
  target,
}: {
  graph: NonNullable<ReturnType<typeof useGraphApi>["graph"]>;
  route: ReturnType<typeof learningRoute>;
  target: string;
}) {
  if (route.length <= 1) {
    return (
      <p className="rounded-xl border border-border bg-surface p-5 text-sm text-fg-muted">
        {target} declares no prerequisites, so it is a starting point rather than a destination.
      </p>
    );
  }
  const remaining = route.filter((s) => !s.known).length;
  return (
    <div>
      <p className="mb-3 text-sm text-fg-muted">
        {route.length} pages, ordered so nothing comes before what it depends on — {remaining} still to read. Tick what you already know and the count
        follows; it is stored in this browser only.
      </p>
      <ol aria-label="What to read first" className="space-y-1.5">
        {route.map((step, i) => {
          const node = graph.nodes.get(step.id);
          if (!node) return null;
          return (
            <li key={step.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
              <input
                type="checkbox"
                checked={step.known}
                onChange={(e) => setKnown(step.id, e.target.checked)}
                aria-label={`I already know ${node.name}`}
                className="accent-[var(--accent)]"
              />
              <span className="w-6 shrink-0 text-right font-mono text-[11px] text-fg-faint">{i + 1}</span>
              <Link href={node.href} data-type={node.type} className={`group min-w-0 flex-1 ${step.known ? "opacity-55" : ""}`}>
                <span className="flex items-baseline gap-2">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                  <span className={`text-sm font-medium text-fg group-hover:underline ${step.known ? "line-through" : ""}`}>{node.name}</span>
                  <span className="truncate text-xs text-fg-faint">{node.tagline}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
