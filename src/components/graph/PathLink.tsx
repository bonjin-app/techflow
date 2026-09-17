import Link from "next/link";

/**
 * "Where does this sit?" — the third way to read a neighbourhood, beside the
 * force graph and the mind map. Both of those show what is adjacent; this one
 * answers a question about two specific things.
 */
export function PathLink({ id, name, className = "" }: { id: string; name: string; className?: string }) {
  return (
    <Link
      href={`/path?from=${id}`}
      className={`group inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-accent ${className}`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
        <circle cx="5" cy="19" r="2.2" fill="currentColor" />
        <circle cx="19" cy="5" r="2.2" fill="currentColor" opacity=".75" />
        <path d="M5 19c0-5 3-6 7-7s7-2 7-7" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.5 2.5" opacity=".7" />
      </svg>
      Find a path from {name} to anything
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}
