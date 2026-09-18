"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { NodeSummary } from "@/lib/content/types";
import { TYPE_LABEL } from "@/lib/content/types";
import { loadTextIndex, searchText, type TextIndex } from "@/lib/fulltext";

/**
 * The second tier of search: pages whose *prose* contains the query. Name
 * matching cannot find "thundering herd" or "coordinated omission", both of
 * which this site explains at length — those pages are simply called something
 * else.
 *
 * The index is 390KB, so it is fetched on the first search and never by the
 * command palette, which has to stay instant.
 */
export function MentionedIn({ query, index, exclude }: { query: string; index: NodeSummary[]; exclude: Set<string> }) {
  // One piece of state, written only from the async callback: setting it
  // synchronously inside the effect would cascade renders.
  const [result, setResult] = useState<{ text: TextIndex | null; status: "loading" | "ready" | "failed" }>({ text: null, status: "loading" });

  const trimmed = query.trim();
  useEffect(() => {
    if (!trimmed || result.text) return;
    let live = true;
    loadTextIndex().then((data) => {
      if (live) setResult({ text: data, status: data ? "ready" : "failed" });
    });
    return () => {
      live = false;
    };
  }, [trimmed, result.text]);

  const text = result.text;
  if (!trimmed) return null;
  if (result.status === "failed") return null; // the ranked results above still stand
  if (!text) return <p className="text-xs text-fg-faint">searching the text of every page…</p>;

  const hits = searchText(text, trimmed, 14).filter((h) => !exclude.has(h.id));
  if (hits.length === 0) return null;

  const byId = new Map(index.map((n) => [n.id, n]));
  return (
    <section>
      <h2 className="mb-1 font-mono text-[11px] uppercase tracking-wider text-fg-faint">Mentioned on these pages</h2>
      <p className="mb-3 text-xs text-fg-muted">
        These are not called “{trimmed}” — the words appear in what they say. Use your browser&apos;s find to jump to them once the page opens.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-bg-subtle/40">
        {hits.map((hit) => {
          const node = byId.get(hit.id);
          if (!node) return null;
          return (
            <li key={hit.id}>
              <Link
                href={node.href}
                data-type={node.type}
                className="group flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2.5 transition-colors hover:bg-surface"
              >
                <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: "var(--type)" }} aria-hidden />
                <span className="text-sm font-medium text-fg group-hover:underline">{node.name}</span>
                <span className="text-[11px] text-fg-faint">{TYPE_LABEL[node.type]}</span>
                <span className="text-xs text-fg-muted">
                  mentions {hit.words.map((w) => `“${w}”`).join(", ")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
