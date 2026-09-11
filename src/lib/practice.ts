import { getBuilds, getChallenges, getStacks } from "@/lib/content/graph";
import { PLAYGROUNDS } from "@/app/playground/registry";

export interface PracticeLink {
  href: string;
  label: string;
  note: string;
}

export interface Practice {
  playgrounds: PracticeLink[];
  challenges: PracticeLink[];
  stacks: PracticeLink[];
  builds: PracticeLink[];
}

/** "/concept/cache" → "cache" */
function idOf(href: string) {
  return href.split("/").filter(Boolean).pop() ?? "";
}

/** A widely-used node appears in most stacks and builds; five is enough to make the point. */
const MAX_PER_GROUP = 5;

/**
 * The interactive half of the site — playgrounds, design challenges, real-world
 * stacks, build goals — all point *at* nodes. Nothing pointed back, so a reader
 * on the Cache page had no way to know a cache simulator existed. This walks the
 * relationship the other way.
 */
export function getPractice(id: string): Practice {
  const playgrounds = PLAYGROUNDS.filter((p) => p.concepts.some((c) => idOf(c.href) === id)).map((p) => ({
    href: `/playground/${p.slug}`,
    label: p.title,
    note: p.blurb,
  }));

  const challenges = getChallenges()
    .filter((c) => c.related.includes(id) || c.options.some((o) => o.ref === id))
    .map((c) => ({
      href: `/challenge#${c.id}`,
      label: c.question.length > 96 ? `${c.question.slice(0, 95).trimEnd()}…` : c.question,
      note: `${c.options.length} options · difficulty ${c.difficulty}/5`,
    }));

  // A stack names a node either as a layer item or as somewhere to go next.
  const stacks = getStacks()
    .filter((s) => s.layers.some((l) => l.items.some((it) => it.ref === id)) || s.related.includes(id))
    .map((s) => ({ href: `/stack/${s.id}`, label: s.name, note: s.tagline }));

  const builds = getBuilds()
    .filter(
      (b) =>
        b.architecture === id ||
        b.systemDesign === id ||
        [...b.technologies, ...b.concepts, ...b.patterns].includes(id),
    )
    .map((b) => ({ href: `/build/${b.id}`, label: b.name, note: b.tagline }));

  return {
    playgrounds: playgrounds.slice(0, MAX_PER_GROUP),
    challenges: challenges.slice(0, MAX_PER_GROUP),
    stacks: stacks.slice(0, MAX_PER_GROUP),
    builds: builds.slice(0, MAX_PER_GROUP),
  };
}

export function hasPractice(p: Practice) {
  return p.playgrounds.length + p.challenges.length + p.stacks.length + p.builds.length > 0;
}
