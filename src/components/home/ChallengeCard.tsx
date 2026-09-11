"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Challenge } from "@/lib/content/types";
import type { RefMap } from "@/components/md/refs";
import { useLocalRaw } from "@/lib/useLocal";

const KEY = "tf:challenges"; // { [id]: chosenIndex }

function readAnswers(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Multiple-choice design question. Reveals the reasoning behind every option after a pick. */
export function ChallengeCard({ challenge, refs, compact = false }: { challenge: Challenge; refs: RefMap; compact?: boolean }) {
  const raw = useLocalRaw(KEY);
  const answers = useMemo(() => readAnswers(raw), [raw]);
  const chosen = answers[challenge.id];
  const answered = chosen !== undefined;

  const pick = (i: number) => {
    try {
      const next = { ...readAnswers(localStorage.getItem(KEY)), [challenge.id]: i };
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("tf:storage", { detail: { key: KEY } }));
    } catch {
      /* ignore */
    }
  };

  return (
    // The id makes a challenge deep-linkable: node pages link to the one that
    // exercises them, and the header offset keeps it clear of the sticky nav.
    <div id={challenge.id} className="scroll-mt-24 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-system-design">Design challenge</span>
        <span className="text-[11px] text-fg-faint">difficulty {challenge.difficulty}/5</span>
      </div>
      <h3 className="mt-2 text-lg font-semibold tracking-tight">{challenge.question}</h3>
      {!compact && <p className="mt-2 text-sm text-fg-muted">{challenge.context}</p>}
      <ol className="mt-4 space-y-2">
        {challenge.options.map((o, i) => {
          const isChosen = chosen === i;
          const state = !answered ? "idle" : o.correct ? "correct" : isChosen ? "wrong" : "muted";
          return (
            <li key={i}>
              <button
                type="button"
                disabled={answered}
                onClick={() => pick(i)}
                aria-pressed={isChosen}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  state === "idle"
                    ? "border-border hover:border-accent hover:bg-accent-soft"
                    : state === "correct"
                      ? "border-ok bg-ok/10"
                      : state === "wrong"
                        ? "border-danger bg-danger/10"
                        : "border-border opacity-70"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-px font-mono text-[11px] text-fg-faint">{String.fromCharCode(65 + i)}</span>
                  <span className="flex-1">
                    <span className="font-medium">{o.label}</span>
                    {answered && (
                      <span className="mt-1 block text-xs text-fg-muted">
                        {o.correct ? "✓ " : isChosen ? "✗ " : ""}
                        {o.why}
                        {o.ref && refs[o.ref] && (
                          <>
                            {" "}
                            <Link href={refs[o.ref].href} className="text-accent hover:underline">
                              {refs[o.ref].name} →
                            </Link>
                          </>
                        )}
                      </span>
                    )}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
      {answered && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className={chosen !== undefined && challenge.options[chosen]?.correct ? "font-semibold text-ok" : "font-semibold text-danger"}>
            {chosen !== undefined && challenge.options[chosen]?.correct ? "Correct." : "Not quite — see why above."}
          </span>
          <span className="text-fg-faint">Go deeper:</span>
          {challenge.related.map((id) =>
            refs[id] ? (
              <Link key={id} href={refs[id].href} data-type={refs[id].type} className="rounded border border-border px-1.5 py-0.5 text-fg-muted hover:text-fg">
                {refs[id].name}
              </Link>
            ) : null,
          )}
          <button
            type="button"
            onClick={() => {
              try {
                const next = readAnswers(localStorage.getItem(KEY));
                delete next[challenge.id];
                localStorage.setItem(KEY, JSON.stringify(next));
                window.dispatchEvent(new CustomEvent("tf:storage", { detail: { key: KEY } }));
              } catch {
                /* ignore */
              }
            }}
            className="ml-auto text-fg-faint hover:text-fg"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
