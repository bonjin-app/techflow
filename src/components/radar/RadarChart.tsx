"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { NodeType, RadarQuadrant, RadarRing } from "@/lib/content/types";
import { TYPE_LABEL } from "@/lib/content/types";

export interface RadarItem {
  ref: string;
  name: string;
  href: string;
  type: NodeType;
  ring: RadarRing;
  quadrant: RadarQuadrant;
  note: string;
  moved?: "in" | "out" | "new";
}

export const RINGS: RadarRing[] = ["adopt", "trial", "assess", "caution"];
export const RING_LABEL: Record<RadarRing, string> = { adopt: "Adopt", trial: "Trial", assess: "Assess", caution: "Caution" };
export const RING_BLURB: Record<RadarRing, string> = {
  adopt: "We would start a new project with this today.",
  trial: "Worth using on a real project where the fit is clear.",
  assess: "Worth understanding; adopt only with a specific reason.",
  caution: "Proceed carefully — the failure modes are easy to underestimate.",
};
export const QUADRANTS: RadarQuadrant[] = ["languages-interfaces", "platforms-delivery", "data-messaging", "architecture-operations"];
export const QUADRANT_LABEL: Record<RadarQuadrant, string> = {
  "languages-interfaces": "Languages & Interfaces",
  "platforms-delivery": "Platforms & Delivery",
  "data-messaging": "Data & Messaging",
  "architecture-operations": "Architecture & Operations",
};

