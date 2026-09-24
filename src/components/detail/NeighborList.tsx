import Link from "next/link";
import type { Neighbor } from "@/lib/content/graph";
import { RELATION_LABEL, TYPE_LABEL, type Relation } from "@/lib/content/types";

const ORDER: Relation[] = ["ALTERNATIVE_TO", "USED_WITH", "IMPLEMENTS", "SOLVES", "RELATED_TO", "USED_IN", "REQUIRES", "PART_OF"];

const HEADINGS: Record<Relation, { out: string; in: string }> = {
  ALTERNATIVE_TO: { out: "Alternatives", in: "Alternatives" },
  USED_WITH: { out: "Used with", in: "Used with" },
  RELATED_TO: { out: "Related", in: "Related" },
  USED_IN: { out: "Used in", in: "Uses this" },
  REQUIRES: { out: "Requires", in: "Required by" },
  IMPLEMENTS: { out: "Implements", in: "Implemented by" },
  SOLVES: { out: "Solves", in: "Solved by" },
  PART_OF: { out: "Part of", in: "Includes" },
};

/** Neighbours grouped by relation — the textual twin of the relationship graph. */
export function NeighborList({ neighbors, exclude = [] }: { neighbors: Neighbor[]; exclude?: string[] }) {
  const ex = new Set(exclude);
  const groups = new Map<string, Neighbor[]>();
  // A comparison answers "this or that", and a setup guide "how do I run these
  // together", so each gets its own group ahead of the relations. Filed under
  // Related they competed on degree with every other neighbour and fell past
  // the cut: /concept/rest is the subject of three comparisons and linked to
  // none of them.
  for (const [type, heading] of [["comparison", "Comparisons"], ["setup", "Setup guides"]] as const) {
    const items = neighbors.filter((n) => n.node.type === type && !ex.has(n.node.id));
    if (items.length > 0) groups.set(heading, items);
    for (const n of items) ex.add(n.node.id);
  }
  for (const rel of ORDER) {
    for (const dir of ["out", "in"] as const) {
      const items = neighbors.filter((n) => n.rel === rel && n.direction === dir && !ex.has(n.node.id));
      if (items.length === 0) continue;
      const heading = HEADINGS[rel][dir];
      if (!groups.has(heading)) groups.set(heading, []);
      groups.get(heading)!.push(...items);
    }
  }
  if (groups.size === 0) return null;
  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {[...groups.entries()].map(([heading, items]) => {
        // Hub pages have sixty neighbours under one heading. Ten stay in view;
        // the rest are one click away rather than silently dropped, which is
        // what the cut used to do to 837 links across 80 pages.
        const shown = heading === "Comparisons" || heading === "Setup guides" ? items : items.slice(0, SHOWN);
        const more = items.slice(shown.length);
        return (
          <div key={heading}>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">{heading}</div>
            <ul className="space-y-1">{shown.map(item)}</ul>
            {more.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer py-1 text-xs text-fg-muted hover:text-fg">
                  Show {more.length} more
                </summary>
                <ul className="mt-1 space-y-1">{more.map(item)}</ul>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

const SHOWN = 10;

function item(n: Neighbor) {
  return (
    <li key={n.node.id}>
      <Link
        href={n.node.href}
        data-type={n.node.type}
        className="group flex items-baseline gap-2 rounded-md py-0.5 text-sm"
        title={RELATION_LABEL[n.rel]}
      >
        <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: "var(--type)" }} aria-hidden />
        <span className="font-medium text-fg group-hover:underline">{n.node.name}</span>
        <span className="truncate text-xs text-fg-faint">{TYPE_LABEL[n.node.type]}</span>
      </Link>
    </li>
  );
}
