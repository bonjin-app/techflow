import { describe, expect, it } from "vitest";
import { decide, drain, initialState, type Algo, type LimiterConfig } from "@/lib/ratelimit";

const LIMIT = 10;
const WINDOW = 1000;
const cfg = (algo: Algo): LimiterConfig => ({ algo, limit: LIMIT, windowMs: WINDOW });

/** Send `n` requests at `now` and count how many were allowed. */
function burst(algo: Algo, times: number[]) {
  const s = initialState(0, LIMIT);
  const allowed: number[] = [];
  for (const t of times) if (decide(s, t, cfg(algo))) allowed.push(t);
  return allowed;
}

/** The most requests any window-length span admitted. */
function worstWindow(allowed: number[], windowMs = WINDOW) {
  let worst = 0;
  for (const start of allowed) {
    worst = Math.max(worst, allowed.filter((t) => t >= start && t < start + windowMs).length);
  }
  return worst;
}

describe("the claims the rate limiter playground makes", () => {
  // "A burst at the end of one window and another at the start of the next
  //  passes twice the limit in a moment."
  it("fixed window admits twice the limit across a boundary", () => {
    const atEnd = Array.from({ length: LIMIT }, () => WINDOW - 1);
    const atStart = Array.from({ length: LIMIT }, () => WINDOW);
    const allowed = burst("fixed-window", [...atEnd, ...atStart]);
    expect(allowed).toHaveLength(LIMIT * 2);
    // and those 2x sit inside a single window's worth of time
    expect(worstWindow(allowed)).toBe(LIMIT * 2);
  });

  // "Exact, and never admits more than the limit in any window."
  it("sliding log never exceeds the limit in any window, however traffic arrives", () => {
    for (const seed of [1, 7, 42]) {
      let x = seed;
      const times = Array.from({ length: 400 }, () => (x = (x * 1103515245 + 12345) % 2 ** 31) % 3000).sort((a, b) => a - b);
      expect(worstWindow(burst("sliding-log", times))).toBeLessThanOrEqual(LIMIT);
    }
  });

  // "Removes most of the boundary burst, at the cost of being an approximation."
  it("sliding counter sits between the two: better than a fixed window, not exact", () => {
    const times = [...Array.from({ length: LIMIT }, () => WINDOW - 1), ...Array.from({ length: LIMIT }, () => WINDOW)];
    const counter = worstWindow(burst("sliding-counter", times));
    expect(counter).toBeLessThan(LIMIT * 2); // better than the fixed window
    expect(counter).toBeGreaterThanOrEqual(LIMIT); // and not exact, or it would be the log
  });

  // "Allows a deliberate burst up to the bucket size, then settles to the
  //  refill rate."
  it("token bucket allows one full burst, then only the refill rate", () => {
    const s = initialState(0, LIMIT);
    // A full bucket answers a burst of `limit` immediately …
    const first = Array.from({ length: LIMIT * 2 }, () => decide(s, 0, cfg("token-bucket"))).filter(Boolean);
    expect(first).toHaveLength(LIMIT);
    // … and nothing more until tokens refill.
    expect(decide(s, 1, cfg("token-bucket"))).toBe(false);

    // Over a long run, throughput settles at the refill rate rather than the
    // burst size: ten windows of constant pressure allow about ten windows'
    // worth, not ten bursts' worth.
    let allowed = 0;
    for (let t = 1; t <= WINDOW * 10; t++) if (decide(s, t, cfg("token-bucket"))) allowed++;
    expect(allowed).toBeGreaterThan(LIMIT * 9);
    expect(allowed).toBeLessThanOrEqual(LIMIT * 10);
  });

  it("leaky bucket holds at most the capacity and drains at a steady rate", () => {
    const s = initialState(0, LIMIT);
    const accepted = Array.from({ length: LIMIT * 3 }, () => decide(s, 0, cfg("leaky-bucket"))).filter(Boolean);
    expect(accepted).toHaveLength(LIMIT);
    expect(s.queue).toHaveLength(LIMIT);

    // 10 per 1000ms is 1 per 100ms tick: a whole request every tick, no dice roll.
    const leaked = drain(s, cfg("leaky-bucket"), 100, () => 1);
    expect(leaked).toBe(1);
    expect(s.queue).toHaveLength(LIMIT - 1);
  });

  it("a fractional drain rate leaks whole requests, at the right average", () => {
    const cfgSlow: LimiterConfig = { algo: "leaky-bucket", limit: 3, windowMs: 1000 };
    const s = initialState(0, 3);
    for (let i = 0; i < 3; i++) decide(s, 0, cfgSlow);
    // 3 per 1000ms over a 100ms tick is 0.3 of a request: never a fraction …
    expect(drain(s, cfgSlow, 100, () => 0.9)).toBe(0); // roll above 0.3
    expect(drain(s, cfgSlow, 100, () => 0.1)).toBe(1); // roll below 0.3
    // … and never more than is queued.
    expect(drain(s, cfgSlow, 100000, () => 0.1)).toBe(2);
  });

  it("an idle gap does not carry an old count into a fresh window", () => {
    const s = initialState(0, LIMIT);
    for (let i = 0; i < LIMIT; i++) decide(s, 0, cfg("sliding-counter"));
    // Nothing arrives for several windows. The window before this one was
    // empty, so the full limit must be available again.
    let allowed = 0;
    for (let i = 0; i < LIMIT; i++) if (decide(s, WINDOW * 5, cfg("sliding-counter"))) allowed++;
    expect(allowed).toBe(LIMIT);
  });
});
