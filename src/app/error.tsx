"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * A client component throwing used to leave a blank page. There is no error
 * reporting service here and no server to log to, so the honest thing is to say
 * what happened, offer the two exits that always work, and let the browser
 * console keep the detail.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("TechFlow page error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start px-4 py-20 sm:px-6">
      <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Something broke on this page</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
        This page stopped working.
      </h1>
      <p className="mt-3 text-fg-muted">
        The rest of the site is static and unaffected — this is one page&apos;s interactive part failing. Reloading usually fixes it; if it does not,
        the browser console has the detail.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-fg-faint">digest {error.digest}</p>}
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border px-3 py-1.5 font-medium text-fg-muted transition-colors hover:border-accent hover:text-fg"
        >
          Try again
        </button>
        <Link href="/" className="rounded-md border border-border px-3 py-1.5 font-medium text-fg-muted transition-colors hover:border-accent hover:text-fg">
          Home
        </Link>
        <Link
          href="/explore"
          className="rounded-md border border-border px-3 py-1.5 font-medium text-fg-muted transition-colors hover:border-accent hover:text-fg"
        >
          Explore the graph
        </Link>
      </div>
    </div>
  );
}
