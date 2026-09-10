"use client";

import Link from "next/link";
import type { Intent } from "@/lib/intent";
import { TYPE_LABEL } from "@/lib/content/types";

const KIND_EYEBROW: Record<Intent["kind"], string> = {
  build: "You want to build something",
  why: "You asked why",
  compare: "You are choosing between two things",
  how: "You asked how it works",
  learn: "You want a path through this",
};

/**
 * The answer card above ordinary search results. It says back what it thinks was
 * asked, then hands over the goal, the pages for the things named, and where to
 * go next — the graph's version of an answer rather than a list of matches.
 */
export function IntentAnswer({ intent, query }: { intent: Intent; query: string }) {
  const { goal, mentioned, comparison } = intent;

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-accent/40 bg-accent-soft/40" aria-label="Interpretation of your question">
      <div className="border-b border-accent/25 px-5 py-3">
        <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">{KIND_EYEBROW[intent.kind]}</div>
        <p className="mt-1 text-[15px] font-medium text-fg">{intent.reading}</p>
      </div>

      <div className="space-y-5 px-5 py-4">
        {goal && (
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">Start here</div>
            <Link
              href={`/build/${goal.id}`}
              className="group flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              <span>
                <span className="block text-base font-semibold group-hover:underline">{goal.name}</span>
                <span className="mt-0.5 block text-sm text-fg-muted">{goal.tagline}</span>
                <span className="mt-2 block text-xs text-fg-faint">
                  Recommended architecture → technologies → required concepts → learning path
                </span>
              </span>
              <span className="shrink-0 text-accent" aria-hidden>
                →
              </span>
            </Link>
          </div>
        )}

        {comparison && (
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">Decide with</div>
            <Link
              href={comparison.href}
              className="group flex items-baseline gap-2 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong"
            >
              <span className="text-sm font-semibold group-hover:underline">{comparison.name}</span>
              <span className="text-xs text-fg-muted">{comparison.tagline}</span>
            </Link>
          </div>
        )}

        {mentioned.length > 0 && (
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">
              {goal ? "The pieces you named" : "Pages for what you named"}
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {mentioned.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} data-type={n.type} className="group flex min-w-0 items-baseline gap-2 text-sm">
                    <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                    <span className="shrink-0 whitespace-nowrap font-medium text-fg group-hover:underline">{n.name}</span>
                    <span className="min-w-0 truncate text-xs text-fg-faint">
                      {TYPE_LABEL[n.type]} · {n.tagline}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-fg-faint">
          Matched on {intent.matched.slice(0, 5).map((m) => `“${m}”`).join(", ")}. This is keyword matching against the graph, not a model — if it read
          you wrong, the ranked results for <span className="font-mono">{query.trim()}</span> are below.
        </p>
      </div>
    </section>
  );
}
