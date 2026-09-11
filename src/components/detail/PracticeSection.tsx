import Link from "next/link";
import type { Practice } from "@/lib/practice";

const GROUPS: { key: keyof Practice; label: string; hint: string }[] = [
  { key: "playgrounds", label: "Playground", hint: "Change the parameters and watch the result" },
  { key: "challenges", label: "Design challenge", hint: "One question with plausible wrong answers" },
  { key: "stacks", label: "Real-world stacks", hint: "Archetype stacks this appears in" },
  { key: "builds", label: "Build goals", hint: "What you would build with it" },
];

/**
 * The other half of the site, reached from a page rather than from an index.
 * Playgrounds, challenges, stacks and build goals all reference nodes; without
 * this, the reference only worked in one direction.
 */
export function PracticeSection({ practice }: { practice: Practice }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {GROUPS.filter((g) => practice[g.key].length > 0).map((g) => (
        <div key={g.key}>
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">{g.label}</div>
          <ul className="space-y-2">
            {practice[g.key].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="group block rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:border-fg-faint">
                  <span className="block text-sm font-medium text-fg group-hover:text-accent">{l.label}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{l.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
