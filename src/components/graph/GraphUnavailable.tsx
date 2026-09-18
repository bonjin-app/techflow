"use client";

/**
 * The graph JSON did not load. Saying "loading…" forever is the wrong answer —
 * these pages are useless without it, so say what happened and offer the one
 * action that can help.
 */
export function GraphUnavailable({ retry }: { retry: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-sm">
      <p className="font-medium text-fg">The knowledge graph did not load.</p>
      <p className="mt-2 max-w-prose text-fg-muted">
        This page reads <code className="font-mono text-xs">/api/graph.json</code> in your browser, so an offline moment, a blocked request or a
        content blocker will stop it. The rest of the site works without it.
      </p>
      <button
        type="button"
        onClick={retry}
        className="mt-4 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-accent hover:text-fg"
      >
        Try again
      </button>
    </div>
  );
}
