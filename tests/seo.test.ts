import { describe as group, expect, it } from "vitest";
import { DESCRIPTION_BUDGET, describe, fit, nodeTitle } from "@/lib/seo";
import { buildGraph } from "@/lib/content/graph";

const g = buildGraph();
const SUFFIX = " | TechFlow".length; // the layout's template
const nodes = [...g.nodes.values()];

/**
 * A title is the one piece of a page a search result always shows, and it shows
 * about sixty characters of it. Three tags were appended regardless of length,
 * so 113 of 248 pages were cut mid-phrase — "Hexagonal Architecture Pattern:
 * Application Architecture, Ports and…" and nothing after it.
 */
group("what a search result shows", () => {
  it("fits every title in the width a result gives it", () => {
    for (const n of nodes) {
      expect(nodeTitle(n).length + SUFFIX, `${n.id}: "${nodeTitle(n)}"`).toBeLessThanOrEqual(60);
    }
  });

  it("spends the room on the name first and the tags last", () => {
    for (const n of nodes) {
      const title = nodeTitle(n);
      expect(title, n.id).toContain(n.name);
      // whatever was dropped, the title never ends mid-list
      expect(title.trim(), n.id).not.toMatch(/[,:]$/);
    }
  });

  it("keeps a tag only when the whole tag fits", () => {
    for (const n of nodes) {
      if (!["technology", "concept", "pattern"].includes(n.type)) continue;
      const tags = (n as unknown as { tags: string[] }).tags;
      const kept = nodeTitle(n).split(": ")[1]?.split(", ") ?? [];
      // every tag shown is one the page actually carries, in order, from the start
      expect(kept, n.id).toEqual(tags.slice(0, kept.length));
    }
  });

  it("says what the page is even when nothing else fits", () => {
    for (const n of nodes) expect(nodeTitle(n).length, n.id).toBeGreaterThan(3);
  });
});

group("a title built outside nodeTitle", () => {
  it("gives up its framing rather than its subject", () => {
    // Stack pages append "stack: what it is made of and why", which fits a
    // short name and not a long one.
    expect(fit("AI Product stack: what it is made of and why", "AI Product stack")).toMatch(/made of and why$/);
    expect(fit("Analytics & Event Pipeline stack: what it is made of and why", "Analytics & Event Pipeline stack")).toBe(
      "Analytics & Event Pipeline stack",
    );
  });
});

group("a generated sentence of context", () => {
  it("is kept when the whole description still fits", () => {
    const out = describe("A short tagline", "And some context.");
    expect(out).toBe("A short tagline. And some context.");
  });

  it("is dropped rather than truncating what the author wrote", () => {
    const tagline = "x".repeat(DESCRIPTION_BUDGET - 20);
    const out = describe(tagline, "A sentence long enough to push this over the edge.");
    expect(out).toBe(`${tagline}.`);
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_BUDGET);
  });

  it("does not double the full stop the author already wrote", () => {
    expect(describe("Already a sentence.", "More.")).toBe("Already a sentence. More.");
  });
});
