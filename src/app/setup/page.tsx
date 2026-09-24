import type { Metadata } from "next";
import Link from "next/link";
import { getNode, getSetups } from "@/lib/content/graph";
import { ENVIRONMENT_LABEL, type SetupEnvironment } from "@/lib/content/types";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";

export const metadata: Metadata = pageMetadata({
  title: "Setup Guides: Stacks That Work Together",
  description:
    "How to stand up a specific combination — Redis with PostgreSQL, Nginx in front of Node.js — in a specific environment, with versions, the files to write, how to check it works and what changes in production.",
  path: "/setup",
});

const ENV_ORDER: SetupEnvironment[] = ["local", "vm", "managed", "kubernetes", "serverless"];

export default function Page() {
  const setups = getSetups();
  const groups = ENV_ORDER.map((env) => ({ env, items: setups.filter((s) => s.environment === env) })).filter((g) => g.items.length > 0);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Setup guides", path: "#" }]} />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          Setup guides
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Which technologies go together, in which environment, and how to stand them up: the versions, the files to write, how to check it
          works, what changes in production — and when the combination is the wrong one. Each guide cites the projects&apos; own documentation.
        </p>
      </header>
      <div className="space-y-10">
        {groups.map((g) => (
          <section key={g.env}>
            <h2 id={g.env} className="mb-3 font-mono text-[11px] uppercase tracking-wider text-fg-faint">
              {ENVIRONMENT_LABEL[g.env]}
            </h2>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
              {g.items.map((s) => (
                <Link key={s.id} href={`/setup/${s.id}`} data-type="setup" className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
                  <div className="text-lg font-semibold group-hover:underline">{s.name}</div>
                  <p className="mt-1 text-sm text-fg-muted">{s.tagline}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    {s.components.map((c) => (
                      <span key={c.ref} className="rounded border border-border px-1.5 py-0.5 text-fg-muted">
                        {getNode(c.ref)?.name ?? c.ref} <span className="font-mono text-fg-faint">{c.version}</span>
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
