import Link from "next/link";
import { TYPE_LABEL, type NodeType } from "@/lib/content/types";
import { anchorFor } from "@/lib/anchor";

export function TypeBadge({ type, size = "sm" }: { type: NodeType; size?: "xs" | "sm" }) {
  return (
    <span
      data-type={type}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface font-medium text-fg-muted ${
        size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      <span className="size-1.5 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
      {TYPE_LABEL[type]}
    </span>
  );
}

export function Chip({
  children,
  href,
  type,
  active,
}: {
  children: React.ReactNode;
  href?: string;
  type?: NodeType;
  active?: boolean;
}) {
  const cls = `inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
    active
      ? "border-accent/50 bg-accent-soft text-fg"
      : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg"
  }`;
  const dot = type ? (
    <span data-type={type} className="inline-block size-1.5 rounded-full" style={{ background: "var(--type)" }} aria-hidden />
  ) : null;
  if (href)
    return (
      <Link href={href} className={cls}>
        {dot}
        {children}
      </Link>
    );
  return (
    <span className={cls}>
      {dot}
      {children}
    </span>
  );
}

const LEVELS = ["", "Beginner", "Easy", "Intermediate", "Advanced", "Expert"];

export function Difficulty({ level, showLabel = true }: { level: number; showLabel?: boolean }) {
  const n = Math.min(5, Math.max(1, Math.round(level)));
  return (
    <span className="inline-flex items-center gap-2 text-xs text-fg-muted" title={`Difficulty ${n}/5`}>
      <span className="inline-flex gap-0.5" aria-label={`Difficulty ${n} of 5`} role="img">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 w-1 rounded-sm ${i < n ? "bg-fg" : "bg-border-strong"}`}
            aria-hidden
          />
        ))}
      </span>
      {showLabel && <span>{LEVELS[n]}</span>}
    </span>
  );
}

/**
 * A heading's text, made into a link to itself — so the way to share "the
 * trade-offs part" is to click the heading and copy the address, as on most
 * documentation sites. The `#` is decoration; the accessible name stays the
 * heading's own words.
 */
export function SelfLink({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  return (
    <a href={`#${anchor}`} className="group/self hover:underline hover:decoration-border-strong hover:underline-offset-4">
      {children}
      <span aria-hidden className="ml-1.5 text-fg-faint opacity-0 transition-opacity group-hover/self:opacity-100 group-focus-visible/self:opacity-100">
        #
      </span>
    </a>
  );
}

export function SectionHeading({
  id,
  anchor,
  eyebrow,
  title,
  children,
}: {
  /** The heading's own id; derived from the title when not given. */
  id?: string;
  /** Where the heading links to, when an enclosing section owns the fragment. */
  anchor?: string;
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  const own = id ?? anchorFor(title);
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-fg-faint">{eyebrow}</div>
        )}
        <h2 id={own} className="scroll-mt-20 text-lg font-semibold tracking-tight text-fg">
          <SelfLink anchor={anchor ?? own}>{title}</SelfLink>
        </h2>
      </div>
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd>{children}</kbd>;
}
