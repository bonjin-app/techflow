import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { NodeSummary } from "@/lib/content/types";
import { detectIntent, type BuildTarget } from "@/lib/intent";

const read = <T>(file: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", file), "utf8")) as T;
const index = read<NodeSummary[]>("search-index.json");
const builds = read<BuildTarget[]>("build-goals.json");
const ask = (q: string) => detectIntent(q, index, builds);

describe("detectIntent", () => {
  it("answers the four questions the product was specified around", () => {
    expect(ask("Why Redis?")).toMatchObject({ kind: "why" });
    expect(ask("Why Redis?")!.mentioned.map((m) => m.id)).toContain("redis");

    expect(ask("When is Kafka needed?")).toMatchObject({ kind: "when" });
    expect(ask("When is Kafka needed?")!.mentioned.map((m) => m.id)).toContain("kafka");

    expect(ask("WebSocket vs SSE?")).toMatchObject({ kind: "compare" });
    expect(ask("WebSocket vs SSE?")!.comparison?.id).toBe("websocket-vs-sse");

    expect(ask("How do I design a payment system?")).toMatchObject({ kind: "how" });
    expect(ask("How do I design a payment system?")!.mentioned.map((m) => m.id)).toContain("payment-system");
  });

  it("recognises a goal in a sentence", () => {
    expect(ask("I want to build an online store")).toMatchObject({ kind: "build" });
    expect(ask("I want to build an online store")!.goal?.id).toBe("e-commerce");
    expect(ask("I want to build a mobile app")!.goal?.id).toBe("mobile-app");
  });

  it("reads a whole phrase rather than a substring", () => {
    // "chatbot" must not be read as the real-time chat goal
    expect(ask("I want to build an AI chatbot")!.goal?.id).toBe("ai-application");
  });

  it("finds a comparison even when the sentence also names a goal", () => {
    const intent = ask("rest vs graphql for a mobile app")!;
    expect(intent.goal?.id).toBe("mobile-app");
    expect(intent.comparison?.id).toBe("rest-vs-graphql");
  });

  it("stays quiet when there is nothing to say", () => {
    expect(ask("")).toBeNull();
    expect(ask("redis")).toBeNull(); // a lookup, not a question
    expect(ask("how do I stop double charging a customer")).toBeNull(); // names nothing in the graph
  });

  it("always reports what it matched on, so the reading is auditable", () => {
    const intent = ask("Why Redis?")!;
    expect(intent.matched.length).toBeGreaterThan(0);
    expect(intent.reading).toContain("Redis");
  });
});
