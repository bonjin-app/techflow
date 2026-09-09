"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArchDecision, ArchEdge, ArchFlow, ArchNode, ArchNodeKind, ArchVersion } from "@/lib/content/types";
import type { RefMap } from "@/components/md/refs";

const CELL_W = 190;
const CELL_H = 104;
const NODE_W = 150;
const NODE_H = 48;
const PAD = 40;

const KIND_ICON: Record<ArchNodeKind, string> = {
  client: "◐",
  edge: "◈",
  lb: "⇶",
  service: "▣",
  cache: "⚡",
  db: "▤",
  queue: "≣",
  storage: "▥",
  external: "◇",
  worker: "⚙",
};

const KIND_COLOR: Record<ArchNodeKind, string> = {
  client: "var(--fg-muted)",
  edge: "var(--c-comparison)",
  lb: "var(--c-system-design)",
  service: "var(--c-technology)",
  cache: "var(--c-pattern)",
  db: "var(--c-concept)",
  queue: "var(--c-architecture)",
  storage: "var(--c-concept)",
  external: "var(--fg-faint)",
  worker: "var(--c-technology)",
};

export interface ArchitectureCanvasProps {
  nodes: ArchNode[];
  edges: ArchEdge[];
  flows?: ArchFlow[];
  versions?: ArchVersion[];
  decisions?: ArchDecision[];
  refs: RefMap;
  textAlternative?: string;
  /** compact = smaller header, no inspector column (system-design steps) */
  compact?: boolean;
  title?: string;
}

interface Pt {
  x: number;
  y: number;
}

function center(n: ArchNode): Pt {
  return { x: PAD + n.x * CELL_W + NODE_W / 2, y: PAD + n.y * CELL_H + NODE_H / 2 };
}

/** Anchor points on node borders so edges don't start at the centre. */
function anchors(a: ArchNode, b: ArchNode): [Pt, Pt] {
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const hw = NODE_W / 2;
  const hh = NODE_H / 2;
  const edgePt = (c: Pt, sx: number, sy: number): Pt => {
    if (Math.abs(sy) * hw > Math.abs(sx) * hh) {
      // vertical exit
      return { x: c.x + (sx / Math.abs(sy || 1)) * hh * 0.35, y: c.y + Math.sign(sy) * hh };
    }
    return { x: c.x + Math.sign(sx) * hw, y: c.y + (sy / Math.abs(sx || 1)) * hw * 0.2 };
  };
  return [edgePt(ca, dx, dy), edgePt(cb, -dx, -dy)];
}

