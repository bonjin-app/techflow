"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Transport = "polling" | "long-polling" | "sse" | "websocket";

const LABEL: Record<Transport, string> = {
  polling: "Short polling",
  "long-polling": "Long polling",
  sse: "Server-Sent Events",
  websocket: "WebSocket",
};

const NOTE: Record<Transport, string> = {
  polling: "A request on a fixed timer. Most requests find nothing, and each one pays full HTTP request and response headers.",
  "long-polling": "The server holds the request open until it has something to say, then the client immediately reconnects. Delivery is prompt; every event costs a fresh request.",
  sse: "One long-lived HTTP response the server writes into. Framing is a few bytes per event, reconnection and Last-Event-ID are built into the browser.",
  websocket: "One upgraded connection, frames in both directions, a few bytes of framing per message. You implement reconnection and replay yourself.",
};

/** Illustrative byte costs — real numbers depend on your headers and cookies. */
const REQ_HEADER_BYTES = 480;
const RES_HEADER_BYTES = 220;
const HANDSHAKE_BYTES = 700;
const SSE_FRAME_BYTES = 12;
const WS_FRAME_BYTES = 6;
const PAYLOAD_BYTES = 90;

const TICK_MS = 100;
const LANE_TICKS = 90;

interface Lane {
  /** tick index → what happened, for the strip chart */
  marks: ("idle" | "poll-empty" | "deliver" | "open")[];
  bytes: number;
  requests: number;
  delivered: number;
  latencySum: number;
}

function freshLane(): Lane {
  return { marks: [], bytes: 0, requests: 0, delivered: 0, latencySum: 0 };
}

/**
 * Compares four ways to get server events to a browser, on the same event
 * stream: network cost, delivery latency and connection count. Simulated —
 * no server is contacted.
 */
