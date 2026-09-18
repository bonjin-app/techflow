import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { NodeSummary } from "@/lib/content/types";
import { groupByType, searchNodes } from "@/lib/search";

const index = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "search-index.json"), "utf8")) as NodeSummary[];
const first = (q: string) => searchNodes(index, q, 1)[0]?.item.id;

describe("searchNodes", () => {
  it("returns nothing for an empty query", () => {
    expect(searchNodes(index, "")).toEqual([]);
    expect(searchNodes(index, "   ")).toEqual([]);
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
