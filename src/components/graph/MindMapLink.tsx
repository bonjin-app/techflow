import Link from "next/link";

/**
 * "Open as a mind map" — the second way to read the same neighbourhood.
 *
 * The force graph answers "what shape is this area of the graph"; the mind map
 * answers "what are its branches, and what hangs off each one". Every page that
 * shows one should offer the other, so this lives in one place rather than as a
 * sentence copied into five templates.
 */
export function MindMapLink({ id, name, className = "" }: { id: string; name: string; className?: string }) {
  return (
    <Link
      href={`/map?focus=${id}`}
      className={`group inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-accent ${className}`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
        <circle cx="4" cy="12" r="2.2" fill="currentColor" />
        <circle cx="20" cy="6" r="1.8" fill="currentColor" opacity=".75" />
        <circle cx="20" cy="18" r="1.8" fill="currentColor" opacity=".75" />
        <path d="M6 12h5m0 0 3-6h4m-7 6 3 6h4" stroke="currentColor" strokeWidth="1.6" opacity=".6" />
      </svg>
      Open {name} as a mind map
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}
