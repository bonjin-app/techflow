/**
 * What each way of pushing events to a browser costs on the wire, as a pure
 * function — the playground's central claim is quantitative ("most polls find
 * nothing and each one pays full headers"), and a number the reader is invited
 * to compare should be a number a test can check.
 *
 * The byte figures are illustrative: real headers depend on your cookies.
 * What has to be right is the *shape* — which transports pay per request,
 * which pay once and then per frame.
 */
export type Transport = "polling" | "long-polling" | "sse" | "websocket";

/** What happened to this transport on this tick. */
export type Moment = "open" | "deliver" | "poll-empty";

export const BYTES = {
  reqHeader: 480,
  resHeader: 220,
  handshake: 700,
  sseFrame: 12,
  wsFrame: 6,
  payload: 90,
} as const;

export interface Cost {
  bytes: number;
  requests: number;
  delivered: number;
}

const NOTHING: Cost = { bytes: 0, requests: 0, delivered: 0 };
const roundTrip = BYTES.reqHeader + BYTES.resHeader;

/**
 * The cost of one moment. `events` is how many events were waiting — only
 * short polling can deliver more than one at a time, because it is the only
 * transport that lets them queue up between requests.
 */
export function cost(transport: Transport, moment: Moment, events = 1): Cost {
  switch (transport) {
    case "polling":
      // A poll pays headers whether or not anything is waiting. That is the
      // whole argument against it at a low event rate.
      if (moment === "poll-empty") return { bytes: roundTrip, requests: 1, delivered: 0 };
      if (moment === "deliver") return { bytes: roundTrip + events * BYTES.payload, requests: 1, delivered: events };
      return NOTHING;
    case "long-polling":
      // The connection is already open, so delivery is immediate — but the
      // client must reconnect afterwards, which is another full round trip.
      if (moment === "open") return { bytes: roundTrip, requests: 1, delivered: 0 };
      if (moment === "deliver") return { bytes: BYTES.payload + roundTrip, requests: 1, delivered: 1 };
      return NOTHING;
    case "sse":
      // Headers once, then a few bytes of framing per event.
      if (moment === "open") return { bytes: roundTrip, requests: 1, delivered: 0 };
      if (moment === "deliver") return { bytes: BYTES.payload + BYTES.sseFrame, requests: 0, delivered: 1 };
      return NOTHING;
    case "websocket":
      if (moment === "open") return { bytes: BYTES.handshake, requests: 1, delivered: 0 };
      if (moment === "deliver") return { bytes: BYTES.payload + BYTES.wsFrame, requests: 0, delivered: 1 };
      return NOTHING;
  }
}

export function add(a: Cost, b: Cost): Cost {
  return { bytes: a.bytes + b.bytes, requests: a.requests + b.requests, delivered: a.delivered + b.delivered };
}
