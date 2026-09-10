"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useGraphApi, type ApiNode } from "@/lib/useGraphApi";
import { TYPE_LABEL, type Relation } from "@/lib/content/types";

/**
 * A mind map over the knowledge graph.
 *
 * The force graph answers "what is the shape of this neighbourhood?". A mind map
 * answers a different question: "what are this thing's branches, and what is on
 * each one?". So the layout here is deliberate rather than simulated — one centre,
 * a branch per kind of relationship, leaves along each branch — and clicking a leaf
 * re-centres instead of navigating, so a reader can wander without page loads.
 */

/** Relation + direction → the branch it belongs on. Order sets the drawing order. */
const BRANCHES: { key: string; label: string; match: (rel: Relation, dir: "out" | "in") => boolean }[] = [
  { key: "requires", label: "Build on", match: (r, d) => r === "REQUIRES" && d === "out" },
  { key: "alternatives", label: "Instead of", match: (r) => r === "ALTERNATIVE_TO" },
  { key: "with", label: "Works with", match: (r) => r === "USED_WITH" },
  { key: "implements", label: "Implements", match: (r, d) => (r === "IMPLEMENTS" || r === "SOLVES") && d === "out" },
  { key: "usedin", label: "Appears in", match: (r, d) => (r === "USED_IN" || r === "PART_OF") && d === "out" },
  { key: "uses", label: "Used here", match: (r, d) => (r === "USED_IN" || r === "PART_OF" || r === "IMPLEMENTS" || r === "SOLVES") && d === "in" },
  { key: "requiredby", label: "Leads to", match: (r, d) => r === "REQUIRES" && d === "in" },
  { key: "related", label: "Related", match: (r) => r === "RELATED_TO" },
];

const PER_BRANCH = 6;
const X_HUB = 168;
const X_LEAF = 330;
const ROW = 26;
const BRANCH_GAP = 22;
const W = 1040;

interface Leaf {
  node: ApiNode;
  x: number;
  y: number;
}
interface Branch {
  key: string;
  label: string;
  side: -1 | 1;
  hub: { x: number; y: number };
  leaves: Leaf[];
  hidden: number;
  /** where the "+N more" chip sits */
  more: { x: number; y: number };
}

export interface MindMapProps {
  /** Ids visited so far; the last one is the centre. Owned by the page so the URL and the trail cannot fight. */
  trail: string[];
  onFocus: (id: string) => void;
  onBack: (index: number) => void;
}

