"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Policy = "lru" | "lfu" | "fifo";
type Pattern = "zipf" | "uniform" | "scan";

interface Slot {
  key: number;
  hits: number;
  at: number;
  expires: number;
}

interface Stats {
  requests: number;
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  dbMs: number;
  cacheMs: number;
}

const KEYS = 40;
const DB_LATENCY = 20;
const CACHE_LATENCY = 0.3;

function pick(pattern: Pattern, tick: number): number {
  if (pattern === "uniform") return Math.floor(Math.random() * KEYS);
  if (pattern === "scan") return tick % KEYS;
  // Zipf-ish: rank ~ 1/x
  const r = Math.random();
  return Math.min(KEYS - 1, Math.floor(Math.pow(r, 3) * KEYS));
}

/**
 * Cache simulator: watch hit ratio respond to capacity, eviction policy,
 * access pattern and TTL. Everything runs in the browser.
 */
export function CacheSimulator() {
  const [capacity, setCapacity] = useState(8);
  const [policy, setPolicy] = useState<Policy>("lru");
  const [pattern, setPattern] = useState<Pattern>("zipf");
  const [ttl, setTtl] = useState(60); // in ticks; 0 = none
  const [running, setRunning] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [stats, setStats] = useState<Stats>({ requests: 0, hits: 0, misses: 0, evictions: 0, expirations: 0, dbMs: 0, cacheMs: 0 });
  const [last, setLast] = useState<{ key: number; hit: boolean } | null>(null);
  const [history, setHistory] = useState<boolean[]>([]);
  const tickRef = useRef(0);
  const slotsRef = useRef<Slot[]>([]);

  const reset = useCallback(() => {
    setRunning(false);
    slotsRef.current = [];
    tickRef.current = 0;
    setSlots([]);
    setStats({ requests: 0, hits: 0, misses: 0, evictions: 0, expirations: 0, dbMs: 0, cacheMs: 0 });
    setLast(null);
    setHistory([]);
  }, []);

  const step = useCallback(() => {
    const t = ++tickRef.current;
    const key = pick(pattern, t);
    let s = slotsRef.current;
    let expirations = 0;
    if (ttl > 0) {
      const before = s.length;
      s = s.filter((x) => x.expires > t);
      expirations = before - s.length;
    }
    const found = s.find((x) => x.key === key);
    let hit = false;
    let evictions = 0;
    if (found) {
      hit = true;
      found.hits++;
      found.at = t;
    } else {
      if (s.length >= capacity) {
        let victim = 0;
        if (policy === "lru") victim = s.reduce((m, x, i) => (x.at < s[m].at ? i : m), 0);
        else if (policy === "lfu") victim = s.reduce((m, x, i) => (x.hits < s[m].hits || (x.hits === s[m].hits && x.at < s[m].at) ? i : m), 0);
        else victim = 0; // fifo → oldest inserted is first
        s.splice(victim, 1);
        evictions = 1;
      }
      s.push({ key, hits: 0, at: t, expires: ttl > 0 ? t + ttl : Infinity });
    }
    slotsRef.current = s;
    setSlots([...s]);
    setLast({ key, hit });
    setHistory((h) => [...h.slice(-59), hit]);
    setStats((p) => ({
      requests: p.requests + 1,
      hits: p.hits + (hit ? 1 : 0),
      misses: p.misses + (hit ? 0 : 1),
      evictions: p.evictions + evictions,
      expirations: p.expirations + expirations,
      dbMs: p.dbMs + (hit ? 0 : DB_LATENCY),
      cacheMs: p.cacheMs + CACHE_LATENCY,
    }));
  }, [capacity, pattern, policy, ttl]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(step, 120);
    return () => window.clearInterval(id);
  }, [running, step]);

  const ratio = stats.requests ? (stats.hits / stats.requests) * 100 : 0;
  const avg = stats.requests ? (stats.dbMs + stats.cacheMs) / stats.requests : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-lg border border-border bg-surface p-4 text-sm">
        <label className="block">
          <span className="flex justify-between text-xs text-fg-muted">
            <span>Capacity</span>
            <span className="font-mono">{capacity} / {KEYS} keys</span>
          </span>
          <input type="range" min={1} max={KEYS} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </label>
        <label className="block">
          <span className="text-xs text-fg-muted">Eviction policy</span>
          <select value={policy} onChange={(e) => setPolicy(e.target.value as Policy)} className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2">
            <option value="lru">LRU — least recently used</option>
            <option value="lfu">LFU — least frequently used</option>
            <option value="fifo">FIFO — oldest inserted</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-fg-muted">Access pattern</span>
          <select value={pattern} onChange={(e) => setPattern(e.target.value as Pattern)} className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2">
            <option value="zipf">Zipf — a few hot keys (real traffic)</option>
            <option value="uniform">Uniform — every key equally likely</option>
            <option value="scan">Sequential scan — worst case for LRU</option>
          </select>
        </label>
        <label className="block">
          <span className="flex justify-between text-xs text-fg-muted">
            <span>TTL</span>
            <span className="font-mono">{ttl === 0 ? "none" : `${ttl} ticks`}</span>
          </span>
          <input type="range" min={0} max={200} step={10} value={ttl} onChange={(e) => setTtl(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
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
        <p className="text-xs text-fg-faint">DB read = {DB_LATENCY} ms, cache read = {CACHE_LATENCY} ms (illustrative).</p>
      </aside>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Hit ratio" value={`${ratio.toFixed(1)}%`} tone={ratio > 80 ? "ok" : ratio > 50 ? "warn" : "danger"} />
          <Stat label="Avg latency" value={`${avg.toFixed(1)} ms`} />
          <Stat label="DB reads" value={String(stats.misses)} />
          <Stat label="Evictions · expiries" value={`${stats.evictions} · ${stats.expirations}`} />
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
            <span className="font-mono uppercase tracking-wider">Cache slots</span>
            {last && (
              <span className={last.hit ? "text-ok" : "text-danger"}>
                key {last.key} → {last.hit ? "HIT" : "MISS → database"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: capacity }, (_, i) => {
              const s = slots[i];
              const isLast = s && last && s.key === last.key;
              return (
                <div
                  key={i}
                  className={`flex h-12 w-12 flex-col items-center justify-center rounded-md border font-mono text-[11px] transition-colors ${
                    s ? (isLast ? (last!.hit ? "border-ok bg-ok/10" : "border-danger bg-danger/10") : "border-border-strong bg-surface-2") : "border-dashed border-border text-fg-faint"
                  }`}
                  title={s ? `key ${s.key} · ${s.hits} hits · last used t${s.at}` : "empty"}
                >
                  {s ? (
                    <>
                      <span className="font-semibold">{s.key}</span>
                      <span className="text-[9px] text-fg-faint">{s.hits}×</span>
                    </>
                  ) : (
                    "·"
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 font-mono text-xs uppercase tracking-wider text-fg-faint">Last 60 requests</div>
          <div className="flex h-8 items-end gap-px">
            {history.map((h, i) => (
              <div key={i} className={`flex-1 rounded-sm ${h ? "h-full bg-ok/70" : "h-1/2 bg-danger/70"}`} />
            ))}
          </div>
        </div>

        <p className="text-sm text-fg-muted">
          Try: Zipf + LRU at capacity 8 gives a high hit ratio because hot keys stay resident. Switch to a sequential scan and watch LRU collapse —
          every key is evicted just before it is needed again. LFU protects genuinely hot keys from one-off scans. A short TTL trades hit ratio for
          freshness.
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