export function TransportSimulator() {
  const [pollMs, setPollMs] = useState(1000);
  const [eventEveryMs, setEventEveryMs] = useState(1500);
  const [running, setRunning] = useState(false);
  const [simTime, setSimTime] = useState(0);
  const [lanes, setLanes] = useState<Record<Transport, Lane>>({
    polling: freshLane(),
    "long-polling": freshLane(),
    sse: freshLane(),
    websocket: freshLane(),
  });

  const clock = useRef(0);
  const pending = useRef<number[]>([]); // events waiting for the next poll
  const opened = useRef({ polling: 0, "long-polling": 0, sse: false, websocket: false });

  const reset = useCallback(() => {
    setRunning(false);
    clock.current = 0;
    pending.current = [];
    opened.current = { polling: 0, "long-polling": 0, sse: false, websocket: false };
    setSimTime(0);
    setLanes({ polling: freshLane(), "long-polling": freshLane(), sse: freshLane(), websocket: freshLane() });
  }, []);

  const step = useCallback(() => {
    const now = (clock.current += TICK_MS);
    setSimTime(now);
    const eventNow = now % eventEveryMs === 0;
    if (eventNow) pending.current.push(now);
    const pollNow = now % pollMs === 0;
    const waiting = pollNow ? pending.current.filter((t) => t <= now) : [];
    if (pollNow) pending.current = pending.current.filter((t) => t > now);

    // Decide connection openings here, not inside the updater: React can call an
    // updater more than once, which would double-count.
    const openLp = opened.current["long-polling"] === 0;
    const openSse = !opened.current.sse;
    const openWs = !opened.current.websocket;
    if (openLp) opened.current["long-polling"] = 1;
    if (openSse) opened.current.sse = true;
    if (openWs) opened.current.websocket = true;

    setLanes((prev) => {
      const next: Record<Transport, Lane> = {
        polling: { ...prev.polling, marks: [...prev.polling.marks] },
        "long-polling": { ...prev["long-polling"], marks: [...prev["long-polling"].marks] },
        sse: { ...prev.sse, marks: [...prev.sse.marks] },
        websocket: { ...prev.websocket, marks: [...prev.websocket.marks] },
      };

      // ── short polling: request on a timer, deliver whatever is waiting
      const p = next.polling;
      if (pollNow) {
        p.requests++;
        p.bytes += REQ_HEADER_BYTES + RES_HEADER_BYTES;
        if (waiting.length > 0) {
          p.delivered += waiting.length;
          p.bytes += waiting.length * PAYLOAD_BYTES;
          for (const t of waiting) p.latencySum += now - t;
          p.marks.push("deliver");
        } else {
          p.marks.push("poll-empty");
        }
      } else p.marks.push("idle");

      // ── long polling: connection is already waiting, so delivery is immediate,
      //    then the client reconnects (a new request per event)
      const lp = next["long-polling"];
      if (openLp) {
        lp.requests++;
        lp.bytes += REQ_HEADER_BYTES + RES_HEADER_BYTES;
        lp.marks.push("open");
      } else if (eventNow) {
        lp.delivered++;
        lp.bytes += PAYLOAD_BYTES;
        // response completes, client immediately opens the next request
        lp.requests++;
        lp.bytes += REQ_HEADER_BYTES + RES_HEADER_BYTES;
        lp.marks.push("deliver");
      } else lp.marks.push("idle");

      // ── SSE: one response, tiny framing per event
      const sse = next.sse;
      if (openSse) {
        sse.requests++;
        sse.bytes += REQ_HEADER_BYTES + RES_HEADER_BYTES;
        sse.marks.push("open");
      } else if (eventNow) {
        sse.delivered++;
        sse.bytes += PAYLOAD_BYTES + SSE_FRAME_BYTES;
        sse.marks.push("deliver");
      } else sse.marks.push("idle");

      // ── WebSocket: handshake once, then frames
      const ws = next.websocket;
      if (openWs) {
        ws.requests++;
        ws.bytes += HANDSHAKE_BYTES;
        ws.marks.push("open");
      } else if (eventNow) {
        ws.delivered++;
        ws.bytes += PAYLOAD_BYTES + WS_FRAME_BYTES;
        ws.marks.push("deliver");
      } else ws.marks.push("idle");

      for (const k of Object.keys(next) as Transport[]) {
        if (next[k].marks.length > LANE_TICKS) next[k].marks = next[k].marks.slice(-LANE_TICKS);
      }
      return next;
    });
  }, [eventEveryMs, pollMs]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(step, 50);
    return () => window.clearInterval(id);
  }, [running, step]);

  const order: Transport[] = ["polling", "long-polling", "sse", "websocket"];
  const maxBytes = Math.max(1, ...order.map((t) => lanes[t].bytes));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
        <label className="min-w-[190px] flex-1">
          <span className="flex justify-between text-xs text-fg-muted">
            <span>Server emits an event every</span>
            <span className="font-mono">{(eventEveryMs / 1000).toFixed(1)}s</span>
          </span>
          <input type="range" min={300} max={5000} step={100} value={eventEveryMs} onChange={(e) => setEventEveryMs(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </label>
        <label className="min-w-[190px] flex-1">
          <span className="flex justify-between text-xs text-fg-muted">
            <span>Client polls every</span>
            <span className="font-mono">{(pollMs / 1000).toFixed(1)}s</span>
          </span>
          <input type="range" min={200} max={5000} step={100} value={pollMs} onChange={(e) => setPollMs(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </label>
        <div className="flex gap-2">
          <button onClick={() => setRunning((r) => !r)} className="h-9 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg">
            {running ? "■ Pause" : "▶ Run"}
          </button>
          <button onClick={step} className="h-9 rounded-md border border-border px-3 text-sm text-fg-muted hover:text-fg">
            Step
          </button>
          <button onClick={reset} className="h-9 rounded-md border border-border px-3 text-sm text-fg-muted hover:text-fg">
            Reset
          </button>
        </div>
        <span className="font-mono text-xs text-fg-faint">t = {(simTime / 1000).toFixed(1)}s</span>
      </div>

      <div className="space-y-3">
        {order.map((t) => {
          const l = lanes[t];
          const avgLatency = l.delivered ? l.latencySum / l.delivered : 0;
          const kb = l.bytes / 1024;
          return (
            <div key={t} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{LABEL[t]}</h3>
                <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-fg-muted">
                  <span>
                    requests <span className="text-fg">{l.requests}</span>
                  </span>
                  <span>
                    delivered <span className="text-fg">{l.delivered}</span>
                  </span>
                  <span>
                    avg latency{" "}
                    <span className={avgLatency > 400 ? "text-warn" : "text-ok"}>{Math.round(avgLatency)} ms</span>
                  </span>
                  <span>
                    network <span className="text-fg">{kb.toFixed(1)} KB</span>
                  </span>
                </div>
              </div>

              <div className="mt-2 flex h-7 items-end gap-px" role="img" aria-label={`${LABEL[t]}: ${l.requests} requests, ${l.delivered} events delivered`}>
                {l.marks.map((m, i) => (
                  <div
                    key={i}
                    className={`w-full min-w-[2px] rounded-sm ${
                      m === "deliver" ? "h-full bg-ok/80" : m === "poll-empty" ? "h-1/2 bg-danger/60" : m === "open" ? "h-full bg-accent/70" : "h-[2px] bg-border-strong"
                    }`}
                  />
                ))}
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded bg-border">
                <div className="h-full bg-fg-muted/60 transition-[width] duration-150" style={{ width: `${(l.bytes / maxBytes) * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-fg-muted">{NOTE[t]}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-[11px] text-fg-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-ok/80" /> event delivered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-danger/60" /> poll returned nothing
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-accent/70" /> connection opened
        </span>
      </div>

      <p className="text-sm text-fg-muted">
        Byte counts are illustrative — roughly {REQ_HEADER_BYTES} bytes of request headers and {RES_HEADER_BYTES} of response headers per HTTP round
        trip, against {SSE_FRAME_BYTES} bytes of SSE framing or {WS_FRAME_BYTES} of WebSocket framing per message. Set the poll interval well below
        the event interval and short polling burns requests on empty responses; set it above and latency grows to half the interval on average. SSE
        and WebSocket both cost one connection and deliver immediately; the real choice between them is whether the client also needs to send.
      </p>
    </div>
  );
}
