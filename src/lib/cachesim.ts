/**
 * The eviction policies the cache playground demonstrates, as a pure step over
 * explicit state — here rather than in the component because the page teaches
 * what LRU, LFU and FIFO each throw away, and a claim the reader can watch run
 * should be one a test can check.
 */
export type Policy = "lru" | "lfu" | "fifo";

export interface Slot {
  key: number;
  /** how many times it has been read since it was cached */
  hits: number;
  /** the tick it was last touched — inserted, or read */
  at: number;
  /** the tick it expires on; Infinity when no TTL is set */
  expires: number;
}

export interface StepResult {
  hit: boolean;
  evictions: number;
  expirations: number;
}

/** Which slot this policy throws away to make room. */
export function victimIndex(slots: Slot[], policy: Policy): number {
  if (policy === "lru") return slots.reduce((m, x, i) => (x.at < slots[m].at ? i : m), 0);
  if (policy === "lfu") {
    return slots.reduce((m, x, i) => (x.hits < slots[m].hits || (x.hits === slots[m].hits && x.at < slots[m].at) ? i : m), 0);
  }
  return 0; // fifo — the oldest insert is at the front, and a read never moves it
}

/**
 * Read `key` at tick `t`, mutating `slots`. Returns whether it was a hit and
 * what had to be thrown away.
 */
export function read(
  slots: Slot[],
  key: number,
  t: number,
  { capacity, policy, ttl }: { capacity: number; policy: Policy; ttl: number },
): StepResult {
  let expirations = 0;
  if (ttl > 0) {
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i].expires <= t) {
        slots.splice(i, 1);
        expirations++;
      }
    }
  }

  const found = slots.find((x) => x.key === key);
  if (found) {
    found.hits++;
    found.at = t;
    return { hit: true, evictions: 0, expirations };
  }

  // A loop, not an if: the capacity slider can be dragged down mid-run, and
  // evicting one per miss would leave the cache permanently larger than the
  // capacity the reader just set — the hit ratio would then be a lie.
  let evictions = 0;
  while (slots.length >= capacity) {
    slots.splice(victimIndex(slots, policy), 1);
    evictions++;
  }
  slots.push({ key, hits: 0, at: t, expires: ttl > 0 ? t + ttl : Infinity });
  return { hit: false, evictions, expirations };
}
