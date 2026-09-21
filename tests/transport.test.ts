import { describe, expect, it } from "vitest";
import { add, BYTES, cost, type Transport } from "@/lib/transport";

/** One open, then `events` events, with `emptyPolls` wasted polls in between. */
function session(t: Transport, events: number, emptyPolls = 0) {
  let total = cost(t, "open");
  if (t === "polling") total = { bytes: 0, requests: 0, delivered: 0 };
  for (let i = 0; i < emptyPolls; i++) total = add(total, cost(t, "poll-empty"));
  for (let i = 0; i < events; i++) total = add(total, cost(t, "deliver"));
  return total;
}

describe("the claims the transport playground makes", () => {
  it("a poll that finds nothing still pays full headers — the argument against polling", () => {
    const empty = cost("polling", "poll-empty");
    expect(empty.bytes).toBe(BYTES.reqHeader + BYTES.resHeader);
    expect(empty.delivered).toBe(0);
    // Every other transport spends nothing when there is nothing to send.
    for (const t of ["long-polling", "sse", "websocket"] as Transport[]) {
      expect(cost(t, "poll-empty"), t).toMatchObject({ bytes: 0, requests: 0 });
    }
  });

  it("SSE and WebSocket pay headers once, then only framing", () => {
    for (const t of ["sse", "websocket"] as Transport[]) {
      expect(cost(t, "open").requests, t).toBe(1);
      expect(cost(t, "deliver").requests, t).toBe(0); // no further requests, ever
      expect(cost(t, "deliver").bytes, t).toBeLessThan(BYTES.payload * 2);
    }
  });

  it("long polling pays a round trip per event, because it must reconnect", () => {
    expect(cost("long-polling", "deliver").requests).toBe(1);
    expect(cost("long-polling", "deliver").bytes).toBeGreaterThan(BYTES.reqHeader);
  });

  it("at a low event rate polling costs an order of magnitude more than a socket", () => {
    // 60 polls, 3 of which find something.
    const polling = session("polling", 3, 57);
    const ws = session("websocket", 3);
    const sse = session("sse", 3);
    expect(polling.bytes).toBeGreaterThan(ws.bytes * 10);
    expect(polling.bytes).toBeGreaterThan(sse.bytes * 10);
    // and all three delivered exactly the same events
    expect([polling.delivered, ws.delivered, sse.delivered]).toEqual([3, 3, 3]);
  });

  it("the ordering the page teaches holds at every event count it is run at", () => {
    for (const events of [1, 10, 100, 1000]) {
      // Three wasted polls per event — the low-rate regime the page describes.
      // At exactly one wasted poll per event the two are equal, because polling
      // is then doing precisely long polling's work.
      const polling = session("polling", events, events * 3);
      const longPolling = session("long-polling", events);
      const sse = session("sse", events);
      const ws = session("websocket", events);
      expect(ws.bytes, `${events}`).toBeLessThan(sse.bytes);
      expect(sse.bytes, `${events}`).toBeLessThan(longPolling.bytes);
      expect(longPolling.bytes, `${events}`).toBeLessThan(polling.bytes);
    }
  });

  it("short polling is the only transport that can deliver a batch", () => {
    const batch = cost("polling", "deliver", 5);
    expect(batch.delivered).toBe(5);
    expect(batch.requests).toBe(1); // five events, one request
    // The others deliver as events arrive, so a batch is not theirs to have.
    for (const t of ["long-polling", "sse", "websocket"] as Transport[]) {
      expect(cost(t, "deliver", 5).delivered, t).toBe(1);
    }
  });

  it("every transport delivers the payload it was given", () => {
    for (const t of ["polling", "long-polling", "sse", "websocket"] as Transport[]) {
      expect(cost(t, "deliver").bytes, t).toBeGreaterThanOrEqual(BYTES.payload);
    }
  });
});
