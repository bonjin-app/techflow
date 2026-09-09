"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Algo = "round-robin" | "least-connections" | "random" | "ip-hash" | "weighted";

interface Server {
  id: number;
  weight: number;
  healthy: boolean;
  active: number;
  total: number;
  speed: number; // ms per request
}

interface Packet {
  id: number;
  server: number;
  t0: number;
  client: number;
}

function makeServers(n: number): Server[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, weight: i === 0 ? 3 : 1, healthy: true, active: 0, total: 0, speed: 600 + i * 250 }));
}

/**
 * Load balancer simulator: choose an algorithm, kill a server, change speeds,
 * and watch requests distribute. Purely client-side.
 */
export function LoadBalancerSimulator() {
  const [servers, setServers] = useState<Server[]>(() => makeServers(3));
  const [algo, setAlgo] = useState<Algo>("round-robin");
  const [rate, setRate] = useState(4); // req/s
  const [running, setRunning] = useState(false);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [rejected, setRejected] = useState(0);
  const rr = useRef(0);
  const pid = useRef(0);
  const serversRef = useRef(servers);
  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  const choose = useCallback(
    (list: Server[], client: number): Server | undefined => {
      const healthy = list.filter((s) => s.healthy);
      if (healthy.length === 0) return undefined;
      switch (algo) {
        case "round-robin":
          return healthy[rr.current++ % healthy.length];
        case "least-connections":
          return healthy.reduce((m, s) => (s.active < m.active ? s : m));
        case "random":
          return healthy[Math.floor(Math.random() * healthy.length)];
        case "ip-hash":
          return healthy[client % healthy.length];
        case "weighted": {
          const total = healthy.reduce((a, s) => a + s.weight, 0);
          let r = Math.random() * total;
          for (const s of healthy) {
            r -= s.weight;
            if (r <= 0) return s;
          }
          return healthy[healthy.length - 1];
        }
      }
    },
    [algo],
  );

  const send = useCallback(() => {
    const client = Math.floor(Math.random() * 6);
    const target = choose(serversRef.current, client);
    if (!target) {
      setRejected((r) => r + 1);
      return;
    }
    const id = ++pid.current;
    const t0 = performance.now();
    setServers((prev) => prev.map((s) => (s.id === target.id ? { ...s, active: s.active + 1, total: s.total + 1 } : s)));
    setPackets((p) => [...p, { id, server: target.id, t0, client }]);
    window.setTimeout(() => {
      setPackets((p) => p.filter((x) => x.id !== id));
      setServers((prev) => prev.map((s) => (s.id === target.id ? { ...s, active: Math.max(0, s.active - 1) } : s)));
    }, target.speed);
  }, [choose]);

  useEffect(() => {
    if (!running) return;
    const idInt = window.setInterval(send, 1000 / rate);
    return () => window.clearInterval(idInt);
  }, [running, rate, send]);

  const total = servers.reduce((a, s) => a + s.total, 0) || 1;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-lg border border-border bg-surface p-4 text-sm">
        <label className="block">
          <span className="text-xs text-fg-muted">Algorithm</span>
          <select value={algo} onChange={(e) => setAlgo(e.target.value as Algo)} className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2">
            <option value="round-robin">Round robin</option>
            <option value="least-connections">Least connections</option>
            <option value="weighted">Weighted (server 1 = 3×)</option>
            <option value="random">Random</option>
            <option value="ip-hash">IP hash (sticky)</option>
          </select>
        </label>
        <label className="block">
          <span className="flex justify-between text-xs text-fg-muted">
            <span>Request rate</span>
            <span className="font-mono">{rate} req/s</span>
          </span>
          <input type="range" min={1} max={20} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </label>
        <div className="flex gap-2">
          <button onClick={() => setRunning((r) => !r)} className="h-9 flex-1 rounded-md bg-accent px-3 text-sm font-semibold text-accent-fg">
            {running ? "■ Pause" : "▶ Run"}
          </button>
          <button onClick={() => setServers((s) => (s.length < 6 ? [...s, { id: s.length, weight: 1, healthy: true, active: 0, total: 0, speed: 600 + s.length * 250 }] : s))} className="h-9 rounded-md border border-border px-3 text-sm text-fg-muted hover:text-fg" aria-label="Add server">
            + server
          </button>
          <button
            onClick={() => {
              setServers(makeServers(servers.length));
              setPackets([]);
              setRejected(0);
              rr.current = 0;
            }}
            className="h-9 rounded-md border border-border px-3 text-sm text-fg-muted hover:text-fg"
          >
            Reset
          </button>
        </div>
        <p className="text-xs text-fg-faint">Click a server to take it down. Slower servers (higher ms) show why least-connections beats round robin under uneven capacity. IP hash keeps a client on one server — useful for sessions, bad for balance.</p>
        {rejected > 0 && <p className="text-xs text-danger">{rejected} requests rejected (no healthy server).</p>}
      </aside>

      <div className="rounded-lg border border-border bg-surface p-4">
        <svg viewBox="0 0 720 360" className="w-full" role="img" aria-label="Requests flowing from clients through a load balancer to servers">
          {/* clients */}
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i} transform={`translate(${60 + i * 120} 30)`}>
              <circle r={10} fill="var(--surface-2)" stroke="var(--border-strong)" />
              <text y={26} textAnchor="middle" style={{ fontSize: 10 }} fill="var(--fg-faint)" className="font-mono">
                client {i}
              </text>
            </g>
          ))}
          {/* LB */}
          <g transform="translate(360 130)">
            <rect x={-70} y={-20} width={140} height={40} rx={8} fill="var(--surface-2)" stroke="var(--c-system-design)" strokeWidth={1.5} />
            <text textAnchor="middle" y={-2} style={{ fontSize: 12, fontWeight: 600 }} fill="var(--fg)">
              Load Balancer
            </text>
            <text textAnchor="middle" y={12} style={{ fontSize: 9 }} fill="var(--fg-faint)" className="font-mono">
              {algo}
            </text>
          </g>
          {Array.from({ length: 6 }, (_, i) => (
            <line key={i} x1={60 + i * 120} y1={42} x2={360} y2={110} stroke="var(--border)" />
          ))}
          {/* servers */}
          {servers.map((s, i) => {
            const n = servers.length;
            const x = 360 + (i - (n - 1) / 2) * (600 / Math.max(3, n));
            const share = (s.total / total) * 100;
            return (
              <g key={s.id} transform={`translate(${x} 270)`} onClick={() => setServers((prev) => prev.map((p) => (p.id === s.id ? { ...p, healthy: !p.healthy } : p)))} style={{ cursor: "pointer" }} role="button" aria-label={`Server ${s.id + 1} ${s.healthy ? "healthy" : "down"}`}>
                <line x1={360 - x} y1={-120} x2={0} y2={-32} stroke={s.healthy ? "var(--border-strong)" : "var(--danger)"} strokeDasharray={s.healthy ? undefined : "4 4"} />
                <rect x={-46} y={-30} width={92} height={60} rx={8} fill={s.healthy ? "var(--surface-2)" : "var(--danger)"} fillOpacity={s.healthy ? 1 : 0.12} stroke={s.healthy ? "var(--c-technology)" : "var(--danger)"} strokeWidth={1.5} />
                <text textAnchor="middle" y={-12} style={{ fontSize: 11, fontWeight: 600 }} fill="var(--fg)">
                  API {s.id + 1}
                </text>
                <text textAnchor="middle" y={3} style={{ fontSize: 9 }} fill="var(--fg-faint)" className="font-mono">
                  {s.healthy ? `${s.speed} ms · w${s.weight}` : "DOWN"}
                </text>
                <text textAnchor="middle" y={18} style={{ fontSize: 10 }} fill="var(--fg-muted)" className="font-mono">
                  {s.active} active · {share.toFixed(0)}%
                </text>
                {/* share bar */}
                <rect x={-46} y={38} width={92} height={6} rx={3} fill="var(--border)" />
                <rect x={-46} y={38} width={(92 * share) / 100} height={6} rx={3} fill="var(--c-technology)" />
              </g>
            );
          })}
          {/* packets */}
          {packets.map((p) => {
            const s = servers.find((x) => x.id === p.server);
            if (!s) return null;
            const n = servers.length;
            const sx = 360 + (servers.indexOf(s) - (n - 1) / 2) * (600 / Math.max(3, n));
            return <Packet key={p.id} from={{ x: 60 + p.client * 120, y: 42 }} via={{ x: 360, y: 130 }} to={{ x: sx, y: 240 }} duration={s.speed} />;
          })}
        </svg>
      </div>
    </div>
  );
}

function Packet({ from, via, to, duration }: { from: { x: number; y: number }; via: { x: number; y: number }; to: { x: number; y: number }; duration: number }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / Math.min(duration, 900));
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);
  const seg = p < 0.5 ? p * 2 : (p - 0.5) * 2;
  const a = p < 0.5 ? from : via;
  const b = p < 0.5 ? via : to;
  const x = a.x + (b.x - a.x) * seg;
  const y = a.y + (b.y - a.y) * seg;
  return <circle cx={x} cy={y} r={4} fill="var(--accent)" opacity={p >= 1 ? 0 : 1} />;
}
