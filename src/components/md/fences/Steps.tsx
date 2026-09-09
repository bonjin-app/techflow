import Link from "next/link";
import type { StepsData } from "@/lib/fences";
import type { RefMap } from "../refs";

/** Vertical chain of steps — prerequisites, request paths, learning order. */
export function Steps({ data, refs }: { data: StepsData; refs: RefMap }) {
  return (
    <figure className="not-prose my-5 rounded-lg border border-border bg-surface p-4">
      {data.title && (
        <figcaption className="mb-3 font-mono text-[11px] uppercase tracking-wider text-fg-faint">{data.title}</figcaption>
      )}
      <ol className="relative ml-2 border-l border-border">
        {data.steps.map((s, i) => {
          const ref = s.ref ? refs[s.ref] : undefined;
          const body = (
            <span className="text-sm font-medium text-fg">{ref?.name ?? s.label}</span>
          );
          return (
            <li key={i} className="relative pb-3 pl-5 last:pb-0">
              <span
                className="absolute -left-[5px] top-[7px] size-2.5 rounded-full border-2 border-bg"
                style={{ background: ref ? `var(--c-${ref.type})` : "var(--border-strong)" }}
                aria-hidden
                data-type={ref?.type}
              />
              <div className="flex flex-wrap items-baseline gap-x-2">
                {ref ? (
                  <Link href={ref.href} className="rounded hover:underline" data-type={ref.type}>
                    {body}
                  </Link>
                ) : (
                  body
                )}
                {s.note && <span className="text-xs text-fg-muted">{s.note}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
