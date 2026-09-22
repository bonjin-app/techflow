import { describe, expect, it } from "vitest";
import { getPractice, hasPractice } from "@/lib/practice";
import { PLAYGROUNDS } from "@/app/playground/registry";
import { buildGraph, getBuilds, getChallenges, getStacks } from "@/lib/content/graph";

const g = buildGraph();
const ids = [...g.nodes.keys()];

/**
 * The interactive half of the site points *at* pages; this walks the
 * relationship back, so a reader on the Cache page learns a cache simulator
 * exists. It is only as good as the pointing: the JWT decoder never named JWT
 * among its concepts, so the one page most obviously about the thing it decodes
 * was the one page that did not offer it.
 */
describe("what a page offers to practise", () => {
  it("a playground names the page it is about", () => {
    for (const p of PLAYGROUNDS) {
      const node = g.nodes.get(p.slug);
      // A system design may share a slug with a playground ("rate-limiter");
      // that is a design to read, not the subject the playground teaches.
      if (!node || !["concept", "technology", "pattern"].includes(node.type)) continue;
      const named = p.concepts.map((c) => c.href.split("/").filter(Boolean).pop());
      expect(named, `/playground/${p.slug} never names ${p.slug}`).toContain(p.slug);
    }
  });

  it("finds the playground from the page", () => {
    expect(getPractice("jwt").playgrounds.map((p) => p.href)).toContain("/playground/jwt");
    expect(getPractice("cache").playgrounds.map((p) => p.href)).toContain("/playground/cache");
    expect(getPractice("rate-limiting").playgrounds.map((p) => p.href)).toContain("/playground/rate-limiter");
  });

  it("finds a challenge from a page its options point at", () => {
    const challenge = getChallenges().find((c) => c.options.some((o) => o.ref))!;
    const ref = challenge.options.find((o) => o.ref)!.ref!;
    expect(getPractice(ref).challenges.map((c) => c.href)).toContain(`/challenge#${challenge.id}`);
  });

  it("finds a stack from a page in one of its layers", () => {
    const stack = getStacks().find((s) => s.layers.some((l) => l.items.some((i) => i.ref)))!;
    const ref = stack.layers.flatMap((l) => l.items).find((i) => i.ref)!.ref!;
    expect(getPractice(ref).stacks.map((s) => s.href)).toContain(`/stack/${stack.id}`);
  });

  it("finds a build from anywhere it teaches the page, its learning path included", () => {
    const build = getBuilds().find((b) => (b.learningPath ?? []).length > 0)!;
    for (const step of build.learningPath ?? []) {
      if (!g.nodes.has(step)) continue;
      expect(getPractice(step).builds.map((b) => b.href), `${step} → ${build.id}`).toContain(`/build/${build.id}`);
    }
  });

  // These two walk all 248 pages. `getPractice` re-reads the content on every
  // call here, because React's `cache()` only memoises inside a render — in the
  // build each page calls it once and the wrapper does its job.
  it("caps each group, because a widely used page is in nearly every stack", { timeout: 60_000 }, () => {
    for (const id of ids) {
      const p = getPractice(id);
      for (const [group, links] of Object.entries(p)) expect(links.length, `${id}.${group}`).toBeLessThanOrEqual(5);
    }
  });

  it("offers nothing, rather than something wrong, for a page nothing points at", () => {
    expect(hasPractice(getPractice("no-such-node"))).toBe(false);
    expect(getPractice("no-such-node")).toEqual({ playgrounds: [], challenges: [], stacks: [], builds: [] });
  });

  it("every link it hands out goes somewhere real", { timeout: 60_000 }, () => {
    const slugs = new Set(PLAYGROUNDS.map((p) => p.slug));
    const challenges = new Set(getChallenges().map((c) => c.id));
    const stacks = new Set(getStacks().map((s) => s.id));
    const builds = new Set(getBuilds().map((b) => b.id));
    for (const id of ids) {
      const p = getPractice(id);
      for (const l of p.playgrounds) expect(slugs, l.href).toContain(l.href.replace("/playground/", ""));
      for (const l of p.challenges) expect(challenges, l.href).toContain(l.href.replace("/challenge#", ""));
      for (const l of p.stacks) expect(stacks, l.href).toContain(l.href.replace("/stack/", ""));
      for (const l of p.builds) expect(builds, l.href).toContain(l.href.replace("/build/", ""));
      for (const l of [...p.playgrounds, ...p.challenges, ...p.stacks, ...p.builds]) {
        expect(l.label.trim().length, l.href).toBeGreaterThan(0);
        expect(l.label.length, `${l.href} label is too long to read in a list`).toBeLessThanOrEqual(96);
      }
    }
  });
});
