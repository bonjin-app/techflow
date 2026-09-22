import { describe, expect, it } from "vitest";
import { BRANCHES } from "@/lib/mindmap";
import { RELATION_LABEL, type Relation } from "@/lib/content/types";
import { buildGraph } from "@/lib/content/graph";

const RELATIONS = Object.keys(RELATION_LABEL) as Relation[];
const DIRECTIONS = ["out", "in"] as const;
const g = buildGraph();

/**
 * A neighbour that matches no branch is not drawn and not counted — the reader
 * sees fewer connections than the page has, with nothing to say so. Adding a
 * relation to the vocabulary without adding it here is how that happens.
 */
describe("the mind map's branches", () => {
  it("cover every relation in the vocabulary, both ways round", () => {
    const uncovered: string[] = [];
    for (const rel of RELATIONS) {
      for (const dir of DIRECTIONS) {
        if (!BRANCHES.some((b) => b.match(rel, dir))) uncovered.push(`${rel} (${dir})`);
      }
    }
    expect(uncovered).toEqual([]);
  });

  it("place every neighbour of every page on exactly one branch", () => {
    let placed = 0;
    for (const [id, edges] of g.adjacency) {
      for (const e of edges) {
        const dir = e.from === id ? "out" : "in";
        const matches = BRANCHES.filter((b) => b.match(e.rel, dir));
        expect(matches.length, `${id}: ${e.rel} (${dir}) matches ${matches.length} branches`).toBeGreaterThan(0);
        placed++;
      }
    }
    // the whole graph, not a sample
    expect(placed).toBeGreaterThan(8000);
  });

  it("name every branch, because the label is what makes the diagram readable", () => {
    for (const b of BRANCHES) {
      expect(b.key.trim().length, b.key).toBeGreaterThan(0);
      expect(b.label.trim().length, b.key).toBeGreaterThan(0);
    }
    expect(new Set(BRANCHES.map((b) => b.key)).size).toBe(BRANCHES.length);
    expect(new Set(BRANCHES.map((b) => b.label)).size).toBe(BRANCHES.length);
  });

  it("separate the two directions of a relation that is not symmetric", () => {
    // "Build on" and "Leads to" are opposite readings of REQUIRES; putting both
    // on one branch would tell the reader a prerequisite is a consequence.
    const out = BRANCHES.find((b) => b.match("REQUIRES", "out"))!;
    const into = BRANCHES.find((b) => b.match("REQUIRES", "in"))!;
    expect(out.key).not.toBe(into.key);
    // and a symmetric one reads the same either way, so it stays on one branch
    for (const rel of ["RELATED_TO", "USED_WITH", "ALTERNATIVE_TO"] as Relation[]) {
      const a = BRANCHES.find((b) => b.match(rel, "out"))!;
      const b = BRANCHES.find((x) => x.match(rel, "in"))!;
      expect(a.key, rel).toBe(b.key);
    }
  });
});
