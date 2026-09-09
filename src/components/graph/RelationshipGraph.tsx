"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { GraphView } from "@/lib/content/graph";
import { RELATION_LABEL, TYPE_LABEL, type NodeType } from "@/lib/content/types";

type SimNode = GraphView["nodes"][number] & SimulationNodeDatum & { r: number };
type SimLink = SimulationLinkDatum<SimNode> & { rel: GraphView["edges"][number]["rel"] };

const TYPE_LIST: NodeType[] = ["technology", "concept", "pattern", "architecture", "comparison", "system-design", "roadmap"];

export interface RelationshipGraphProps {
  data: GraphView;
  height?: number;
  /** Bigger, slower, prettier — for the home universe / explore page. */
  mode?: "ego" | "universe";
  className?: string;
  /** Called on node click instead of navigating (optional). */
  onSelect?: (id: string) => void;
}

/** Deterministic pseudo-random in [0,1) from a string — keeps render pure. */
function jitter(id: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function radiusFor(n: GraphView["nodes"][number], mode: "ego" | "universe") {
  if (n.center) return 26;
  const base = mode === "universe" ? 7 : 9;
  return base + Math.min(10, Math.sqrt(n.degree) * 1.6) - (n.depth >= 2 ? 3 : 0);
}

/**
 * Force-directed SVG graph. Nodes are links; hovering highlights the
 * neighbourhood; wheel zooms; drag pans (or drags a node). Legend + text
 * alternative are rendered for accessibility.
 */
export function RelationshipGraph({ data, height = 440, mode = "ego", className = "", onSelect }: RelationshipGraphProps) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: height });
  const [hover, setHover] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [pinnedTypes, setPinnedTypes] = useState<Set<NodeType> | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const dragging = useRef<{ id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);
  const [tick, setTick] = useState(0);
  const [settledFor, setSettledFor] = useState<object | null>(null);

  // Simulation inputs — recreated when data / size / mode change. (Not rendered on the server.)
  const sim = useMemo(() => {
    const w = size.w;
    const h = size.h;
    const simNodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      r: radiusFor(n, mode),
      x: w / 2 + (jitter(n.id, 1) - 0.5) * (n.center ? 0 : w * 0.6),
      y: h / 2 + (jitter(n.id, 2) - 0.5) * (n.center ? 0 : h * 0.6),
      fx: n.center ? w / 2 : undefined,
      fy: n.center ? h / 2 : undefined,
    }));
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = data.edges
      .filter((e) => byId.has(e.from) && byId.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, rel: e.rel }));
    return { nodes: simNodes, links: simLinks, key: {} as object };
  }, [data, size, mode]);
  const nodes = sim.nodes;
  const links = sim.links;
  const settled = settledFor === sim.key;

  // Resize
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.max(320, e.contentRect.width);
      setSize({ w, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  // Simulation
  useEffect(() => {
    const w = size.w;
    const h = size.h;
    const simNodes = sim.nodes;
    const simLinks = sim.links;
    const simKey = sim.key;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const simulation = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((l) => {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            const depthBoost = (s.depth + t.depth) * (mode === "ego" ? 14 : 4);
            return (mode === "universe" ? 72 : 70) + depthBoost;
          })
          .strength(mode === "universe" ? 0.25 : 0.6),
      )
      .force("charge", forceManyBody<SimNode>().strength(mode === "universe" ? -220 : -260).distanceMax(mode === "universe" ? 420 : 420))
      .force("collide", forceCollide<SimNode>().radius((d) => d.r + (mode === "universe" ? 22 : 16)).iterations(2))
      .force("center", forceCenter(w / 2, h / 2).strength(0.05))
      .force("x", forceX<SimNode>(w / 2).strength(mode === "universe" ? 0.025 : 0.04))
      .force("y", forceY<SimNode>(h / 2).strength(mode === "universe" ? 0.07 : 0.08));

    simRef.current = simulation;

    let raf = 0;
    if (reduce) {
      simulation.stop();
      for (let i = 0; i < 300; i++) simulation.tick();
      raf = requestAnimationFrame(() => {
        setTick((t) => t + 1);
        setSettledFor(simKey);
      });
      return () => {
        cancelAnimationFrame(raf);
        simulation.stop();
      };
    }
    const loop = () => {
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    simulation.on("end", () => {
      cancelAnimationFrame(raf);
      setSettledFor(simKey);
      setTick((t) => t + 1);
    });
    return () => {
      cancelAnimationFrame(raf);
      simulation.stop();
    };
  }, [sim, size, mode]);

  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of data.edges) {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    }
    return m;
  }, [data]);

  const typesPresent = useMemo(() => TYPE_LIST.filter((t) => data.nodes.some((n) => n.type === t)), [data]);

  const isDim = useCallback(
    (id: string, type: NodeType) => {
      if (pinnedTypes && !pinnedTypes.has(type)) return true;
      if (!hover) return false;
      return id !== hover && !neighbours.get(hover)?.has(id);
    },
    [hover, neighbours, pinnedTypes],
  );

  // Pointer interactions: pan / drag node
  const toLocal = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left - view.x) / view.k, y: (e.clientY - rect.top - view.y) / view.k };
  };
  const onPointerDown = (e: React.PointerEvent, id?: string) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragging.current = { id, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
    if (id) {
      const n = nodes.find((x) => x.id === id);
      if (n) {
        n.fx = n.x;
        n.fy = n.y;
        simRef.current?.alphaTarget(0.25).restart();
      }
    } else setPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.id) {
      const n = nodes.find((x) => x.id === d.id);
      if (n) {
        const p = toLocal(e);
        n.fx = p.x;
        n.fy = p.y;
        setTick((t) => t + 1);
      }
    } else {
      setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    }
  };
  const onPointerUp = () => {
    const d = dragging.current;
    dragging.current = null;
    setPanning(false);
    if (!d) return;
    if (d.id) {
      const n = nodes.find((x) => x.id === d.id);
      if (n && !n.center) {
        n.fx = undefined;
        n.fy = undefined;
      }
      simRef.current?.alphaTarget(0);
      if (!d.moved) {
        if (onSelect) onSelect(d.id);
        else {
          const target = nodes.find((x) => x.id === d.id);
          if (target) router.push(target.href);
        }
      }
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && mode === "ego") return; // don't hijack page scroll on detail pages
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const k = Math.min(3, Math.max(0.4, v.k * factor));
      const ratio = k / v.k;
      return { k, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
    });
  };

  const hovered = hover ? nodes.find((n) => n.id === hover) : undefined;

  return (
    <div ref={wrapRef} className={`relative ${className}`} data-graph-nodes={nodes.length} data-graph-edges={links.length}>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="block touch-none select-none rounded-lg border border-border bg-bg-subtle"
        style={{ cursor: panning ? "grabbing" : "grab" }}
        onPointerDown={(e) => onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        role="img"
        aria-label={`Relationship graph with ${nodes.length} nodes and ${links.length} connections. A text list follows.`}
        data-tick={tick}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {links.map((l, i) => {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            if (s.x == null || t.x == null) return null;
            const active = hover && (s.id === hover || t.id === hover);
            const dim = (hover && !active) || (pinnedTypes && (!pinnedTypes.has(s.type) || !pinnedTypes.has(t.type)));
            const mx = (s.x + t.x) / 2;
            const my = (s.y! + t.y!) / 2;
            return (
              <g key={i} data-graph-edge>
                <line
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={active ? "var(--accent)" : "var(--border-strong)"}
                  strokeOpacity={dim ? 0.15 : active ? 0.95 : 0.55}
                  strokeWidth={active ? 1.6 : 1}
                  strokeDasharray={l.rel === "ALTERNATIVE_TO" ? "4 4" : undefined}
                />
                {active && (
                  <text
                    x={mx}
                    y={my - 4}
                    textAnchor="middle"
                    className="pointer-events-none font-mono text-[9px]"
                    fill="var(--fg-muted)"
                  >
                    {RELATION_LABEL[l.rel]}
                  </text>
                )}
              </g>
            );
          })}
          {nodes.map((n) => {
            if (n.x == null || n.y == null) return null;
            const dim = isDim(n.id, n.type);
            const showLabel = n.center || n.r >= 11 || hover === n.id || mode === "ego" || n.degree > 6;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y})`}
                data-graph-node
                data-type={n.type}
                style={{ opacity: dim ? 0.25 : 1, transition: settled ? "opacity 160ms ease" : undefined, cursor: "pointer" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onPointerDown(e, n.id);
                }}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover(null)}
                tabIndex={0}
                role="link"
                aria-label={`${n.name} — ${TYPE_LABEL[n.type]}`}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (onSelect) onSelect(n.id);
                  else router.push(n.href);
                }}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
              >
                {n.center && (
                  <circle r={n.r + 8} fill="none" stroke="var(--type)" strokeOpacity={0.25} strokeWidth={6} />
                )}
                <circle
                  r={n.r}
                  fill={n.center ? "var(--type)" : "var(--surface)"}
                  stroke="var(--type)"
                  strokeWidth={n.center ? 0 : hover === n.id ? 2.5 : 1.5}
                />
                {!n.center && <circle r={Math.max(2, n.r * 0.35)} fill="var(--type)" opacity={0.9} />}
                {showLabel && (
                  <text
                    y={n.r + 13}
                    textAnchor="middle"
                    className="pointer-events-none select-none"
                    style={{ fontSize: n.center ? 13 : 11, fontWeight: n.center ? 600 : 500 }}
                    fill={n.center ? "var(--fg)" : "var(--fg-muted)"}
                    stroke="var(--bg-subtle)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {n.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* tooltip */}
      {hovered && hovered.x != null && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-md border border-border bg-surface p-3 text-xs shadow-md"
          style={{
            left: Math.min(size.w - 230, Math.max(8, hovered.x * view.k + view.x + 16)),
            top: Math.max(8, hovered.y! * view.k + view.y - 10),
          }}
          role="tooltip"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-semibold text-fg">{hovered.name}</span>
            <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: `var(--c-${hovered.type})` }}>
              {TYPE_LABEL[hovered.type]}
            </span>
          </div>
          <div className="text-fg-muted">{hovered.tagline}</div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-fg-faint">
            <span>Difficulty {hovered.difficulty}/5</span>
            <span>{hovered.degree} connections</span>
          </div>
        </div>
      )}

      {/* legend / filter */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
        {typesPresent.map((t) => {
          const on = !pinnedTypes || pinnedTypes.has(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setPinnedTypes((p) => {
                  const next = new Set(p ?? typesPresent);
                  if (next.has(t) && next.size > 1) next.delete(t);
                  else next.add(t);
                  return next.size === typesPresent.length ? null : next;
                })
              }
              className={`inline-flex items-center gap-1.5 rounded px-1 ${on ? "" : "opacity-40"}`}
              data-type={t}
            >
              <span className="size-2 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
              {TYPE_LABEL[t]}
            </button>
          );
        })}
        <span className="ml-auto hidden text-fg-faint sm:inline">
          {mode === "ego" ? "drag to pan · ⌘+wheel to zoom · click a node to open it" : "drag to pan · wheel to zoom · click to open"}
        </span>
        {(view.k !== 1 || view.x !== 0) && (
          <button type="button" className="text-fg-muted underline" onClick={() => setView({ x: 0, y: 0, k: 1 })}>
            reset view
          </button>
        )}
      </div>

      {/* text alternative */}
      <details className="mt-2 text-xs text-fg-faint">
        <summary className="cursor-pointer">Text version of this graph</summary>
        <ul className="mt-1 columns-2 gap-4 sm:columns-3">
          {data.nodes.map((n) => (
            <li key={n.id}>
              <Link href={n.href} className="hover:text-fg">
                {n.name}
              </Link>{" "}
              <span className="opacity-70">({TYPE_LABEL[n.type]})</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
