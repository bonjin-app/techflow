import Link from "next/link";
import type { AnyNode } from "@/lib/content/types";
import { TYPE_LABEL, TYPE_ROUTE } from "@/lib/content/types";
import { Difficulty, TypeBadge } from "@/components/ui/Badge";

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-xs text-fg-faint">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={it.path} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {i === items.length - 1 ? (
              <span aria-current="page" className="text-fg-muted">
                {it.name}
              </span>
            ) : (
              <Link href={it.path} className="hover:text-fg">
                {it.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ node, children }: { node: AnyNode; children?: React.ReactNode }) {
  const meta = node.meta;
  return (
    <header className="mb-8">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: TYPE_LABEL[node.type], path: TYPE_ROUTE[node.type] },
          { name: node.name, path: "#" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={node.type} />
        {node.tags.map((t) => (
          <span key={t} className="text-xs text-fg-faint">
            {t}
          </span>
        ))}
      </div>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl" style={{ letterSpacing: "-0.03em" }}>
        {node.name}
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-fg-muted">{node.tagline}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-muted">
        <Difficulty level={node.difficulty} />
        {meta?.lastReviewed && (
          <span>
            Last reviewed <time dateTime={meta.lastReviewed}>{meta.lastReviewed}</time>
          </span>
        )}
        {meta?.version && <span>{meta.version}</span>}
        {meta?.confidence && (
          <span className="inline-flex items-center gap-1">
            Confidence
            <span
              className={`rounded px-1 font-mono text-[10px] uppercase ${
                meta.confidence === "high" ? "bg-ok/15 text-ok" : meta.confidence === "medium" ? "bg-warn/15 text-warn" : "bg-danger/15 text-danger"
              }`}
            >
              {meta.confidence}
            </span>
          </span>
        )}
        {children}
      </div>
    </header>
  );
}
