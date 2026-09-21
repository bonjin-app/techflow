import { describe, expect, it } from "vitest";
import { read, victimIndex, type Policy, type Slot } from "@/lib/cachesim";

const cfg = (policy: Policy, capacity = 3, ttl = 0) => ({ policy, capacity, ttl });

/** Read a sequence of keys, one per tick, and report the cache that survives. */
function run(keys: number[], policy: Policy, capacity = 3, ttl = 0) {
  const slots: Slot[] = [];
  const hits: boolean[] = [];
  keys.forEach((k, i) => hits.push(read(slots, k, i + 1, cfg(policy, capacity, ttl)).hit));
  return { keys: slots.map((s) => s.key), hits };
}

describe("the claims the cache playground makes", () => {
  it("LRU throws away the key nobody has asked for in longest", () => {
    // 1,2,3 fill it; reading 1 again makes 2 the least recently used.
    const { keys } = run([1, 2, 3, 1, 4], "lru");
    expect(keys).not.toContain(2);
    expect(keys.sort()).toEqual([1, 3, 4]);
  });

  it("LFU throws away the key fewest people asked for, however recent", () => {
    // 1 is read three times, 2 once, 3 once. 3 is newest but 2 is older on the
    // tie, so 2 goes first — frequency first, recency only to break a tie.
    const { keys } = run([1, 2, 1, 3, 1, 4], "lfu");
    expect(keys).toContain(1);
    expect(keys).not.toContain(2);
  });

  it("FIFO throws away the oldest insert, even if it is the most read", () => {
    // 1 is read repeatedly and still goes first: FIFO does not care.
    const { keys } = run([1, 2, 3, 1, 1, 1, 4], "fifo");
    expect(keys).not.toContain(1);
    expect(keys.sort()).toEqual([2, 3, 4]);
  });

  it("the three policies disagree on the same trace, which is the point", () => {
    const trace = [1, 2, 3, 1, 1, 4];
    const survivors = (["lru", "lfu", "fifo"] as Policy[]).map((p) => run(trace, p).keys.sort().join(","));
    expect(new Set(survivors).size).toBeGreaterThan(1);
  });

  it("a hit counts as a read: it updates both recency and frequency", () => {
    const slots: Slot[] = [];
    read(slots, 7, 1, cfg("lru"));
    expect(slots[0]).toMatchObject({ hits: 0, at: 1 });
    expect(read(slots, 7, 9, cfg("lru")).hit).toBe(true);
    expect(slots[0]).toMatchObject({ hits: 1, at: 9 });
  });

  it("a TTL expires an entry even though nothing evicted it", () => {
    const slots: Slot[] = [];
    read(slots, 1, 1, cfg("lru", 10, 5)); // expires at tick 6
    expect(read(slots, 1, 5, cfg("lru", 10, 5)).hit).toBe(true); // still warm
    const afterExpiry = read(slots, 1, 20, cfg("lru", 10, 5));
    expect(afterExpiry.hit).toBe(false);
    expect(afterExpiry.expirations).toBe(1);
  });

  it("the cache never holds more than the capacity, even if it is lowered mid-run", () => {
    const slots: Slot[] = [];
    for (let i = 0; i < 8; i++) read(slots, i, i + 1, cfg("lru", 6));
    expect(slots).toHaveLength(6);
    // The reader drags capacity down to 2: the next miss must shed the excess,
    // not leave the cache four slots over the number on screen.
    read(slots, 99, 20, cfg("lru", 2));
    expect(slots.length).toBeLessThanOrEqual(2);
  });

  it("a scan of more distinct keys than slots hits nothing, whatever the policy", () => {
    // The classic argument for scan resistance: a sequential sweep evicts the
    // entry it is about to need next.
    for (const policy of ["lru", "lfu", "fifo"] as Policy[]) {
      const trace = [...Array(10).keys(), ...Array(10).keys()];
      const { hits } = run(trace, policy, 4);
      expect(hits.filter(Boolean), policy).toHaveLength(0);
    }
  });

  it("victimIndex never points outside the cache", () => {
    for (const policy of ["lru", "lfu", "fifo"] as Policy[]) {
      const slots: Slot[] = [{ key: 1, hits: 0, at: 1, expires: Infinity }];
      expect(victimIndex(slots, policy)).toBe(0);
    }
  });
});
