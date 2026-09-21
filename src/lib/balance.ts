/**
 * The load-balancing strategies the playground demonstrates, as a pure choice
 * over explicit state — here rather than in the component for the same reason
 * as the rate limiter: the page teaches that round robin cycles, that least
 * connections follows load, and that IP hash sends a client back to the same
 * server, and a claim the reader can watch run should be one a test can check.
 */
export type Algo = "round-robin" | "least-connections" | "random" | "ip-hash" | "weighted";

export interface Backend {
  id: number;
  weight: number;
  healthy: boolean;
  /** requests currently in flight */
  active: number;
}

export interface Cursor {
  /** round robin's position; the caller owns it so it survives re-renders */
  next: number;
}

/**
 * The backend this request goes to, or `undefined` when nothing is healthy —
 * which is a 503, not a crash. `roll` supplies randomness so a test can make
 * the two random strategies deterministic.
 */
export function choose<T extends Backend>(
  list: T[],
  { algo, client, cursor, roll = Math.random }: { algo: Algo; client: number; cursor: Cursor; roll?: () => number },
): T | undefined {
  const healthy = list.filter((s) => s.healthy);
  if (healthy.length === 0) return undefined;
  switch (algo) {
    case "round-robin":
      return healthy[cursor.next++ % healthy.length];
    case "least-connections":
      // `reduce` keeps the incumbent on a tie, so equal load holds its order.
      return healthy.reduce((m, s) => (s.active < m.active ? s : m));
    case "random":
      return healthy[Math.floor(roll() * healthy.length)];
    case "ip-hash":
      return healthy[client % healthy.length];
    case "weighted": {
      const total = healthy.reduce((a, s) => a + s.weight, 0);
      let r = roll() * total;
      for (const s of healthy) {
        r -= s.weight;
        if (r <= 0) return s;
      }
      return healthy[healthy.length - 1];
    }
  }
}
