"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Algo = "fixed-window" | "sliding-log" | "sliding-counter" | "token-bucket" | "leaky-bucket";
type Arrival = "steady" | "bursty" | "spike";

const ALGO_LABEL: Record<Algo, string> = {
  "fixed-window": "Fixed window",
  "sliding-log": "Sliding window log",
  "sliding-counter": "Sliding window counter",
  "token-bucket": "Token bucket",
  "leaky-bucket": "Leaky bucket",
};

const ALGO_NOTE: Record<Algo, string> = {
  "fixed-window":
    "One counter per window, reset at the boundary. Cheapest to implement (INCR + EXPIRE) but allows up to 2× the limit across a boundary: a client can spend the whole quota at the end of one window and again at the start of the next.",
  "sliding-log":
    "Store a timestamp per request and count those inside the trailing window. Exact, with no boundary burst — and the most expensive: memory and work grow with the number of requests.",
  "sliding-counter":
    "Weight the previous window's count by how much of it still overlaps the trailing window. Almost as cheap as a fixed window and removes most of the boundary burst, at the cost of being an approximation.",
  "token-bucket":
    "Tokens refill at a steady rate up to a capacity. Requests take a token or are rejected. Allows a deliberate burst up to the bucket size, then settles to the refill rate — usually what an API wants.",
  "leaky-bucket":
    "Requests queue and drain at a constant rate; the queue is the burst allowance and a full queue rejects. Smooths output perfectly but adds latency, because accepted requests wait their turn.",
};

const TICK_MS = 100; // one simulated tick
const HISTORY = 70;

interface Event {
  t: number;
  allowed: boolean;
}

interface State {
  // fixed window
  windowStart: number;
  count: number;
  prevCount: number;
  // sliding log
  log: number[];
  // buckets
  tokens: number;
  queue: number[];
  lastRefill: number;
}

function freshState(now: number, limit: number): State {
  return { windowStart: now, count: 0, prevCount: 0, log: [], tokens: limit, queue: [], lastRefill: now };
}

/**
 * Rate limiter simulator — five algorithms against the same arrival pattern.
 * Shows why a fixed window lets a double burst through and what a token bucket
 * does instead. All simulated in the browser on a virtual clock.
 */
