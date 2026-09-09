---
id: sse
name: Server-Sent Events (SSE)
tagline: One-way server-to-browser event stream over a plain, long-lived HTTP response
category: protocol
tags: [Protocol, Real-time, Networking, Streaming]
difficulty: 2
usedFor: [pub-sub]
prerequisites: [http, backend]
learningPath:
  - programming-fundamentals
  - http
  - rest
  - backend
  - sse
  - websocket
  - pub-sub
related:
  - { to: websocket, rel: ALTERNATIVE_TO }
  - { to: http, rel: RELATED_TO }
  - { to: pub-sub, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: redis, rel: USED_WITH }
  - { to: notification-system, rel: USED_IN }
  - { to: ai-rag, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "WHATWG HTML Living Standard (EventSource)", confidence: high }
---

## TL;DR

Server-Sent Events is the simplest way to push data from a server to a browser: the
client makes a normal `GET`, the server never closes the response and writes small text
events (`data: …\n\n`) whenever it has something new. The browser's built-in
`EventSource` reconnects on its own and tells the server the last event id it saw.
It is strictly one-directional — the client still uses ordinary HTTP requests to talk
back — which is exactly enough for notifications, progress bars, live feeds and streamed
LLM responses.

## Practical

SSE needs no special server; any framework that can flush a response incrementally can
serve it. The response has `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
and consists of lines: `id:`, `event:`, `data:`, `retry:`, separated by a blank line.

What you will actually build:

- **An event endpoint** per stream (`/events`, `/jobs/123/progress`) that subscribes to
  an internal source — a [Pub/Sub](/concept/pub-sub) channel, a queue, a database
  change feed — and forwards events as they arrive.
- **Event ids** so the browser can send `Last-Event-ID` on reconnect and you can replay
  what it missed from a short buffer (a [Redis](/technology/redis) stream or list is common).
- **Keep-alive comments** (`: ping\n\n`) every 15–30 s so proxies and load balancers do
  not time out the idle response.
- **Client-side handlers** with `EventSource` — `onmessage`, named events via
  `addEventListener("order.updated", …)`, `onerror`. Reconnect is automatic.
- **Writes go elsewhere**: the client `POST`s over regular [REST](/concept/rest).

```ts
// Express-style handler — stream job progress
app.get("/jobs/:id/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const unsubscribe = bus.subscribe(`job:${req.params.id}`, (evt) => {
    res.write(`id: ${evt.seq}\nevent: progress\ndata: ${JSON.stringify(evt)}\n\n`);
  });
  const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
  req.on("close", () => { clearInterval(ping); unsubscribe(); });
});
```

Operationally SSE behaves like a very slow HTTP response: it passes through TLS, most
proxies and API gateways unchanged, but response buffering (some CDNs, gzip middleware,
reverse proxies with `proxy_buffering on`) must be disabled for the path.

## Deep Dive

**It is just HTTP.** There is no new protocol layer. That is why SSE works with HTTP
authentication headers (through `fetch`-based clients), cookies, standard logging,
and any [Load Balancer](/concept/load-balancing) that supports long responses. The cost
is that each event carries the small overhead of text framing and the stream is
UTF-8 text only — binary data must be base64-encoded or fetched separately.

**Connection limits under HTTP/1.1.** Browsers cap connections per origin at about six.
With HTTP/1.1, an SSE stream occupies one of them permanently, so an app that opens a
stream per tab or per widget starves its own requests. Over HTTP/2 or HTTP/3 the stream
is one multiplexed stream among many on a single connection and the limit effectively
disappears — in practice SSE should be served over HTTP/2.

**Reconnect semantics are built in but not free.** `EventSource` retries after
`retry:` milliseconds (default around 3 s) and sends `Last-Event-ID`. The server has
to be able to answer "everything since id X" — which means buffering recent events
somewhere shared, because the reconnect may land on a different server behind the
balancer. Without that buffer the reconnect silently drops events.

**The native client has gaps.** `EventSource` cannot set custom headers or use `POST`.
Many teams use a small fetch-based SSE parser instead, which allows `Authorization`
headers and request bodies (this is how most LLM chat UIs consume streamed tokens).
Server-side, each open stream is a held connection with the same file descriptor and
memory concerns as a WebSocket, just without inbound traffic.

**Ordering and delivery.** Events on one connection arrive in order. Across a reconnect
you get "at least what I buffered", not exactly-once; make handlers idempotent by id.
See [Idempotency](/concept/idempotency).

## Why

Any UI that shows "something is happening on the server" — an export being generated,
an order changing state, a long answer being composed — either polls or gets pushed.
Polling wastes requests and adds up to one interval of delay; opening a full
[WebSocket](/technology/websocket) for a one-way feed adds protocol design, connection
management and infrastructure exceptions for nothing.

```steps
title: Before — polling for job progress
Browser asks GET /jobs/123 every 2 s | most responses say "still running"
API queries the database each time | load scales with clients × frequency
Job finishes between polls | user sees it up to 2 s late
Client logic manages timers, backoff and tab visibility | complexity lives in every page
```

With SSE the server keeps the response open and writes each progress event as it
happens. The browser handles reconnects; the API queries nothing until there is news.

```sequence
title: After — SSE stream pushed as the job progresses
participants: Browser, API [backend], Worker, Redis [redis]
Browser -> API: GET /jobs/123/events (Accept: text/event-stream)
API --> Browser: 200 (headers, stream open)
Worker -> Redis: PUBLISH job:123 {pct: 40}
Redis --> API: message
API --> Browser: id: 7  data: {pct: 40}
Worker -> Redis: PUBLISH job:123 {done: true}
Redis --> API: message
API --> Browser: id: 8  event: done
```

Because the same trick works for any stream of small text events, SSE is also how most
AI chat products deliver tokens as the model produces them.

## Advantages

- Plain HTTP: no handshake, no new protocol, works through existing proxies, TLS and auth
- Built-in reconnect and `Last-Event-ID` resume in every browser via `EventSource`
- Trivial to implement on the server — write lines, flush, keep the response open
- Text framing is human-readable and easy to debug with `curl`
- Efficient over HTTP/2: many streams share one connection
- Natural fit for streaming partial results (progress, logs, LLM tokens, live scores)

## Trade-offs

- One direction only; client → server traffic needs separate requests
- Text only — binary payloads must be encoded or fetched out of band
- Under HTTP/1.1 each stream consumes one of the browser's ~6 connections per origin
- Response buffering anywhere in the path (proxy, CDN, compression middleware) breaks it silently
- Resume after reconnect requires a shared event buffer you must build and expire
- Native `EventSource` cannot send custom headers or a body; a fetch-based client is often needed

## When to use

- Server → client updates: notifications, dashboards, order status, build logs
- Streaming a long response incrementally — LLM token streams, search results as they arrive
- Progress for background jobs after a `POST` kicked them off
- You want real-time behaviour with the least operational change to an HTTP stack
- Clients are browsers or HTTP libraries and the message volume is modest

## When not to use

- The client must send frequent, low-latency messages (chat input, game moves, cursors) — use [WebSocket](/technology/websocket)
- Payloads are binary or large — SSE framing and base64 make that awkward
- Your stack is stuck on HTTP/1.1 and pages need several concurrent streams
- Infrastructure between server and client buffers responses and cannot be configured otherwise
- Delivery guarantees matter more than simplicity — put a broker like [RabbitMQ](/technology/rabbitmq) or [Kafka](/technology/kafka) behind it and treat SSE only as the last hop

## Real-world

SSE is the in-app channel of a [Notification System](/architecture/notification-system):
the browser opens one stream per session and the API forwards events published by
back-end services through Redis or a broker. In an [AI RAG](/architecture/ai-rag)
application it is the usual way to stream generated tokens and citations to the UI
while the model is still running. When the client also needs to talk back frequently,
the comparison [WebSocket vs SSE](/compare/websocket-vs-sse) shows where the line falls.