const SIZE = 720;
const C = SIZE / 2;
const RING_R = [0.5, 0.7, 0.86, 1.0].map((f) => f * (C - 24));
// quadrant angle ranges (radians), starting at top-left going clockwise
const QUAD_ANGLE: Record<RadarQuadrant, [number, number]> = {
  "languages-interfaces": [Math.PI, 1.5 * Math.PI],
  "platforms-delivery": [1.5 * Math.PI, 2 * Math.PI],
  "data-messaging": [0, 0.5 * Math.PI],
  "architecture-operations": [0.5 * Math.PI, Math.PI],
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/**
 * Deterministic dot placement inside a ring band and quadrant wedge. Items in the
 * same band are spread across three radial sub-bands and their labels alternate
 * above / below the dot, which keeps a crowded ring readable.
 */
function place(items: RadarItem[]) {
  const out = new Map<string, { x: number; y: number; below: boolean }>();
  const round = (v: number) => Math.round(v * 100) / 100;
  for (const q of QUADRANTS) {
    for (const ring of RINGS) {
      const group = items.filter((i) => i.quadrant === q && i.ring === ring);
      const ri = RINGS.indexOf(ring);
      const inner = ri === 0 ? 46 : RING_R[ri - 1];
      const outer = RING_R[ri];
      const [a0, a1] = QUAD_ANGLE[q];
      group.forEach((it, idx) => {
        const t = group.length === 1 ? 0.5 : (idx + 0.5) / group.length;
        const angle = a0 + (a1 - a0) * (0.07 + 0.86 * t);
        // three radial sub-bands, so neighbouring dots are never at the same radius
        const band = [0.18, 0.5, 0.8][idx % 3];
        const radius = inner + (outer - inner) * (band + 0.1 * hash(it.ref));
        out.set(it.ref, {
          x: round(C + Math.cos(angle) * radius),
          y: round(C + Math.sin(angle) * radius),
          below: idx % 2 === 1,
        });
      });
    }
  }
  return out;
}

export function RadarChart({ items }: { items: RadarItem[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const [quad, setQuad] = useState<RadarQuadrant | null>(null);
  const positions = useMemo(() => place(items), [items]);
  const hovered = hover ? items.find((i) => i.ref === hover) : undefined;
  const visible = quad ? items.filter((i) => i.quadrant === quad) : items;
  /**
   * Past ~40 entries every wedge is too tight to label at once, so labels appear
   * for the focused quadrant only (and for whatever is hovered). Applying the rule
   * to the whole chart rather than per quadrant keeps it from looking half-labelled.
   */
  const dense = items.length > 40;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[720px]" role="img" aria-label="Technology radar: four rings (adopt, trial, assess, caution) across four quadrants. A list version follows.">
          {RING_R.map((r, i) => (
            <circle key={i} cx={C} cy={C} r={r} fill={i === 0 ? "var(--accent-soft)" : "none"} stroke="var(--border-strong)" strokeOpacity={0.8} strokeDasharray={i === 3 ? "4 4" : undefined} />
          ))}
          <line x1={C} y1={20} x2={C} y2={SIZE - 20} stroke="var(--border)" />
          <line x1={20} y1={C} x2={SIZE - 20} y2={C} stroke="var(--border)" />
          {RINGS.map((r, i) => (
            <text key={r} x={C + (i === 0 ? 0 : RING_R[i - 1]) + (RING_R[i] - (i === 0 ? 0 : RING_R[i - 1])) / 2} y={C - 6} textAnchor="middle" className="font-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }} fill="var(--fg-faint)">
              {RING_LABEL[r]}
            </text>
          ))}
          {QUADRANTS.map((q) => {
            const [a0, a1] = QUAD_ANGLE[q];
            const a = (a0 + a1) / 2;
            const r = C - 8;
            const x = C + Math.cos(a) * r;
            const y = C + Math.sin(a) * r;
            return (
              <text key={q} x={x} y={y} textAnchor={x < C ? "start" : "end"} dominantBaseline={y < C ? "hanging" : "auto"} style={{ fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: quad && quad !== q ? 0.35 : 1 }} fill="var(--fg-muted)" onClick={() => setQuad(quad === q ? null : q)}>
                {QUADRANT_LABEL[q]}
              </text>
            );
          })}
          {[...items].sort((x, y) => (x.ref === hover ? 1 : y.ref === hover ? -1 : 0)).map((it) => {
            const p = positions.get(it.ref)!;
            const dim = quad && it.quadrant !== quad;
            const active = hover === it.ref;
            const showLabel = active || quad === it.quadrant || !dense;
            return (
              <g
                key={it.ref}
                transform={`translate(${p.x} ${p.y})`}
                data-type={it.type}
                style={{ opacity: dim ? 0.2 : 1, transition: "opacity 160ms" }}
                onPointerEnter={() => setHover(it.ref)}
                onPointerLeave={() => setHover(null)}
              >
                <Link href={it.href} aria-label={`${it.name} — ${RING_LABEL[it.ring]}`}>
                  <circle r={active ? 9 : 7} fill="var(--type)" stroke="var(--bg)" strokeWidth={2} style={{ cursor: "pointer" }} />
                  {it.moved === "new" && <circle r={11} fill="none" stroke="var(--type)" strokeOpacity={0.5} />}
                  {showLabel && (
                  <text
                    y={p.below ? 17 : -11}
                    textAnchor="middle"
                    style={{ fontSize: active ? 11.5 : 9.5, fontWeight: active ? 600 : 500, pointerEvents: "none" }}
                    fill={active ? "var(--fg)" : "var(--fg-muted)"}
                    stroke="var(--bg)"
                    strokeWidth={3.5}
                    paintOrder="stroke"
                  >
                    {it.name.length > 17 && !active ? `${it.name.slice(0, 16)}…` : it.name}
                  </text>
                  )}
                </Link>
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div className="pointer-events-none absolute left-1/2 top-2 w-72 -translate-x-1/2 rounded-md border border-border bg-surface p-3 text-xs shadow-md" role="tooltip">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-fg">{hovered.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                {RING_LABEL[hovered.ring]} · {TYPE_LABEL[hovered.type]}
              </span>
            </div>
            <p className="mt-1 text-fg-muted">{hovered.note}</p>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        {dense && (
          <p className="text-xs text-fg-faint">
            {items.length} entries is too many to label at once. Pick a quadrant to label it, hover any dot for its reasoning, or read the full list
            below.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button onClick={() => setQuad(null)} className={`rounded-md border px-2 py-1 ${quad === null ? "border-accent bg-accent-soft" : "border-border text-fg-muted"}`}>
            All
          </button>
          {QUADRANTS.map((q) => (
            <button key={q} onClick={() => setQuad(q)} className={`rounded-md border px-2 py-1 ${quad === q ? "border-accent bg-accent-soft" : "border-border text-fg-muted hover:text-fg"}`}>
              {QUADRANT_LABEL[q]}
            </button>
          ))}
        </div>
        {RINGS.map((ring) => {
          const list = visible.filter((i) => i.ring === ring);
          if (list.length === 0) return null;
          return (
            <div key={ring}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">{RING_LABEL[ring]}</span>
                <span className="text-[11px] text-fg-faint">{list.length}</span>
              </div>
              <p className="mb-2 text-xs text-fg-faint">{RING_BLURB[ring]}</p>
              <ul className="space-y-1">
                {list.map((it) => (
                  <li key={it.ref}>
                    <Link href={it.href} data-type={it.type} className="group flex items-baseline gap-2 text-sm" onPointerEnter={() => setHover(it.ref)} onPointerLeave={() => setHover(null)}>
                      <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                      <span className="font-medium text-fg group-hover:underline">{it.name}</span>
                      <span className="truncate text-xs text-fg-faint">{it.note}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </aside>
    </div>
  );
}