export function RateLimiterSimulator() {
  const [algo, setAlgo] = useState<Algo>("fixed-window");
  const [limit, setLimit] = useState(10);
  const [windowMs, setWindowMs] = useState(2000);
  const [arrival, setArrival] = useState<Arrival>("bursty");
  const [running, setRunning] = useState(false);

  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState({ allowed: 0, rejected: 0 });
  const [gauge, setGauge] = useState({ used: 0, of: 10, label: "in window" });
  const [drained, setDrained] = useState(0);
  const [simTime, setSimTime] = useState(0);
  /** Highest number of admitted requests in any trailing window — the real test of a limiter. */
  const [peak, setPeak] = useState(0);

  const clock = useRef(0);
  const st = useRef<State>(freshState(0, 10));
  const allowedLog = useRef<number[]>([]);

  const reset = useCallback(() => {
    setRunning(false);
    clock.current = 0;
    st.current = freshState(0, limit);
    allowedLog.current = [];
    setSimTime(0);
    setPeak(0);
    setEvents([]);
    setStats({ allowed: 0, rejected: 0 });
    setGauge({ used: 0, of: limit, label: "in window" });
    setDrained(0);
  }, [limit]);

  /** How many requests arrive on this tick. */
  const arrivals = useCallback(
    (now: number): number => {
      if (arrival === "steady") return now % 200 === 0 ? 1 : 0;
      if (arrival === "bursty") {
        // A full quota just before the boundary and another just after it:
        // the classic pattern that a fixed window admits twice over.
        const phase = now % windowMs;
        const half = Math.ceil(limit / 2);
        if (phase === windowMs - 200 || phase === windowMs - 100) return half;
        if (phase === 0 || phase === 100) return half;
        return 0;
      }
      return Math.random() < 0.2 ? Math.ceil(Math.random() * 5) : 0;
    },
    [arrival, limit, windowMs],
  );

  const decide = useCallback(
    (now: number): boolean => {
      const s = st.current;
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
            s.prevCount = s.count;
            s.count = 0;
            s.windowStart = now - ((now - s.windowStart) % windowMs);
          }
          const elapsed = now - s.windowStart;
          const overlap = 1 - elapsed / windowMs;
          const estimate = s.prevCount * overlap + s.count;
          if (estimate < limit) {
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
          const capacity = limit;
          if (s.queue.length < capacity) {
            s.queue.push(now);
            return true;
          }
          return false;
        }
      }
    },
    [algo, limit, windowMs],
  );

  const step = useCallback(() => {
    const now = (clock.current += TICK_MS);
    setSimTime(now);
    const s = st.current;

    // leaky bucket drains at a constant rate regardless of arrivals
    let leaked = 0;
    if (algo === "leaky-bucket") {
      const perTick = (limit / windowMs) * TICK_MS;
      const wholeDrains = Math.floor(perTick) + (Math.random() < perTick % 1 ? 1 : 0);
      leaked = Math.min(s.queue.length, wholeDrains);
      s.queue.splice(0, leaked);
    }

    const n = arrivals(now);
    const batch: Event[] = [];
    let allowed = 0;
    let rejected = 0;
    for (let i = 0; i < n; i++) {
      const ok = decide(now);
      batch.push({ t: now, allowed: ok });
      if (ok) allowed++;
      else rejected++;
    }

    if (leaked > 0) setDrained((d) => d + leaked);
    if (batch.length > 0) {
      setEvents((e) => [...e, ...batch].slice(-HISTORY));
      setStats((p) => ({ allowed: p.allowed + allowed, rejected: p.rejected + rejected }));
      for (let i = 0; i < allowed; i++) allowedLog.current.push(now);
      allowedLog.current = allowedLog.current.filter((t) => t > now - windowMs * 2);
      const trailing = allowedLog.current.filter((t) => t > now - windowMs).length;
      setPeak((p) => Math.max(p, trailing));
    }

    // gauge reflects the algorithm's own notion of "how full am I"
    if (algo === "token-bucket") setGauge({ used: Math.round(limit - s.tokens), of: limit, label: "tokens spent" });
    else if (algo === "leaky-bucket") setGauge({ used: s.queue.length, of: limit, label: "queued" });
    else if (algo === "sliding-log") setGauge({ used: s.log.filter((t) => t > now - windowMs).length, of: limit, label: "in window" });
    else if (algo === "sliding-counter") {
      const overlap = 1 - (now - s.windowStart) / windowMs;
      setGauge({ used: Math.round(s.prevCount * overlap + s.count), of: limit, label: "weighted estimate" });
    } else setGauge({ used: s.count, of: limit, label: "in window" });
  }, [algo, arrivals, decide, limit, windowMs]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(step, 60);
    return () => window.clearInterval(id);
  }, [running, step]);

  const total = stats.allowed + stats.rejected;
  const allowRate = total ? (stats.allowed / total) * 100 : 0;
  const pct = gauge.of ? Math.min(100, (gauge.used / gauge.of) * 100) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-lg border border-border bg-surface p-4 text-sm">
        <label className="block">
          <span className="text-xs text-fg-muted">Algorithm</span>
          <select
            value={algo}
            onChange={(e) => {
              setAlgo(e.target.value as Algo);
              reset();
            }}
            className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2"
          >
            {(Object.keys(ALGO_LABEL) as Algo[]).map((a) => (
              <option key={a} value={a}>
                {ALGO_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="flex justify-between text-xs text-fg-muted">
            <span>Limit</span>
            <span className="font-mono">
              {limit} / {windowMs / 1000}s
            </span>
          </span>
          <input type="range" min={2} max={30} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </label>
        <label className="block">
          <span className="flex justify-between text-xs text-fg-muted">
            <span>Window</span>
            <span className="font-mono">{windowMs / 1000}s</span>
          </span>
          <input type="range" min={1000} max={5000} step={500} value={windowMs} onChange={(e) => setWindowMs(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </label>
        <label className="block">
          <span className="text-xs text-fg-muted">Arrival pattern</span>
          <select value={arrival} onChange={(e) => setArrival(e.target.value as Arrival)} className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2">
            <option value="bursty">Bursty at the window boundary</option>
            <option value="steady">Steady trickle</option>
            <option value="spike">Random spikes</option>
          </select>
        </label>
        <div className="flex gap-2 pt-1">
          <button onClick={() => setRunning((r) => !r)} className="h-9 flex-1 rounded-md bg-accent px-3 text-sm font-semibold text-accent-fg">
            {running ? "■ Pause" : "▶ Run"}
          </button>
          <button onClick={step} className="h-9 rounded-md border border-border px-3 text-sm text-fg-muted hover:text-fg">
            Step
          </button>
          <button onClick={reset} className="h-9 rounded-md border border-border px-3 text-sm text-fg-muted hover:text-fg">
            Reset
          </button>
        </div>
        <p className="text-xs text-fg-faint">
          Virtual clock: {(simTime / 1000).toFixed(1)}s simulated. Switching algorithm resets the state so comparisons are fair.
        </p>
      </aside>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Allowed" value={String(stats.allowed)} tone="ok" />
          <Stat label="Rejected (429)" value={String(stats.rejected)} tone={stats.rejected > 0 ? "danger" : undefined} />
          <Stat label="Allow rate" value={`${allowRate.toFixed(0)}%`} />
          <Stat
            label={`Peak per ${windowMs / 1000}s (limit ${limit})`}
            value={String(peak)}
            tone={peak > limit ? "danger" : peak > 0 ? "ok" : undefined}
          />
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between text-xs">
            <span className="font-mono uppercase tracking-wider text-fg-faint">{gauge.label}</span>
            <span className="font-mono text-fg">
              {gauge.used} / {gauge.of}
              {algo === "leaky-bucket" && <span className="ml-3 text-fg-faint">drained {drained}</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded bg-border">
            <div
              className={`h-full transition-[width] duration-150 ${pct >= 100 ? "bg-danger" : pct > 70 ? "bg-warn" : "bg-ok"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-fg-muted">{ALGO_NOTE[algo]}</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 font-mono text-xs uppercase tracking-wider text-fg-faint">Requests, oldest → newest</div>
          <div className="flex h-16 items-end gap-px" role="img" aria-label={`${stats.allowed} allowed and ${stats.rejected} rejected requests`}>
            {events.length === 0 && <span className="text-xs text-fg-faint">Press Run to send traffic.</span>}
            {events.map((e, i) => (
              <div
                key={i}
                title={`t=${(e.t / 1000).toFixed(1)}s · ${e.allowed ? "allowed" : "429"}`}
                className={`w-full min-w-[3px] rounded-sm ${e.allowed ? "h-full bg-ok/70" : "h-1/3 bg-danger/80"}`}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-fg-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-ok/70" /> allowed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-danger/80" /> rejected with 429
            </span>
          </div>
        </div>

        <p className="text-sm text-fg-muted">
          Watch the <strong>peak per window</strong> tile: it counts admitted requests in any trailing window, which is what the limit is supposed to
          cap. Run the bursty pattern on a fixed window and the peak reaches roughly twice the limit, because a clump before the boundary and a clump
          after it land in different counters. Switch to the sliding window counter or log and the peak settles at the limit. A token bucket admits the
          first burst deliberately and then throttles to the refill rate, so its peak is the bucket size plus what refilled during the burst. A leaky
          bucket admits into a queue and drains at a fixed rate — admissions still look bursty, but the <em>output</em> is flat and accepted requests
          wait their turn.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-fg";
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">{label}</div>
      <div className={`mt-1 font-mono text-xl tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
