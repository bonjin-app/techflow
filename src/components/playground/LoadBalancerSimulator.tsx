"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePhone } from "@/lib/usePhone";

import { choose, type Algo } from "@/lib/balance";

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

/**
 * Where everything sits. The desktop drawing is 720 units wide with the
 * servers in one row; scaled to a phone that put their figures at 4px. On a
 * phone the drawing is 400 wide, servers wrap three to a row, and the text is
 * set larger, so every label renders at 8px or more.
 */
function layout(n: number, phone: boolean) {
  const W = phone ? 400 : 720;
  const perRow = phone ? 3 : 6;
  const rows = Math.ceil(n / perRow);
  const gap = phone ? 104 : 0;
  const server = (i: number) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const col = i - row * perRow;
    const spacing = phone ? (W - 20) / perRow : (W - 120) / Math.max(3, inRow);
    return { x: W / 2 + (col - (inRow - 1) / 2) * spacing, y: 270 + row * gap };
  };
  return {
    W,
    H: 360 + (rows - 1) * gap,
    client: (i: number) => W / 12 + i * (W / 6),
    server,
    box: phone ? 112 : 92,
    fs: (px: number) => (phone ? px * 1.2 : px),
  };
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
  const rr = useRef({ next: 0 });
  const pid = useRef(0);
  const serversRef = useRef(servers);
  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  const route = useCallback(
    (list: Server[], client: number): Server | undefined => choose(list, { algo, client, cursor: rr.current }),
    [algo],
  );


  const toggleHealth = useCallback((id: number) => {
    setServers((prev) => prev.map((p) => (p.id === id ? { ...p, healthy: !p.healthy } : p)));
  }, []);

  const send = useCallback(() => {
    const client = Math.floor(Math.random() * 6);
    const target = route(serversRef.current, client);
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
  }, [route]);

  useEffect(() => {
    if (!running) return;
    const idInt = window.setInterval(send, 1000 / rate);
    return () => window.clearInterval(idInt);
  }, [running, rate, send]);

  const total = servers.reduce((a, s) => a + s.total, 0) || 1;
  const phone = usePhone();
  const L = layout(servers.length, phone);

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
              rr.current = { next: 0 };
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
        <svg viewBox={`0 0 ${L.W} ${L.H}`} className="w-full" role="group" aria-label="Requests flowing from clients through a load balancer to servers">
          {/* clients */}
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i} transform={`translate(${L.client(i)} 30)`}>
              <circle r={10} fill="var(--surface-2)" stroke="var(--border-strong)" />
              <text y={26} textAnchor="middle" style={{ fontSize: L.fs(10) }} fill="var(--fg-faint)" className="font-mono">
                client {i}
              </text>
            </g>
          ))}
          {/* LB */}
          <g transform={`translate(${L.W / 2} 130)`}>
            <rect x={-70} y={-20} width={140} height={40} rx={8} fill="var(--surface-2)" stroke="var(--c-system-design)" strokeWidth={1.5} />
            <text textAnchor="middle" y={-2} style={{ fontSize: L.fs(12), fontWeight: 600 }} fill="var(--fg)">
              Load Balancer
            </text>
            <text textAnchor="middle" y={12} style={{ fontSize: L.fs(9) }} fill="var(--fg-faint)" className="font-mono">
              {algo}
            </text>
          </g>
          {Array.from({ length: 6 }, (_, i) => (
            <line key={i} x1={L.client(i)} y1={42} x2={L.W / 2} y2={110} stroke="var(--border)" />
          ))}
          {/* servers */}
          {servers.map((s, i) => {
            const { x, y } = L.server(i);
            const bw = L.box;
            const share = (s.total / total) * 100;
            return (
              <g
                key={s.id}
                transform={`translate(${x} ${y})`}
                onClick={() => toggleHealth(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleHealth(s.id);
                  }
                }}
                style={{ cursor: "pointer" }}
                role="button"
                tabIndex={0}
                aria-pressed={!s.healthy}
                aria-label={`Server ${s.id + 1}, currently ${s.healthy ? "healthy" : "down"}. Activate to toggle.`}
              >
                <line x1={L.W / 2 - x} y1={150 - y} x2={0} y2={-32} stroke={s.healthy ? "var(--border-strong)" : "var(--danger)"} strokeDasharray={s.healthy ? undefined : "4 4"} />
                <rect x={-bw / 2} y={-30} width={bw} height={60} rx={8} fill={s.healthy ? "var(--surface-2)" : "var(--danger)"} fillOpacity={s.healthy ? 1 : 0.12} stroke={s.healthy ? "var(--c-technology)" : "var(--danger)"} strokeWidth={1.5} />
                <text textAnchor="middle" y={-12} style={{ fontSize: L.fs(11), fontWeight: 600 }} fill="var(--fg)">
                  API {s.id + 1}
                </text>
                <text textAnchor="middle" y={3} style={{ fontSize: L.fs(9) }} fill="var(--fg-faint)" className="font-mono">
                  {s.healthy ? `${s.speed} ms · w${s.weight}` : "DOWN"}
                </text>
                <text textAnchor="middle" y={18} style={{ fontSize: L.fs(10) }} fill="var(--fg-muted)" className="font-mono">
                  {s.active} active · {share.toFixed(0)}%
                </text>
                {/* share bar */}
                <rect x={-bw / 2} y={38} width={bw} height={6} rx={3} fill="var(--border)" />
                <rect x={-bw / 2} y={38} width={(bw * share) / 100} height={6} rx={3} fill="var(--c-technology)" />
              </g>
            );
          })}
          {/* packets */}
          {packets.map((p) => {
            const s = servers.find((x) => x.id === p.server);
            if (!s) return null;
            const at = L.server(servers.indexOf(s));
            return <Packet key={p.id} from={{ x: L.client(p.client), y: 42 }} via={{ x: L.W / 2, y: 130 }} to={{ x: at.x, y: at.y - 30 }} duration={s.speed} />;
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