export function MindMap({ trail, onFocus, onBack }: MindMapProps) {
  const { graph, loading } = useGraphApi();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const focusId = trail[trail.length - 1];
  const centre = graph?.nodes.get(focusId);

  const focus = useCallback(
    (id: string) => {
      setExpanded(new Set());
      onFocus(id);
    },
    [onFocus],
  );

  const back = (index: number) => {
    setExpanded(new Set());
    onBack(index);
  };

  const branches: Branch[] = useMemo(() => {
    if (!graph || !centre) return [];
    const neighbours = graph.adjacency.get(centre.id) ?? [];
    const seen = new Set<string>();
    const buckets = new Map<string, ApiNode[]>();

    for (const b of BRANCHES) {
      for (const n of neighbours) {
        if (seen.has(n.other) || !b.match(n.rel, n.direction)) continue;
        const node = graph.nodes.get(n.other);
        if (!node) continue;
        seen.add(n.other);
        const list = buckets.get(b.key);
        if (list) list.push(node);
        else buckets.set(b.key, [node]);
      }
    }

    const present = BRANCHES.filter((b) => buckets.has(b.key)).map((b) => {
      const all = (buckets.get(b.key) ?? []).sort((x, y) => y.degree - x.degree || x.name.localeCompare(y.name));
      const shown = expanded.has(b.key) ? all.slice(0, 14) : all.slice(0, PER_BRANCH);
      return { def: b, all, shown };
    });
    if (present.length === 0) return [];

    // Classic two-sided mind map: branches alternate left and right, each branch is a
    // spine with its leaves stacked in a column. Deterministic, and no label can
    // collide with another by construction.
    const sides: { side: -1 | 1; items: typeof present }[] = [
      { side: 1, items: present.filter((_, i) => i % 2 === 0) },
      { side: -1, items: present.filter((_, i) => i % 2 === 1) },
    ];

    const out: Branch[] = [];
    for (const { side, items } of sides) {
      const rows = items.reduce((sum, p) => sum + p.shown.length, 0);
      const height = rows * ROW + Math.max(0, items.length - 1) * BRANCH_GAP;
      let y = -height / 2;
      for (const p of items) {
        const n = p.shown.length;
        const bandTop = y;
        const leaves: Leaf[] = p.shown.map((node, j) => ({
          node,
          x: side * X_LEAF,
          y: bandTop + (j + 0.5) * ROW,
        }));
        const hubY = bandTop + (n * ROW) / 2;
        out.push({
          key: p.def.key,
          label: p.def.label,
          side,
          hub: { x: side * X_HUB, y: hubY },
          leaves,
          hidden: p.all.length - p.shown.length,
          more: { x: side * X_LEAF, y: bandTop + n * ROW + 12 },
        });
        y = bandTop + n * ROW + BRANCH_GAP;
      }
    }
    return out;
  }, [graph, centre, expanded]);

  const mermaid = useMemo(() => {
    if (!centre) return "";
    const safe = (s: string) => s.replace(/"/g, "'");
    const lines = ["graph LR", `  root["${safe(centre.name)}"]`];
    branches.forEach((b, i) => {
      lines.push(`  b${i}("${safe(b.label)}")`, `  root --> b${i}`);
      b.leaves.forEach((l, j) => {
        lines.push(`  n${i}_${j}["${safe(l.node.name)}"]`, `  b${i} --> n${i}_${j}`);
      });
    });
    return lines.join("\n");
  }, [centre, branches]);

  /** Tall enough for the busiest side, so nothing is clipped. */
  const height = useMemo(() => {
    const extent = branches.flatMap((b) => [...b.leaves.map((l) => Math.abs(l.y)), Math.abs(b.more.y)]);
    return Math.max(420, Math.ceil((Math.max(0, ...extent) + 60) * 2));
  }, [branches]);

  const [copied, setCopied] = useState(false);
  const copyMermaid = async () => {
    try {
      await navigator.clipboard.writeText(mermaid);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — nothing useful to say */
    }
  };

  if (loading) {
    return (
      <div className="grid-bg flex h-[520px] items-center justify-center rounded-xl border border-border text-sm text-fg-faint">
        loading the graph…
      </div>
    );
  }
  if (!graph || !centre) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-fg-muted">
        The graph could not be loaded. <Link href="/explore" className="text-accent hover:underline">Open the force graph</Link> instead.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      {/* Trail + actions */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <nav aria-label="Where you have been" className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
          {trail.map((id, i) => {
            const n = graph.nodes.get(id);
            if (!n) return null;
            const last = i === trail.length - 1;
            return (
              <span key={`${id}-${i}`} className="flex items-center gap-1">
                {i > 0 && <span className="text-fg-faint" aria-hidden>→</span>}
                {last ? (
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-fg">{n.name}</span>
                ) : (
                  <button type="button" onClick={() => back(i)} className="rounded px-1.5 py-0.5 text-fg-muted hover:text-fg">
                    {n.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={copyMermaid}
            className="h-8 rounded-md border border-border px-2.5 text-[12px] text-fg-muted hover:text-fg"
            title="Copy this map as a Mermaid graph"
          >
            {copied ? "Copied" : "Copy as Mermaid"}
          </button>
          <Link href={centre.href} className="h-8 rounded-md bg-accent px-3 text-[13px] font-semibold leading-8 text-accent-fg hover:opacity-90">
            Open {centre.name}
          </Link>
        </div>
      </div>

      {/* Map */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`${-W / 2} ${-height / 2} ${W} ${height}`}
          className="block w-full min-w-[760px]"
          style={{ height: Math.min(720, Math.max(420, height)) }}
          role="img"
          aria-label={`Mind map centred on ${centre.name}, with ${branches.length} branches. A text version follows.`}
        >
          {branches.map((b) => {
            const dim = hover ? !b.leaves.some((l) => l.node.id === hover) : false;
            return (
              <g key={b.key} opacity={dim ? 0.35 : 1} style={{ transition: "opacity 150ms" }}>
                {/* centre → hub */}
                <path
                  d={`M${b.side * 42} 0 C ${b.side * 110} 0 ${b.side * 110} ${b.hub.y} ${b.hub.x - b.side * 44} ${b.hub.y}`}
                  fill="none"
                  stroke="var(--border-strong)"
                  strokeWidth={1.5}
                />
                {/* hub → leaves */}
                {b.leaves.map((l, li) => (
                  <path
                    key={li}
                    d={`M${b.hub.x + b.side * 44} ${b.hub.y} C ${(b.hub.x + l.x) / 2} ${b.hub.y} ${(b.hub.x + l.x) / 2} ${l.y} ${l.x - b.side * 8} ${l.y}`}
                    fill="none"
                    stroke={hover === l.node.id ? "var(--accent)" : "var(--border)"}
                    strokeWidth={hover === l.node.id ? 2 : 1.25}
                  />
                ))}
                {/* hub label */}
                <g transform={`translate(${b.hub.x} ${b.hub.y})`}>
                  <rect x={-44} y={-11} width={88} height={22} rx={11} fill="var(--surface-2)" stroke="var(--border-strong)" />
                  <text textAnchor="middle" y={4} className="font-mono" style={{ fontSize: 10, letterSpacing: 0.3 }} fill="var(--fg-muted)">
                    {b.label}
                  </text>
                </g>
                {/* leaves */}
                {b.leaves.map((l) => {
                  const right = b.side === 1;
                  return (
                    <g
                      key={l.node.id}
                      transform={`translate(${l.x} ${l.y})`}
                      data-type={l.node.type}
                      onPointerEnter={() => setHover(l.node.id)}
                      onPointerLeave={() => setHover(null)}
                      onClick={() => focus(l.node.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          focus(l.node.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`${l.node.name}, ${TYPE_LABEL[l.node.type]}. Re-centre the map here.`}
                      style={{ cursor: "pointer" }}
                    >
                      <circle r={hover === l.node.id ? 6 : 4.5} fill="var(--type)" stroke="var(--bg)" strokeWidth={1.5} />
                      <text
                        x={right ? 10 : -10}
                        y={4}
                        textAnchor={right ? "start" : "end"}
                        style={{ fontSize: 11.5, fontWeight: hover === l.node.id ? 600 : 500 }}
                        fill={hover === l.node.id ? "var(--fg)" : "var(--fg-muted)"}
                        stroke="var(--surface)"
                        strokeWidth={3}
                        paintOrder="stroke"
                      >
                        {l.node.name.length > 26 ? `${l.node.name.slice(0, 25)}…` : l.node.name}
                      </text>
                    </g>
                  );
                })}
                {b.hidden > 0 && (
                  <g
                    transform={`translate(${b.more.x + b.side * 18} ${b.more.y})`}
                    onClick={() => setExpanded((e) => new Set(e).add(b.key))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpanded((s) => new Set(s).add(b.key));
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Show ${b.hidden} more under ${b.label}`}
                    style={{ cursor: "pointer" }}
                  >
                    <rect x={-26} y={-9} width={52} height={18} rx={9} fill="var(--surface)" stroke="var(--border-strong)" strokeDasharray="3 3" />
                    <text textAnchor="middle" y={4} style={{ fontSize: 10 }} fill="var(--fg-faint)">
                      +{b.hidden}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* centre */}
          <g data-type={centre.type}>
            <circle r={54} fill="var(--type)" opacity={0.12} />
            <circle r={40} fill="var(--surface)" stroke="var(--type)" strokeWidth={2} />
            <text textAnchor="middle" y={-2} style={{ fontSize: 13, fontWeight: 650 }} fill="var(--fg)">
              {centre.name.length > 16 ? `${centre.name.slice(0, 15)}…` : centre.name}
            </text>
            <text textAnchor="middle" y={13} className="font-mono" style={{ fontSize: 8.5 }} fill="var(--fg-faint)">
              {TYPE_LABEL[centre.type].toUpperCase()}
            </text>
          </g>
        </svg>
      </div>

      {/* Centre summary + hint */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border px-4 py-3 text-sm">
        <span className="font-semibold">{centre.name}</span>
        <span className="text-fg-muted">{centre.tagline}</span>
        <span className="ml-auto text-xs text-fg-faint">click a leaf to re-centre · {graph.adjacency.get(centre.id)?.length ?? 0} connections</span>
      </div>

      {/* Text alternative */}
      <details className="border-t border-border px-4 py-2 text-xs text-fg-faint">
        <summary className="cursor-pointer">Text version of this map</summary>
        <ul className="mt-2 space-y-2">
          {branches.map((b) => (
            <li key={b.key}>
              <span className="font-mono uppercase tracking-wider">{b.label}</span>
              <span className="ml-2">
                {b.leaves.map((l, i) => (
                  <span key={l.node.id}>
                    {i > 0 && ", "}
                    <Link href={l.node.href} className="hover:text-fg">
                      {l.node.name}
                    </Link>
                  </span>
                ))}
                {b.hidden > 0 && <span> and {b.hidden} more</span>}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
