import { describe, expect, it } from "vitest";
import { anchorFor } from "@/lib/anchor";

describe("anchorFor", () => {
  it("keeps words and drops punctuation", () => {
    expect(anchorFor("Which one should you use?")).toBe("which-one-should-you-use");
    expect(anchorFor("When to use — and when not to")).toBe("when-to-use-and-when-not-to");
  });

  it("spells out an ampersand rather than losing it", () => {
    expect(anchorFor("Connected technologies & concepts")).toBe("connected-technologies-and-concepts");
  });

  it("never starts or ends with a hyphen", () => {
    expect(anchorFor("  (Deep) Dive!  ")).toBe("deep-dive");
  });
});
