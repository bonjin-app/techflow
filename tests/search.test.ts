import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { NodeSummary } from "@/lib/content/types";
import { groupByType, searchNodes } from "@/lib/search";
import { ALIASES } from "@/lib/aliases";
import { queryTerms, searchText, type TextIndex } from "@/lib/fulltext";

const index = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "search-index.json"), "utf8")) as NodeSummary[];
const first = (q: string) => searchNodes(index, q, 1)[0]?.item.id;

describe("searchNodes", () => {
  it("returns nothing for an empty query", () => {
    expect(searchNodes(index, "")).toEqual([]);
    expect(searchNodes(index, "   ")).toEqual([]);
  });

  it("lets an exact name beat anything a partial match can accumulate", () => {
    // Each of these lost by a point or two to a longer name that merely
    // carried the query as a tag.
    expect(first("SQL")).toBe("sql"); // was sqlite
    expect(first("Authentication")).toBe("authentication"); // was authentication-system
    expect(first("Observability")).toBe("observability"); // was observability-stack
  });

  it("every alias points at a page and wins its own query", () => {
    // An alias for a page that was renamed does nothing at all, silently, and
    // one that loses to a fuzzy match is an alias in name only.
    for (const [alias, id] of Object.entries(ALIASES)) {
      expect(index.some((n) => n.id === id), `${alias} → ${id}, which is not a page`).toBe(true);
      expect(first(alias), `"${alias}" should find ${id}`).toBe(id);
    }
  });

  it("ignores the punctuation nobody types", () => {
    expect(first("ci cd")).toBe("ci-cd");
    expect(first("cicd")).toBe("ci-cd");
    expect(first("fan out")).toBe("fan-out");
    expect(first("fine tuning")).toBe("fine-tuning");
    expect(first("next js")).toBe("nextjs");
  });

  it("puts an exact name or id first", () => {
    expect(first("redis")).toBe("redis");
    expect(first("cache aside")).toBe("cache-aside");
    expect(first("rate limiting")).toBe("rate-limiting");
  });

  it("prefers the page itself over a comparison about it", () => {
    expect(first("kafka")).toBe("kafka");
    expect(first("postgresql")).toBe("postgresql");
  });

  it("treats a prefix of a short name as a better match than a prefix of a long one", () => {
    expect(first("cach")).toBe("cache");
  });

  it("resolves the abbreviations people actually type", () => {
    expect(first("k8s")).toBe("kubernetes");
    expect(first("adr")).toBe("architecture-decision-record");
    expect(first("postgres")).toBe("postgresql");
  });

  it("survives one transposed key", () => {
    expect(first("redsi")).toBe("redis");
    expect(first("kuberentes")).toBe("kubernetes");
    expect(first("docekr")).toBe("docker");
  });

  it("returns nothing rather than a wrong guess for gibberish", () => {
    expect(searchNodes(index, "xyzzy")).toEqual([]);
    expect(searchNodes(index, "qqqqqqqq")).toEqual([]);
  });

  it("honours the limit and orders by score", () => {
    const hits = searchNodes(index, "cache", 5);
    expect(hits.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
  });
});

describe("groupByType", () => {
  it("keeps every hit and groups without duplicating", () => {
    const hits = searchNodes(index, "cache", 20);
    const groups = groupByType(hits);
    expect(groups.reduce((a, g) => a + g.items.length, 0)).toBe(hits.length);
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("full text", () => {
  const text = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "search-text.json"), "utf8")) as TextIndex;
  const top = (q: string) => searchText(text, q, 4).map((h) => h.id);

  it("finds pages by phrases that are nobody's title", () => {
    expect(top("coordinated omission")).toContain("load-testing");
    expect(top("coordinated omission")).toContain("tail-latency");
    expect(top("semantic lock")[0]).toBe("saga");
    expect(top("fencing token").slice(0, 3)).toEqual(expect.arrayContaining(["distributed-lock", "consensus"]));
  });

  it("ranks a page that says the word often above one that says it once", () => {
    // delivery-semantics is about exactly-once; kafka mentions it
    expect(top("exactly-once")[0]).toBe("delivery-semantics");
  });

  it("returns nothing for a word no page uses", () => {
    expect(searchText(text, "zzzzxyq")).toEqual([]);
    expect(searchText(text, "")).toEqual([]);
  });

  it("drops words too short or too common to narrow anything down", () => {
    expect(queryTerms("a to the of redis")).toEqual(["the", "redis"]); // <3 chars gone
    expect(text.terms["the"]).toBeUndefined(); // pruned as ubiquitous
  });

  it("every posting points at a real page", () => {
    for (const [term, docs] of Object.entries(text.terms).slice(0, 400)) {
      for (const entry of docs) {
        const i = entry < 0 ? -entry - 1 : entry;
        expect(text.ids[i], `${term} → ${entry}`).toBeDefined();
      }
    }
  });
});
