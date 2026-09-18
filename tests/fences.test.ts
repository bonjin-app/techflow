import { describe, expect, it } from "vitest";
import { parseCompare, parseDecision, parseRefLabel, parseSequence, parseSteps } from "@/lib/fences";

describe("parseRefLabel", () => {
  it("splits a label from its node id", () => {
    expect(parseRefLabel("Redis [redis]")).toMatchObject({ label: "Redis", ref: "redis" });
  });
  it("leaves a plain label alone", () => {
    expect(parseRefLabel("Local Disk")).toMatchObject({ label: "Local Disk" });
    expect(parseRefLabel("Local Disk").ref).toBeUndefined();
  });
  it("trims whitespace around the label", () => {
    expect(parseRefLabel("  Cache Aside  [cache-aside]  ")).toMatchObject({ label: "Cache Aside", ref: "cache-aside" });
  });
  it("only accepts a bare id in the brackets, so a typo stays visible as text", () => {
    // Deliberately strict: [ cache aside ] is not a ref, and showing it as part
    // of the label is better than silently dropping a link the author intended.
    expect(parseRefLabel("Cache Aside [ cache-aside ]").ref).toBeUndefined();
  });
  it("splits a trailing note off with the pipe", () => {
    expect(parseRefLabel("Caching [cache] | keep hot data in memory")).toMatchObject({
      label: "Caching",
      ref: "cache",
      note: "keep hot data in memory",
    });
  });
});

describe("parseSteps", () => {
  it("reads a title, refs and per-step notes", () => {
    const data = parseSteps(["title: Prerequisites", "HTTP [http]", "Caching [cache] | keep hot data in memory", "Plain step"].join("\n"));
    expect(data.title).toBe("Prerequisites");
    expect(data.steps).toHaveLength(3);
    expect(data.steps[0]).toMatchObject({ label: "HTTP", ref: "http" });
    expect(data.steps[1]).toMatchObject({ label: "Caching", ref: "cache", note: "keep hot data in memory" });
    expect(data.steps[2].ref).toBeUndefined();
  });
  it("ignores blank lines", () => {
    expect(parseSteps("A\n\n\nB").steps).toHaveLength(2);
  });
});

describe("parseSequence", () => {
  const src = [
    "title: Cache miss",
    "participants: Client, API [backend], DB [postgresql]",
    "Client -> API: GET /user/1",
    "API --> Client: 200 OK",
  ].join("\n");

  it("reads participants with their refs", () => {
    const data = parseSequence(src);
    expect(data.participants.map((p) => p.label)).toEqual(["Client", "API", "DB"]);
    expect(data.participants[1].ref).toBe("backend");
  });

  it("distinguishes a call from a reply, and indexes participants by position", () => {
    const data = parseSequence(src);
    expect(data.messages[0]).toMatchObject({ from: 0, to: 1, reply: false });
    expect(data.messages[1]).toMatchObject({ from: 1, to: 0, reply: true });
  });

  it("keeps the message text intact, colons and all", () => {
    const data = parseSequence("participants: A, B\nA -> B: GET /x?y=1: fine");
    expect(data.messages[0].text).toBe("GET /x?y=1: fine");
  });
});

describe("parseCompare", () => {
  it("reads the header row and the body rows", () => {
    const data = parseCompare(["Feature | Redis | Memcached", "Persistence | Yes | Limited"].join("\n"));
    expect(data.header).toEqual(["Feature", "Redis", "Memcached"]);
    expect(data.rows[0]).toEqual(["Persistence", "Yes", "Limited"]);
  });
});

describe("parseDecision", () => {
  const src = ["? Need rich data structures?", "  YES -> Redis [redis]", "  NO -> ? Is key/value enough?", "    YES -> Memcached [memcached]", "    NO -> Reconsider"].join("\n");

  it("builds a tree from the indentation", () => {
    const { root } = parseDecision(src);
    expect(root).not.toBeNull();
    expect(root!.kind).toBe("question");
    expect(root!.text).toContain("rich data structures");

    const yes = root!.answers?.find((a) => a.label === "YES");
    expect(yes?.next).toMatchObject({ kind: "leaf", text: "Redis", ref: "redis" });

    const no = root!.answers?.find((a) => a.label === "NO");
    expect(no?.next.kind).toBe("question");
    expect(no?.next.text).toContain("key/value");
    expect(no?.next.answers?.find((a) => a.label === "YES")?.next).toMatchObject({ text: "Memcached", ref: "memcached" });
  });

  it("returns null for an empty fence rather than throwing", () => {
    expect(parseDecision("").root).toBeNull();
  });
});
