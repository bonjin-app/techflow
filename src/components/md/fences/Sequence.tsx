"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SequenceData } from "@/lib/fences";
import type { RefMap } from "../refs";

const COL_W = 150;
const LEFT = 30;
const TOP = 46;
const ROW_H = 40;
const STEP_MS = 650;

/**
 * Animated sequence diagram. Messages appear one by one when the figure
 * scrolls into view; ▶ replays. Fully rendered (no animation) for
 * reduced-motion users and without JS.
 */
export function Sequence({ data, refs }: { data: SequenceData; refs: RefMap }) {
  const n = data.participants.length;
  const width = LEFT * 2 + COL_W * Math.max(1, n - 1) + 80;
  const height = TOP + ROW_H * data.messages.length + 30;
  const [shown, setShown] = useState(data.messages.length);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const played = useRef(false);

  const play = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(data.messages.length);
      return;
    }
    setShown(0);
    setPlaying(true);
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setShown(i);
      if (i >= data.messages.length) {
        window.clearInterval(id);
        setPlaying(false);
      }
    }, STEP_MS);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || played.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !played.current) {
          played.current = true;
          play();
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const x = (i: number) => LEFT + 40 + i * COL_W;

  const a11y = data.messages
    .map((m) => `${data.participants[m.from]?.label} ${m.reply ? "replies to" : "sends to"} ${data.participants[m.to]?.label}: ${m.text}`)
    .join(". ");

  return (
    <figure ref={ref} className="not-prose my-5 rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <figcaption className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">
          {data.title ?? "Sequence"}
        </figcaption>
        <button
          type="button"
          onClick={play}
          disabled={playing}
          className="inline-flex h-6 items-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-fg-muted hover:text-fg disabled:opacity-50"
          aria-label="Replay animation"
        >
          <span aria-hidden>▶</span> {playing ? "Playing" : "Replay"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="block max-w-none text-fg"
          role="img"
          aria-label={a11y}
        >
          {/* lifelines */}
          {data.participants.map((p, i) => {
            const r = p.ref ? refs[p.ref] : undefined;
            const cx = x(i);
            const label = (
              <text x={cx} y={22} textAnchor="middle" className="fill-current text-[12px] font-semibold">
                {r?.name ?? p.label}
              </text>
            );
            return (
              <g key={i}>
                <line x1={cx} x2={cx} y1={TOP - 12} y2={height - 14} stroke="var(--border)" strokeDasharray="3 4" />
                <rect
                  x={cx - 56}
                  y={6}
                  width={112}
                  height={26}
                  rx={6}
                  fill="var(--surface-2)"
                  stroke={r ? `var(--c-${r.type})` : "var(--border-strong)"}
                  strokeWidth={r ? 1.25 : 1}
                />
                {r ? (
                  <Link href={r.href}>
                    <g className="cursor-pointer hover:opacity-80">{label}</g>
                  </Link>
                ) : (
                  label
                )}
              </g>
            );
          })}
          {/* messages */}
          {data.messages.map((m, i) => {
            const y = TOP + i * ROW_H + 14;
            const x1 = x(m.from);
            const x2 = x(m.to);
            const dir = x2 >= x1 ? 1 : -1;
            const visible = i < shown;
            const self = m.from === m.to;
            const midX = self ? x1 + 50 : (x1 + x2) / 2;
            const isMiss = /miss|fail|error|timeout|reject|✗|❌/i.test(m.text);
            const isHit = /\bhit\b|ok\b|200|success|commit/i.test(m.text);
            const stroke = isMiss ? "var(--danger)" : isHit ? "var(--ok)" : "var(--fg-muted)";
            return (
              <g
                key={i}
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "none" : "translateY(4px)",
                  transition: "opacity 260ms ease, transform 260ms ease",
                }}
              >
                {self ? (
                  <path
                    d={`M${x1} ${y} h40 v14 h-36`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.5}
                    markerEnd="url(#seq-arrow)"
                  />
                ) : (
                  <line
                    x1={x1}
                    x2={x2 - dir * 8}
                    y1={y}
                    y2={y}
                    stroke={stroke}
                    strokeWidth={1.5}
                    strokeDasharray={m.reply ? "5 4" : undefined}
                    markerEnd="url(#seq-arrow)"
                    data-visible={visible}
                  />
                )}
                <text
                  x={midX}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-current font-mono text-[11px]"
                  style={{ fill: isMiss ? "var(--danger)" : isHit ? "var(--ok)" : "var(--fg)" }}
                >
                  {m.text}
                </text>
              </g>
            );
          })}
          <defs>
            <marker id="seq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" fill="var(--fg-muted)" />
            </marker>
          </defs>
        </svg>
      </div>
    </figure>
  );
}
