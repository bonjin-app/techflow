import { describe, expect, it } from "vitest";
import { choose, type Algo, type Backend, type Cursor } from "@/lib/balance";

const three = (): Backend[] => [
  { id: 0, weight: 3, healthy: true, active: 0 },
  { id: 1, weight: 1, healthy: true, active: 0 },
  { id: 2, weight: 1, healthy: true, active: 0 },
];

function pick(list: Backend[], algo: Algo, n: number, opts: { client?: number; roll?: () => number } = {}) {
  const { client = 0, roll = () => 0.5 } = opts;
  const cursor: Cursor = { next: 0 };
  return Array.from({ length: n }, () => choose(list, { algo, client, cursor, roll })?.id);
}

describe("the claims the load balancer playground makes", () => {
  it("round robin cycles through every backend in order", () => {
    expect(pick(three(), "round-robin", 7)).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it("least connections follows the load rather than the order", () => {
    const list = three();
    list[0].active = 5;
    list[1].active = 9;
    list[2].active = 1;
    expect(choose(list, { algo: "least-connections", client: 0, cursor: { next: 0 } })?.id).toBe(2);
  });

  it("IP hash sends the same client back to the same backend", () => {
    for (const client of [7, 41, 1234]) {
      const seen = new Set(pick(three(), "ip-hash", 20, { client }));
      expect(seen.size).toBe(1);
    }
    // and different clients do spread out
    const spread = new Set([0, 1, 2].map((c) => pick(three(), "ip-hash", 1, { client: c })[0]));
    expect(spread.size).toBe(3);
  });

  it("weighted sends more to the heavier backend", () => {
    // weights are 3/1/1, so the first third of the range belongs to backend 0.
    expect(pick(three(), "weighted", 1, { roll: () => 0.1 })[0]).toBe(0); // 0.5 of 5 → backend 0
    expect(pick(three(), "weighted", 1, { roll: () => 0.7 })[0]).toBe(1); // 3.5 of 5 → backend 1
    expect(pick(three(), "weighted", 1, { roll: () => 0.95 })[0]).toBe(2); // 4.75 of 5 → backend 2
  });

  it("an unhealthy backend takes no traffic, whatever the strategy", () => {
    for (const algo of ["round-robin", "least-connections", "random", "ip-hash", "weighted"] as Algo[]) {
      const list = three();
      list[1].healthy = false;
      list[1].active = 0; // even though it is the least loaded
      const ids = pick(list, algo, 30, { client: 1, roll: () => 0.5 });
      expect(ids, algo).not.toContain(1);
      expect(ids.every((id) => id !== undefined), algo).toBe(true);
    }
  });

  it("round robin skips a dead backend without leaving a gap in the rotation", () => {
    const list = three();
    list[1].healthy = false;
    // Two healthy backends left, so it alternates between them — it must not
    // spend every other turn on the one that is gone.
    expect(pick(list, "round-robin", 6)).toEqual([0, 2, 0, 2, 0, 2]);
  });

  it("returns nothing when every backend is down, rather than throwing", () => {
    const list = three().map((s) => ({ ...s, healthy: false }));
    for (const algo of ["round-robin", "least-connections", "random", "ip-hash", "weighted"] as Algo[]) {
      expect(choose(list, { algo, client: 0, cursor: { next: 0 } })).toBeUndefined();
    }
  });
});
