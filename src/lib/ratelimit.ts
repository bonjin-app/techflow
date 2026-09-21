/**
 * The rate-limiting algorithms the playground demonstrates, as pure functions
 * over explicit state.
 *
 * They live here rather than inside the component because the playground makes
 * factual claims — a fixed window admits a double burst at its boundary, a
 * token bucket allows one burst and then settles to the refill rate — and a
 * claim the reader can watch run should be a claim a test can check. I once
 * talked myself into "fixing" the fixed window after simulating it with the
 * wrong tick length; a test would have said so in a second.
 */
export type Algo = "fixed-window" | "sliding-log" | "sliding-counter" | "token-bucket" | "leaky-bucket";

export interface LimiterState {
  /** fixed and sliding-counter windows */
  windowStart: number;
  count: number;
  prevCount: number;
  /** sliding log: the timestamp of every request still inside the window */
  log: number[];
  /** token bucket */
  tokens: number;
  lastRefill: number;
  /** leaky bucket: what is waiting to drain */
  queue: number[];
}

export function initialState(now: number, limit: number): LimiterState {
  return { windowStart: now, count: 0, prevCount: 0, log: [], tokens: limit, queue: [], lastRefill: now };
}

export interface LimiterConfig {
  algo: Algo;
  /** requests permitted per window */
  limit: number;
  windowMs: number;
}

/** Whether this request is allowed, mutating `s` to record the decision. */
export function decide(s: LimiterState, now: number, { algo, limit, windowMs }: LimiterConfig): boolean {
  const rate = limit / windowMs; // tokens per ms
  switch (algo) {
    case "fixed-window": {
      if (now - s.windowStart >= windowMs) {
        s.prevCount = s.count;
        s.count = 0;
        s.windowStart = now - ((now - s.windowStart) % windowMs);
      }
      if (s.count < limit) {
        s.count++;
        return true;
      }
      return false;
    }
    case "sliding-log": {
      s.log = s.log.filter((t) => t > now - windowMs);
      if (s.log.length < limit) {
        s.log.push(now);
        return true;
      }
      return false;
    }
    case "sliding-counter": {
      if (now - s.windowStart >= windowMs) {
        // More than one window may have elapsed while nothing arrived. The
        // window before this one was then empty, so carrying the old count
        // forward would reject requests on the strength of ancient traffic.
        s.prevCount = now - s.windowStart < windowMs * 2 ? s.count : 0;
        s.count = 0;
        s.windowStart = now - ((now - s.windowStart) % windowMs);
      }
      const overlap = 1 - (now - s.windowStart) / windowMs;
      if (s.prevCount * overlap + s.count < limit) {
        s.count++;
        return true;
      }
      return false;
    }
    case "token-bucket": {
      s.tokens = Math.min(limit, s.tokens + (now - s.lastRefill) * rate);
      s.lastRefill = now;
      if (s.tokens >= 1) {
        s.tokens -= 1;
        return true;
      }
      return false;
    }
    case "leaky-bucket": {
      if (s.queue.length < limit) {
        s.queue.push(now);
        return true;
      }
      return false;
    }
  }
}

/**
 * How many queued requests leak out in one tick. Whole requests only, with the
 * fractional part settled by `roll` — pass `Math.random` in the UI, or a fixed
 * value in a test that wants a deterministic drain.
 */
export function drain(s: LimiterState, { limit, windowMs }: LimiterConfig, tickMs: number, roll: () => number): number {
  const perTick = (limit / windowMs) * tickMs;
  const whole = Math.floor(perTick) + (roll() < perTick % 1 ? 1 : 0);
  const leaked = Math.min(s.queue.length, whole);
  s.queue.splice(0, leaked);
  return leaked;
}
