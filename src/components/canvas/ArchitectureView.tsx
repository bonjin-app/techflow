import Link from "next/link";
import type { ArchitectureNode } from "@/lib/content/types";
import { buildRefMap, collectArchRefs } from "@/lib/content/refs";
import { ArchitectureCanvas } from "./ArchitectureCanvas";

/** Server wrapper: resolves knowledge-graph refs and renders the interactive canvas + ADRs. */
export function ArchitectureView({ arch, compact = false }: { arch: ArchitectureNode; compact?: boolean }) {
  const ids = collectArchRefs(arch.nodes, arch.decisions.flatMap((d) => d.alternatives));
  const refs = buildRefMap(ids);
  return (
    <ArchitectureCanvas
      nodes={arch.nodes}
      edges={arch.edges}
      flows={arch.flows}
      versions={arch.versions}
      decisions={arch.decisions}
      refs={refs}
      textAlternative={arch.textAlternative}
      compact={compact}
    />
  );
}

export function DecisionRecords({ decisions }: { decisions: ArchitectureNode["decisions"] }) {
  const refs = buildRefMap(decisions.flatMap((d) => d.alternatives));
  if (decisions.length === 0) return null;
  return (
    <ol className="grid gap-4 md:grid-cols-2">
      {decisions.map((d, i) => (
        <li key={i} className="rounded-lg border border-border bg-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Decision {i + 1}</div>
          <h3 className="mt-1 text-base font-semibold">{d.decision}</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Why</dt>
              <dd className="text-fg">{d.why}</dd>
            </div>
            {d.alternatives.length > 0 && (
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Alternatives</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {d.alternatives.map((a) =>
                    refs[a] ? (
                      <Link key={a} href={refs[a].href} className="rounded border border-border px-1.5 py-0.5 text-xs text-fg-muted hover:text-fg">
                        {refs[a].name}
                      </Link>
                    ) : (
                      <span key={a} className="rounded border border-border px-1.5 py-0.5 text-xs text-fg-muted">
                        {a}
                      </span>
                    ),
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-warn">Trade-off</dt>
              <dd className="text-fg-muted">{d.tradeoff}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
