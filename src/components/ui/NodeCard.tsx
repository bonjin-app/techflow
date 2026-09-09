import Link from "next/link";
import type { NodeSummary } from "@/lib/content/types";
import { TYPE_LABEL } from "@/lib/content/types";
import { Difficulty } from "./Badge";

/** Dense list row for index pages and search results — typography first, no card chrome overload. */
export function NodeCard({ node, showType = false }: { node: NodeSummary; showType?: boolean }) {
  return (
    <Link
      href={node.href}
      data-type={node.type}
      className="group flex items-start gap-3 rounded-lg border border-transparent px-3 py-3 transition-colors hover:border-border hover:bg-surface"
    >
      <span className="mt-2 size-2 shrink-0 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15px] font-semibold text-fg group-hover:underline">{node.name}</span>
          {showType && <span className="text-[11px] text-fg-faint">{TYPE_LABEL[node.type]}</span>}
          <span className="text-[11px] text-fg-faint">{node.category}</span>
        </span>
        <span className="mt-0.5 block text-sm text-fg-muted">{node.tagline}</span>
      </span>
      <span className="hidden shrink-0 flex-col items-end gap-1 text-[11px] text-fg-faint sm:flex">
        <Difficulty level={node.difficulty} showLabel={false} />
        <span>{node.degree} links</span>
      </span>
    </Link>
  );
}

export function NodeGrid({ nodes, showType }: { nodes: NodeSummary[]; showType?: boolean }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-bg-subtle/40">
      {nodes.map((n) => (
        <div key={n.id} className="p-0.5">
          <NodeCard node={n} showType={showType} />
        </div>
      ))}
    </div>
  );
}
