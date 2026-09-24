import type { Metadata } from "next";
import { getChallenges } from "@/lib/content/graph";
import { buildRefMap } from "@/lib/content/refs";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { ChallengeCard } from "@/components/home/ChallengeCard";

export const metadata: Metadata = pageMetadata({
  title: "Design Challenges",
  description: "Short system-design questions with the reasoning behind every option — right and wrong. A new one is featured on the home page each day.",
  path: "/challenge",
});

const LEVEL: Record<number, string> = { 1: "Warm-up", 2: "Foundations", 3: "Working knowledge", 4: "Seasoned", 5: "Expert" };

export default function Page() {
  // Easiest first: a reader arriving here without a question in mind should
  // meet one they can answer before one that assumes three other pages.
  const challenges = [...getChallenges()].sort((a, b) => a.difficulty - b.difficulty || a.title.localeCompare(b.title));
  const levels = [...new Set(challenges.map((c) => c.difficulty))];
  const refs = buildRefMap(
    challenges.flatMap((c) => [...c.related, ...c.options.map((o) => o.ref).filter((r): r is string => !!r)]),
  );
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Challenges", path: "#" }]} />
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          Design challenges
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Pick an answer, then read why each option does or does not fit. Every option links back into the graph. Your answers stay in this browser.
        </p>
      </header>
      {/* Twenty-seven cards are twenty-two screens on a phone; the list lets a
          reader pick the one they came for, or the one they have not done. */}
      <nav aria-label="All challenges" className="mb-10 rounded-xl border border-border bg-surface p-5">
        <div className="space-y-5">
          {levels.map((l) => (
            <div key={l}>
              <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">
                {LEVEL[l] ?? `Difficulty ${l}`} · {l}/5
              </div>
              <ul className="gap-x-8 text-sm sm:columns-2">
                {challenges
                  .filter((c) => c.difficulty === l)
                  .map((c) => (
                    <li key={c.id} className="break-inside-avoid">
                      <a href={`#${c.id}`} className="block py-0.5 text-fg-muted hover:text-fg hover:underline">
                        {c.title}
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <div className="space-y-6">
        {challenges.map((c) => (
          <ChallengeCard key={c.id} challenge={c} refs={refs} />
        ))}
      </div>
    </div>
  );
}
