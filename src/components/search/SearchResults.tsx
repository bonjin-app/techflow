"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TYPE_LABEL } from "@/lib/content/types";
import { groupByType, searchNodes } from "@/lib/search";
import { useSearchIndex } from "@/lib/useSearchIndex";
import { NodeGrid } from "@/components/ui/NodeCard";

/** Knowledge-graph search page body: query in the URL, results grouped by type. */
export function SearchResults() {
  const index = useSearchIndex();
  const params = useSearchParams();
  const router = useRouter();
  const fromUrl = params.get("q") ?? "";
  const [q, setQ] = useState(fromUrl);
  const [seenUrl, setSeenUrl] = useState(fromUrl);

  // URL changed underneath us (palette navigation) → adopt it. Adjusting state during render is the React-sanctioned pattern.
  if (fromUrl !== seenUrl) {
    setSeenUrl(fromUrl);
    setQ(fromUrl);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      const url = q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search";
      if (url !== window.location.pathname + window.location.search) router.replace(url, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, router]);

  const hits = useMemo(() => searchNodes(index, q, 60), [index, q]);
  const groups = groupByType(hits);

  return (
    <div>
      <label className="block">
        <span className="sr-only">Search</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the knowledge graph…"
          className="h-14 w-full rounded-xl border border-border bg-surface px-4 text-lg outline-none focus:border-accent"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="mt-2 text-xs text-fg-faint">
        {q.trim() ? `${hits.length} result${hits.length === 1 ? "" : "s"} across ${groups.length} type${groups.length === 1 ? "" : "s"}` : `${index.length} nodes in the graph`}
      </div>
      <div className="mt-8 space-y-10">
        {groups.map((g) => (
          <section key={g.type}>
            <h2 className="mb-3 flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">
              <span data-type={g.type} className="size-2 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
              {TYPE_LABEL[g.type]} <span className="text-fg-faint/70">{g.items.length}</span>
            </h2>
            <NodeGrid nodes={g.items} />
          </section>
        ))}
        {q.trim() && hits.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-fg-muted">
            Nothing matches “{q}”. Try a broader term like <em>cache</em>, <em>queue</em> or <em>consistency</em>.
          </div>
        )}
      </div>
    </div>
  );
}
