import { describe, expect, it } from "vitest";
import { displayOrder } from "@/lib/challenge";
import { getChallenges } from "@/lib/content/graph";

describe("displayOrder", () => {
  it("is a permutation, and the same one every time", () => {
    const order = displayOrder("lost-update", 4);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
    expect(displayOrder("lost-update", 4)).toEqual(order);
  });

  it("does not leave the right answer where authors put it", () => {
    // Written in file order, every correct answer sat at A or B.
    const shownAt = [0, 0, 0, 0];
    for (const c of getChallenges()) {
      displayOrder(c.id, c.options.length).forEach((from, at) => {
        if (c.options[from].correct) shownAt[at]++;
      });
    }
    const total = shownAt.reduce((a, b) => a + b, 0);
    expect(shownAt.filter((n) => n > 0), `correct answers shown at A–D: ${shownAt}`).toHaveLength(4);
    expect(Math.max(...shownAt) / total).toBeLessThanOrEqual(0.5);
  });
});
