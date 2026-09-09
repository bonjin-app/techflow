import Link from "next/link";
import type { CompareData } from "@/lib/fences";
import type { RefMap } from "../refs";
import { parseRefLabel } from "@/lib/fences";

const YES = /^(yes|✓|✔|rich|strong|high|built-in|native)\b/i;
const NO = /^(no|✗|✕|none|limited|weak|low|manual)\b/i;

function Cell({ value }: { value: string }) {
  let tone = "";
  if (YES.test(value)) tone = "text-ok";
  else if (NO.test(value)) tone = "text-fg-faint";
  return <span className={tone}>{value}</span>;
}

/** Feature matrix — first column is the feature, others are subjects. */
export function Compare({ data, refs }: { data: CompareData; refs: RefMap }) {
  const [first, ...subjects] = data.header;
  return (
    <figure className="not-prose my-5 overflow-x-auto rounded-lg border border-border">
      {data.title && (
        <figcaption className="border-b border-border px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">
          {data.title}
        </figcaption>
      )}
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="bg-surface-2/60">
            <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-fg-faint">{first}</th>
            {subjects.map((s, i) => {
              const rl = parseRefLabel(s);
              const ref = rl.ref ? refs[rl.ref] : undefined;
              return (
                <th key={i} className="px-4 py-2 text-left text-sm font-semibold text-fg">
                  {ref ? (
                    <Link href={ref.href} className="hover:underline">
                      {rl.label}
                    </Link>
                  ) : (
                    rl.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <th scope="row" className="px-4 py-2 text-left font-medium text-fg-muted">
                {r[0]}
              </th>
              {subjects.map((_, j) => (
                <td key={j} className="px-4 py-2 text-fg">
                  <Cell value={r[j + 1] ?? ""} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
