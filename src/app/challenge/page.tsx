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

export default function Page() {
  const challenges = getChallenges();
  const refs = buildRefMap();
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
      <div className="space-y-6">
        {challenges.map((c) => (
          <ChallengeCard key={c.id} challenge={c} refs={refs} />
        ))}
      </div>
    </div>
  );
}
