import type { TimelineData } from "@/lib/fences";

/** Side-by-side columns over time — race conditions, deadlocks, concurrent actors. */
export function Timeline({ data }: { data: TimelineData }) {
  const cols = data.columns.length || 2;
  return (
    <figure className="not-prose my-5 overflow-x-auto rounded-lg border border-border bg-surface">
      {data.title && (
        <figcaption className="border-b border-border px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">
          {data.title}
        </figcaption>
      )}
      <div
        className="grid min-w-[26rem] font-mono text-[13px]"
        style={{ gridTemplateColumns: `2.25rem repeat(${cols}, minmax(0, 1fr))` }}
        role="table"
      >
        <div className="border-b border-border" aria-hidden />
        {data.columns.map((c, i) => (
          <div key={i} role="columnheader" className="border-b border-border px-3 py-2 text-xs font-semibold text-fg">
            {c}
          </div>
        ))}
        {data.rows.map((r, ri) => (
          <div key={ri} role="row" className="contents">
            <div className="flex items-center justify-center border-t border-border/60 text-[10px] text-fg-faint" aria-hidden>
              t{ri + 1}
            </div>
            {Array.from({ length: cols }, (_, ci) => {
              const v = r[ci] ?? "";
              const bad = /❌|✗|✕|lost|wrong|dead|blocked|wait/i.test(v);
              return (
                <div
                  key={ci}
                  role="cell"
                  className={`border-t border-border/60 px-3 py-1.5 ${v ? (bad ? "text-danger" : "text-fg") : "text-fg-faint"}`}
                >
                  {v ? v : <span className="opacity-40">·</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </figure>
  );
}
