"use client";

import Link from "next/link";
import { useState } from "react";
import type { SystemDesignStep } from "@/lib/content/types";
import type { RefMap } from "@/components/md/refs";
import { ArchitectureCanvas } from "./ArchitectureCanvas";

/**
 * Scale journey: a rail of steps (1,000 → 10,000 → … users). Selecting a
 * step swaps the compact architecture canvas and shows the problem / why / alternatives.
 */
export function StepJourney({ steps, refs }: { steps: SystemDesignStep[]; refs: RefMap }) {
  const [idx, setIdx] = useState(0);
  const step = steps[idx];
  const prev = idx > 0 ? steps[idx - 1] : undefined;
  const added = step.nodes.filter((n) => !prev?.nodes.some((p) => p.id === n.id));

  return (
    <div>
      {/* Rail */}
      <ol className="no-scrollbar mb-6 flex items-stretch gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Design steps">
        {steps.map((s, i) => (
          <li key={i} className="flex shrink-0 items-center gap-2">
            <button
              role="tab"
              aria-selected={i === idx}
              onClick={() => setIdx(i)}
              className={`flex min-w-[9rem] flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors ${
                i === idx ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Step {i + 1}</span>
              <span className="text-sm font-semibold">{s.scale ?? s.title}</span>
              <span className="text-xs text-fg-muted">{s.title}</span>
            </button>
            {i < steps.length - 1 && <span className="text-fg-faint" aria-hidden>→</span>}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div key={idx} className="animate-fade-up">
          <ArchitectureCanvas nodes={step.nodes} edges={step.edges} refs={refs} compact title={`${step.scale ?? ""} · ${step.title}`} />
        </div>
        <aside key={`aside-${idx}`} className="animate-fade-up space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="font-mono text-[10px] uppercase tracking-wider text-danger">What broke</div>
            <p className="mt-1 text-sm text-fg">{step.problem}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="font-mono text-[10px] uppercase tracking-wider text-ok">Why this change</div>
            <p className="mt-1 text-sm text-fg-muted">{step.why}</p>
            {added.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {added.map((n) => {
                  const r = n.ref ? refs[n.ref] : undefined;
                  return r ? (
                    <Link key={n.id} href={r.href} data-type={r.type} className="inline-flex items-center gap-1.5 rounded border border-border px-1.5 py-0.5 text-xs hover:text-fg">
                      <span className="size-1.5 rounded-full" style={{ background: "var(--type)" }} aria-hidden />+ {n.label}
                    </Link>
                  ) : (
                    <span key={n.id} className="rounded border border-border px-1.5 py-0.5 text-xs text-fg-muted">
                      + {n.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          {step.alternatives && step.alternatives.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Alternatives considered</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {step.alternatives.map((a) =>
                  refs[a] ? (
                    <Link key={a} href={refs[a].href} className="rounded border border-border px-1.5 py-0.5 text-xs text-fg-muted hover:text-fg">
                      {refs[a].name}
                    </Link>
                  ) : (
                    <span key={a} className="rounded border border-border px-1.5 py-0.5 text-xs text-fg-muted">
                      {a}
                    </span>
                  ),
                )}
              </div>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <button disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="text-fg-muted hover:text-fg disabled:opacity-30">
              ← Previous
            </button>
            <button disabled={idx === steps.length - 1} onClick={() => setIdx(idx + 1)} className="font-medium text-accent hover:underline disabled:opacity-30">
              Next step →
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