function pathBetween(a: Pt, b: Pt): string {
  const vertical = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x);
  if (vertical) {
    const my = (a.y + b.y) / 2;
    return `M${a.x} ${a.y} C${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`;
  }
  const mx = (a.x + b.x) / 2;
  return `M${a.x} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
}

/**
 * Interactive architecture diagram: zoom/pan, ▶ Run animates a packet along a
 * flow with step-by-step captions, click a node for the inspector, versions
 * show how the system grew. Renders a text alternative for accessibility.
 */
export function ArchitectureCanvas(props: ArchitectureCanvasProps) {
  const { nodes, edges, flows = [], versions, decisions = [], refs, textAlternative, compact = false, title } = props;

  const [versionIdx, setVersionIdx] = useState<number>(versions ? versions.length - 1 : -1);
  const visibleIds = useMemo(() => {
    if (!versions || versionIdx < 0) return new Set(nodes.map((n) => n.id));
    return new Set(versions[versionIdx].nodes);
  }, [versions, versionIdx, nodes]);

  const vNodes = useMemo(() => nodes.filter((n) => visibleIds.has(n.id)), [nodes, visibleIds]);
  const vEdges = useMemo(() => edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)), [edges, visibleIds]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const cols = Math.max(...nodes.map((n) => n.x)) + 1;
  const rows = Math.max(...nodes.map((n) => n.y)) + 1;
  const worldW = PAD * 2 + (cols - 1) * CELL_W + NODE_W;
  const worldH = PAD * 2 + (rows - 1) * CELL_H + NODE_H;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(800);
  // Taller diagrams get a taller canvas so labels stay legible at fit scale.
  const vh = compact ? Math.min(420, Math.max(300, worldH * 0.9)) : Math.min(720, Math.max(480, worldH * 0.85));
  const [fullscreen, setFullscreen] = useState(false);
  const [panning, setPanning] = useState(false);
  const viewH = fullscreen && typeof window !== "undefined" ? window.innerHeight : vh;
  // The displayed view is the user's override, or the auto-fit derived from the container size.
  const fitted = useMemo(() => {
    const k = Math.min(1.1, (vw - 24) / worldW, (viewH - 24) / worldH);
    return { k, x: (vw - worldW * k) / 2, y: (viewH - worldH * k) / 2 };
  }, [vw, viewH, worldW, worldH]);
  const [viewOverride, setViewOverride] = useState<{ x: number; y: number; k: number } | null>(null);
  const view = viewOverride ?? fitted;
  const setView = useCallback(
    (updater: (v: { x: number; y: number; k: number }) => { x: number; y: number; k: number }) =>
      setViewOverride((o) => updater(o ?? fitted)),
    [fitted],
  );
  const fit = useCallback(() => setViewOverride(null), []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setVw(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Flow animation ───────────────────────────────────────────────────
  const [flowIdx, setFlowIdx] = useState(0);
  const flow = flows.filter((f) => f.path.every((p) => visibleIds.has(p)))[flowIdx] ?? flows.find((f) => f.path.every((p) => visibleIds.has(p)));
  const [step, setStep] = useState(-1); // index of the node the packet is at
  const [playing, setPlaying] = useState(false);
  const [packet, setPacket] = useState<Pt | null>(null);
  const rafRef = useRef(0);
  const [selected, setSelected] = useState<string | null>(null);

  const stopAnim = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
  }, []);

  const animateHop = useCallback(
    (from: ArchNode, to: ArchNode, ms: number, done: () => void) => {
      const [a, b] = anchors(from, to);
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / ms);
        const e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p; // easeInOut
        // approximate the bezier by lerping through the midpoint
        const vertical = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x);
        const mid = vertical ? { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e } : { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
        setPacket(mid);
        if (p < 1) rafRef.current = requestAnimationFrame(tick);
        else done();
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  const runFrom = useCallback(
    (i: number) => {
      if (!flow) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setPlaying(true);
      setStep(i);
      const go = (idx: number) => {
        if (idx >= flow.path.length - 1) {
          setPlaying(false);
          setPacket(null);
          return;
        }
        const from = byId.get(flow.path[idx])!;
        const to = byId.get(flow.path[idx + 1])!;
        if (reduce) {
          setStep(idx + 1);
          go(idx + 1);
          return;
        }
        animateHop(from, to, 700, () => {
          setStep(idx + 1);
          // dwell on the node so the caption can be read
          rafRef.current = requestAnimationFrame(() => {
            const dwell = performance.now();
            const wait = (t: number) => {
              if (t - dwell < 650) rafRef.current = requestAnimationFrame(wait);
              else go(idx + 1);
            };
            rafRef.current = requestAnimationFrame(wait);
          });
        });
      };
      go(i);
    },
    [flow, byId, animateHop],
  );

  const run = () => {
    stopAnim();
    setSelected(null);
    runFrom(0);
  };
  const stepOnce = () => {
    if (!flow) return;
    stopAnim();
    setPacket(null);
    setStep((s) => (s + 1 >= flow.path.length ? 0 : s + 1));
  };
  const reset = () => {
    stopAnim();
    setStep(-1);
    setPacket(null);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Pan / zoom ──────────────────────────────────────────────────────
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
    setPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    if (d && !d.moved) setSelected(null);
  };
  const zoomBy = (factor: number, cx = vw / 2, cy = vh / 2) =>
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.35, v.k * factor));
      const r = k / v.k;
      return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
    });
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
  };

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen?.();
  };
  useEffect(() => {
    const onFs = () => {
      setFullscreen(!!document.fullscreenElement);
      fit();
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [fit]);

  // Keyboard on canvas
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === " ") {
      e.preventDefault();
      if (playing) stopAnim();
      else run();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stepOnce();
    } else if (e.key === "Escape") setSelected(null);
    else if (e.key === "f") fit();
    else if (e.key === "+" || e.key === "=") zoomBy(1.2);
    else if (e.key === "-") zoomBy(1 / 1.2);
  };

  const activeNodeId = flow && step >= 0 ? flow.path[step] : null;
  const activeEdgeKey = flow && step >= 0 && step < flow.path.length - 1 && playing ? `${flow.path[step]}→${flow.path[step + 1]}` : null;
  const pathSet = new Set(flow?.path ?? []);
  const sel = selected ? byId.get(selected) : undefined;
  const selRef = sel?.ref ? refs[sel.ref] : undefined;

  const canvasH = fullscreen ? "100vh" : vh;

  return (
    <div
      ref={wrapRef}
      className={`rounded-xl border border-border bg-surface ${fullscreen ? "flex h-screen flex-col" : ""}`}
      data-graph-nodes={vNodes.length}
      data-graph-edges={vEdges.length}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {title && <span className="mr-2 text-sm font-semibold">{title}</span>}
        {flows.length > 0 && (
          <>
            <button
              type="button"
              onClick={playing ? stopAnim : run}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-fg hover:opacity-90"
            >
              <span aria-hidden>{playing ? "■" : "▶"}</span> {playing ? "Stop" : "Run request"}
            </button>
            <button type="button" onClick={stepOnce} className="h-8 rounded-md border border-border px-2.5 text-[12px] text-fg-muted hover:text-fg" title="Step (→)">
              Step
            </button>
            {flows.length > 1 && (
              <select
                value={flowIdx}
                onChange={(e) => {
                  reset();
                  setFlowIdx(Number(e.target.value));
                }}
                className="h-8 rounded-md border border-border bg-surface px-2 text-[12px] text-fg"
                aria-label="Flow"
              >
                {flows.map((f, i) => (
                  <option key={f.id} value={i} disabled={!f.path.every((p) => visibleIds.has(p))}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => zoomBy(1 / 1.2)} className="size-8 rounded-md border border-border text-fg-muted hover:text-fg" aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => zoomBy(1.2)} className="size-8 rounded-md border border-border text-fg-muted hover:text-fg" aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={fit} className="h-8 rounded-md border border-border px-2 text-[12px] text-fg-muted hover:text-fg" aria-label="Fit to view (f)">
            Fit
          </button>
          {!compact && (
            <button type="button" onClick={toggleFullscreen} className="h-8 rounded-md border border-border px-2 text-[12px] text-fg-muted hover:text-fg" aria-label="Toggle fullscreen">
              {fullscreen ? "Exit" : "⛶"}
            </button>
          )}
        </div>
      </div>

      {/* Versions */}
      {versions && versions.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2" role="tablist" aria-label="Architecture versions">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-fg-faint">Evolution</span>
          {versions.map((v, i) => (
            <button
              key={v.version}
              role="tab"
              aria-selected={i === versionIdx}
              onClick={() => {
                reset();
                setVersionIdx(i);
              }}
              className={`rounded-md px-2 py-1 text-[12px] ${i === versionIdx ? "bg-surface-2 font-semibold text-fg" : "text-fg-muted hover:text-fg"}`}
            >
              <span className="font-mono text-[10px] text-fg-faint">{v.version}</span> {v.title}
            </button>
          ))}
          <span className="ml-auto hidden max-w-md truncate text-[12px] text-fg-muted lg:inline">{versions[versionIdx]?.summary}</span>
        </div>
      )}

      <div className={`grid ${compact || !sel ? "" : "lg:grid-cols-[1fr_300px]"} ${fullscreen ? "min-h-0 flex-1" : ""}`}>
        {/* Canvas */}
        <div
          className="grid-bg relative touch-none select-none overflow-hidden outline-none"
          style={{ height: canvasH, cursor: panning ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          onKeyDown={onKey}
          tabIndex={0}
          role="application"
          aria-label={`Architecture diagram. ${textAlternative ?? ""} Press space to run the request animation, right arrow to step.`}
        >
          <svg width="100%" height="100%" className="block">
            <defs>
              <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 10 5 0 10z" fill="var(--border-strong)" />
              </marker>
              <marker id="arch-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 10 5 0 10z" fill="var(--accent)" />
              </marker>
            </defs>
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {vEdges.map((e, i) => {
                const a = byId.get(e.from)!;
                const b = byId.get(e.to)!;
                const [p1, p2] = anchors(a, b);
                const key = `${e.from}→${e.to}`;
                const onPath = pathSet.has(e.from) && pathSet.has(e.to) && flow && flow.path.indexOf(e.to) === flow.path.indexOf(e.from) + 1;
                const active = key === activeEdgeKey;
                const dimmed = playing && !onPath;
                return (
                  <g key={i} opacity={dimmed ? 0.3 : 1} style={{ transition: "opacity 200ms" }}>
                    <path
                      d={pathBetween(p1, p2)}
                      fill="none"
                      stroke={active ? "var(--accent)" : onPath && step >= 0 ? "var(--accent)" : "var(--border-strong)"}
                      strokeOpacity={onPath && step >= 0 && !active ? 0.5 : 1}
                      strokeWidth={active ? 2 : 1.25}
                      strokeDasharray={e.style === "dashed" ? "5 4" : undefined}
                      markerEnd={active ? "url(#arch-arrow-active)" : "url(#arch-arrow)"}
                    />
                    {e.label && (
                      <text
                        x={(p1.x + p2.x) / 2}
                        y={(p1.y + p2.y) / 2 - 5}
                        textAnchor="middle"
                        className="font-mono"
                        style={{ fontSize: 9.5 }}
                        fill="var(--fg-faint)"
                        stroke="var(--bg-subtle)"
                        strokeWidth={3}
                        paintOrder="stroke"
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {vNodes.map((n) => {
                const c = center(n);
                const isActive = n.id === activeNodeId;
                const isSel = n.id === selected;
                const r = n.ref ? refs[n.ref] : undefined;
                const color = KIND_COLOR[n.kind];
                return (
                  <g
                    key={n.id}
                    transform={`translate(${c.x - NODE_W / 2} ${c.y - NODE_H / 2})`}
                    className="cursor-pointer"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected((s) => (s === n.id ? null : n.id));
                    }}
                    role="button"
                    tabIndex={-1}
                    aria-label={`${n.label}${n.role ? `, ${n.role}` : ""}`}
                    style={{ opacity: playing && !pathSet.has(n.id) ? 0.4 : 1, transition: "opacity 200ms" }}
                  >
                    {isActive && (
                      <rect x={-6} y={-6} width={NODE_W + 12} height={NODE_H + 12} rx={12} fill="none" stroke="var(--accent)" strokeOpacity={0.35} strokeWidth={6} />
                    )}
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={8}
                      fill="var(--surface)"
                      stroke={isSel || isActive ? "var(--accent)" : color}
                      strokeWidth={isSel || isActive ? 2 : 1.25}
                    />
                    <rect width={4} height={NODE_H} rx={2} fill={color} />
                    <text x={16} y={NODE_H / 2 - (n.role ? 3 : -4)} style={{ fontSize: 12.5, fontWeight: 600 }} fill="var(--fg)">
                      <tspan fill={color} style={{ fontSize: 11 }}>
                        {KIND_ICON[n.kind]}
                      </tspan>
                      <tspan dx={6}>{n.label}</tspan>
                    </text>
                    {n.role && (
                      <text x={16} y={NODE_H / 2 + 12} style={{ fontSize: 9.5 }} fill="var(--fg-faint)" className="font-mono">
                        {n.role.length > 26 ? n.role.slice(0, 25) + "…" : n.role}
                      </text>
                    )}
                    {r && <circle cx={NODE_W - 10} cy={10} r={3} fill={`var(--c-${r.type})`} />}
                  </g>
                );
              })}
              {packet && (
                <g transform={`translate(${packet.x} ${packet.y})`} aria-hidden>
                  <circle r={9} fill="var(--accent)" opacity={0.25} />
                  <circle r={5} fill="var(--accent)" />
                </g>
              )}
            </g>
          </svg>

          {/* Step caption */}
          {flow && step >= 0 && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              <div className="animate-fade-up max-w-xl rounded-md border border-border bg-surface/95 px-3 py-2 text-[13px] shadow-md backdrop-blur">
                <span className="mr-2 font-mono text-[10px] text-fg-faint">
                  {step + 1}/{flow.path.length}
                </span>
                <span className="font-semibold">{byId.get(flow.path[step])?.label}</span>
                <span className="text-fg-muted"> — {flow.steps[step] ?? ""}</span>
              </div>
            </div>
          )}

          {/* Mini-map */}
          {!compact && (
            <svg
              className="pointer-events-none absolute right-3 top-3 hidden rounded border border-border bg-surface/80 sm:block"
              width={110}
              height={Math.max(50, Math.round((110 * worldH) / worldW))}
              viewBox={`0 0 ${worldW} ${worldH}`}
              aria-hidden
            >
              {vNodes.map((n) => {
                const c = center(n);
                return <rect key={n.id} x={c.x - NODE_W / 2} y={c.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={10} fill={n.id === activeNodeId ? "var(--accent)" : "var(--border-strong)"} />;
              })}
              <rect
                x={-view.x / view.k}
                y={-view.y / view.k}
                width={vw / view.k}
                height={viewH / view.k}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={worldW / 110}
              />
            </svg>
          )}
        </div>

        {/* Inspector */}
        {sel && !compact && (
          <aside className="animate-fade-up border-t border-border p-4 lg:border-l lg:border-t-0" aria-label={`${sel.label} details`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: KIND_COLOR[sel.kind] }}>
                  {sel.kind}
                </div>
                <h3 className="text-base font-semibold">{sel.label}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-fg-faint hover:text-fg" aria-label="Close inspector">
                ✕
              </button>
            </div>
            <dl className="mt-3 space-y-3 text-sm">
              {sel.role && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Role</dt>
                  <dd className="text-fg">{sel.role}</dd>
                </div>
              )}
              {sel.why && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Why</dt>
                  <dd className="text-fg-muted">{sel.why}</dd>
                </div>
              )}
              {sel.alternatives && sel.alternatives.length > 0 && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Alternatives</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {sel.alternatives.map((a) => {
                      const r = refs[a];
                      return r ? (
                        <Link key={a} href={r.href} className="rounded border border-border px-1.5 py-0.5 text-xs text-fg-muted hover:text-fg">
                          {r.name}
                        </Link>
                      ) : (
                        <span key={a} className="rounded border border-border px-1.5 py-0.5 text-xs text-fg-muted">
                          {a}
                        </span>
                      );
                    })}
                  </dd>
                </div>
              )}
              {sel.related && sel.related.length > 0 && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Related</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {sel.related.map((a) => {
                      const r = refs[a];
                      return r ? (
                        <Link key={a} href={r.href} className="rounded border border-border px-1.5 py-0.5 text-xs text-fg-muted hover:text-fg" data-type={r.type}>
                          {r.name}
                        </Link>
                      ) : null;
                    })}
                  </dd>
                </div>
              )}
            </dl>
            {selRef && (
              <Link
                href={selRef.href}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:border-border-strong"
              >
                Open {selRef.name} →
              </Link>
            )}
            {decisions.some((d) => d.decision.toLowerCase().includes(sel.label.toLowerCase().split(" ")[0])) && (
              <p className="mt-3 text-xs text-fg-faint">See the decision record below for why this component was chosen.</p>
            )}
          </aside>
        )}
      </div>

      {/* Legend + hint */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-fg-faint">
        <span>click a node to inspect</span>
        <span className="hidden sm:inline">⌘+wheel to zoom · drag to pan</span>
        <span className="hidden sm:inline">
          <kbd>space</kbd> run · <kbd>→</kbd> step · <kbd>f</kbd> fit
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full" style={{ background: "var(--c-technology)" }} /> dot = linked to the knowledge graph
        </span>
      </div>
    </div>
  );
}
