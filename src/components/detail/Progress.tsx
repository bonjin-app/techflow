"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGraphApi, type ApiNode } from "@/lib/useGraphApi";
import { useLocalRaw } from "@/lib/useLocal";
import { KEYS, getStreak, setKnown } from "@/lib/local";
import { TYPE_LABEL } from "@/lib/content/types";
import { coverage, frontier } from "@/lib/path";

const CHALLENGE_KEY = "tf:challenges";

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function Row({ node, onKnown, note }: { node: ApiNode; onKnown?: () => void; note?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
      {onKnown && (
        <input type="checkbox" checked={false} onChange={onKnown} aria-label={`I already know ${node.name}`} className="accent-[var(--accent)]" />
      )}
      <Link href={node.href} data-type={node.type} className="group min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
          <span className="text-sm font-medium text-fg group-hover:underline">{node.name}</span>
          <span className="truncate text-xs text-fg-faint">{note ?? node.tagline}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Everything this browser remembers, and the one thing it can work out that the
 * reader cannot: which pages are now readable because their prerequisites are
 * ticked, and which single page is standing in front of several others.
 */
export function Progress() {
  const { graph, loading } = useGraphApi();
  const knownRaw = useLocalRaw(KEYS.known);
  const recentRaw = useLocalRaw(KEYS.recent);
  const challengeRaw = useLocalRaw(CHALLENGE_KEY);
  const [cleared, setCleared] = useState(false);

  const known = useMemo(() => new Set(parse<string[]>(knownRaw, [])), [knownRaw]);
  const recent = useMemo(() => parse<{ id: string; at: number }[]>(recentRaw, []), [recentRaw]);
  const answers = useMemo(() => parse<Record<string, number>>(challengeRaw, {}), [challengeRaw]);
  const streak = knownRaw === undefined ? { current: 0, days: [] } : getStreak();

  const next = useMemo(() => (graph ? frontier(graph, known) : { ready: [], nearly: [] }), [graph, known]);
  const cover = useMemo(() => (graph ? coverage(graph, known) : []), [graph, known]);

  if (loading || !graph) return <div className="rounded-xl border border-border bg-surface p-8 text-sm text-fg-faint">loading the graph…</div>;

  const total = cover.reduce((a, c) => a + c.total, 0);
  const totalKnown = cover.reduce((a, c) => a + c.known, 0);

  if (totalKnown === 0 && recent.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-fg-muted">
        <p className="text-fg">Nothing recorded in this browser yet.</p>
        <p className="mt-2">
          Tick “I know this” on any page, or in a{" "}
          <Link href="/roadmap" className="text-accent hover:underline">
            roadmap
          </Link>
          , and this page starts working out what you can read next. Nothing leaves your browser and there is no account — clearing site data clears
          this.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Pages ticked", value: `${totalKnown}`, sub: `of ${total}` },
          { label: "Day streak", value: `${streak.current}`, sub: streak.current === 1 ? "day" : "days" },
          { label: "Challenges answered", value: `${Object.keys(answers).length}`, sub: "design questions" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-surface p-4">
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">{s.label}</div>
            <div className="mt-1 font-mono text-2xl tabular-nums">
              {s.value} <span className="text-sm text-fg-faint">{s.sub}</span>
            </div>
          </div>
        ))}
      </section>

      {next.ready.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Ready to read</h2>
          <p className="mb-3 text-sm text-fg-muted">Everything these depend on is already ticked, so nothing is standing in the way.</p>
          <ul className="space-y-1.5">
            {next.ready.slice(0, 8).map((id) => {
              const node = graph.nodes.get(id);
              return node ? <Row key={id} node={node} onKnown={() => setKnown(id, true)} /> : null;
            })}
          </ul>
        </section>
      )}

      {next.nearly.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">One page away</h2>
          <p className="mb-3 text-sm text-fg-muted">
            Each of these needs exactly one more thing.{" "}
            {(() => {
              // The useful reading is not the list but its most common blocker:
              // one page that several others are waiting on is the next thing to read.
              const counts = new Map<string, number>();
              for (const n of next.nearly) counts.set(n.missing, (counts.get(n.missing) ?? 0) + 1);
              const [topId, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
              const top = topId ? graph.nodes.get(topId) : undefined;
              if (!top || (count ?? 0) < 2) return "The page named after it is often worth reading for that reason alone.";
              return (
                <>
                  <Link href={top.href} className="text-accent hover:underline">
                    {top.name}
                  </Link>{" "}
                  alone would open {count} of them.
                </>
              );
            })()}
          </p>
          <ul className="space-y-1.5">
            {next.nearly.slice(0, 8).map(({ id, missing }) => {
              const node = graph.nodes.get(id);
              const gap = graph.nodes.get(missing);
              return node ? <Row key={id} node={node} note={gap ? `needs ${gap.name} first` : undefined} /> : null;
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Coverage</h2>
        <ul className="space-y-2">
          {cover.map((c) => (
            <li key={c.type} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 text-fg-muted">{TYPE_LABEL[c.type as keyof typeof TYPE_LABEL] ?? c.type}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${c.total ? Math.round((c.known / c.total) * 100) : 0}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-fg-faint">
                {c.known}/{c.total}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Recently viewed</h2>
          <ul className="space-y-1.5">
            {recent.slice(0, 8).map((r) => {
              const node = graph.nodes.get(r.id);
              return node ? <Row key={r.id} node={node} /> : null;
            })}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-border bg-surface p-5 text-sm text-fg-muted">
        <h2 className="mb-2 text-sm font-semibold text-fg">This is only in this browser</h2>
        <p>
          There is no account and no server: ticks, streak, recently viewed and challenge answers live in <code className="font-mono text-xs">localStorage</code>{" "}
          and never leave the device. They will not follow you to another browser, and clearing site data clears them.
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              for (const k of [KEYS.known, KEYS.recent, KEYS.streak, CHALLENGE_KEY]) window.localStorage.removeItem(k);
              window.dispatchEvent(new CustomEvent("tf:storage", { detail: { key: KEYS.known } }));
              setCleared(true);
            } catch {
              /* private mode — nothing to clear */
            }
          }}
          className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-danger hover:text-danger"
        >
          {cleared ? "Cleared" : "Forget everything"}
        </button>
      </section>
    </div>
  );
}
