import fs from "node:fs";
import { describe, expect, it } from "vitest";
import matter from "gray-matter";
import { getSetups } from "@/lib/content/graph";
import { parseBlocks, runnable } from "@/lib/setup-blocks";

describe("what a setup guide claims CI did with it", () => {
  const setups = getSetups();

  it("is derived from its code blocks, not from a label someone can type", () => {
    for (const s of setups) {
      const { content } = matter(fs.readFileSync(`content/setups/${s.id}.md`, "utf8"));
      const hasChecks = runnable(parseBlocks(content));
      expect(s.verification === "none", `${s.id}: ${s.verification} but ${hasChecks ? "has" : "has no"} run and check blocks`).toBe(!hasChecks);
    }
  });

  it("names what a static guide validated, and only a static guide does", () => {
    for (const s of setups) {
      expect(Boolean(s.validates), `${s.id}: validates is for static guides only`).toBe(s.verification === "static");
    }
  });

  it("allows high confidence only on a guide CI brings up", () => {
    for (const s of setups) {
      if (s.meta?.confidence === "high") expect(s.verification, `${s.id} claims high confidence`).toBe("run");
    }
  });

  it("covers every guide the site publishes: none is left on read-only trust", () => {
    // If this fails a guide was added that CI does not check. Mark its blocks, or say why it cannot be.
    expect(setups.filter((s) => s.verification === "none").map((s) => s.id)).toEqual([]);
  });
});
