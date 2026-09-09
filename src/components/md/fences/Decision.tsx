"use client";

import Link from "next/link";
import { useState } from "react";
import type { DecisionNode } from "@/lib/fences";
import type { RefMap } from "../refs";

/**
 * Interactive decision tree. Answer a question → the next one unfolds.
 * The full tree is also present in the DOM (collapsed) so it is crawlable.
 */
export function Decision({ data, refs }: { data: { title?: string; root: DecisionNode | null }; refs: RefMap }) {
  const [path, setPath] = useState<number[]>([]);
  if (!data.root) return null;

  // Walk the chosen path
  const trail: { node: DecisionNode; chosen?: number }[] = [];
  let cur: DecisionNode | undefined = data.root;
  for (let depth = 0; cur; depth++) {
    const chosen = path[depth];
    trail.push({ node: cur, chosen });
    if (cur.kind === "question" && chosen !== undefined && cur.answers?.[chosen]) cur = cur.answers[chosen].next;
    else cur = undefined;
  }

  return (
    <figure className="not-prose my-5 rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <figcaption className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">{data.title ?? "Decision"}</figcaption>
        {path.length > 0 && (
          <button type="button" onClick={() => setPath([])} className="text-[11px] font-medium text-fg-muted hover:text-fg">
            Start over
          </button>
        )}
      </div>
      <ol className="p-4">
        {trail.map((t, depth) => {
          const { node, chosen } = t;
          if (node.kind === "leaf") {
            const r = node.ref ? refs[node.ref] : undefined;
            return (
              <li key={depth} className="animate-fade-up">
                <div
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
                  style={{ borderColor: r ? `var(--c-${r.type})` : "var(--border-strong)", background: "var(--surface-2)" }}
                >
                  <span aria-hidden>→</span>
                  {r ? (
                    <Link href={r.href} className="hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    node.text
                  )}
                </div>
              </li>
            );
          }
          return (
            <li key={depth} className={`animate-fade-up ${depth > 0 ? "mt-3" : ""}`}>
              <div className="text-sm font-medium text-fg">{node.text}</div>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={node.text}>
                {node.answers?.map((a, i) => {
                  const active = chosen === i;
                  const dimmed = chosen !== undefined && !active;
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPath([...path.slice(0, depth), i])}
                      className={`rounded-md border px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                        active
                          ? "border-accent bg-accent-soft text-fg"
                          : dimmed
                            ? "border-border text-fg-faint hover:text-fg"
                            : "border-border-strong text-fg hover:border-accent"
                      }`}
                    >
                      {a.label}
                      {a.next.kind === "leaf" && <span className="ml-2 font-sans font-normal text-fg-muted">{a.next.text}</span>}
                    </button>
                  );
                })}
              </div>
              {depth < trail.length - 1 && <div className="ml-3 mt-2 h-3 border-l border-border" aria-hidden />}
            </li>
          );
        })}
      </ol>
      <details className="border-t border-border px-4 py-2 text-xs text-fg-faint">
        <summary className="cursor-pointer">Full tree (text)</summary>
        <TreeText node={data.root} depth={0} />
      </details>
    </figure>
  );
}

function TreeText({ node, depth }: { node: DecisionNode; depth: number }) {
  if (node.kind === "leaf") return <div style={{ paddingLeft: depth * 12 }}>→ {node.text}</div>;
  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <div>? {node.text}</div>
      {node.answers?.map((a, i) => (
        <div key={i} style={{ paddingLeft: 12 }}>
          <span className="font-mono">{a.label}</span>
          <TreeText node={a.next} depth={1} />
        </div>
      ))}
    </div>
  );
}
