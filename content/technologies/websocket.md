---
id: websocket
name: WebSocket
tagline: Persistent, full-duplex connection between browser and server over a single TCP socket
category: protocol
tags: [Protocol, Real-time, Networking, Full-duplex]
difficulty: 3
usedFor: [pub-sub, session]
prerequisites: [http, backend, session]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - session
  - websocket
  - pub-sub
  - load-balancing
  - redis
related:
  - { to: sse, rel: ALTERNATIVE_TO }
  - { to: http, rel: RELATED_TO }
  - { to: pub-sub, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: redis, rel: USED_WITH }
  - { to: authentication, rel: RELATED_TO }
  - { to: chat-system, rel: USED_IN }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "RFC 6455 / RFC 8441", confidence: high }
---

## TL;DR

WebSocket turns an ordinary HTTP request into a long-lived, two-way TCP connection.
After a one-time handshake, both the browser and the server can send small framed
messages at any moment without the request/response ceremony of
[HTTP](/concept/http). It is the standard transport when the client must *send* as
often as it receives — chat, multiplayer games, collaborative editors, live trading
screens. If data only flows server → client, [SSE](/technology/sse) is usually simpler.

## Practical

In a project WebSocket shows up as one endpoint (`/ws`) that the browser connects to
once, plus a message protocol *you* design on top of it (WebSocket carries opaque text
or binary frames — it has no notion of topics, acks or request ids).

What you will actually build:

- **A framing convention** — usually JSON `{ type, payload, id }`; binary (Protobuf,
  MessagePack) when bandwidth matters.
- **Authentication on connect** — browsers cannot set custom headers on the handshake,
  so the token goes in a cookie, a query parameter or the first message. See
  [Authentication](/concept/authentication).
- **Heartbeats** — ping/pong frames or an application-level `ping` every 20–30 s so
  proxies do not drop idle connections and the server can detect half-open sockets.
- **Reconnect with backoff** on the client, and *resume* logic (last seen message id)
  because a reconnect is a brand-new socket with no memory.
- **Fan-out between servers** — a user on server A sends to a room whose members sit on
  server B. The servers share a [Pub/Sub](/concept/pub-sub) channel, typically
  [Redis](/technology/redis) or a broker.

```ts
// Minimal server (Node, `ws` library) — a room broadcast
wss.on("connection", (socket, req) => {
  const user = authenticate(req);                     // cookie / query token
  socket.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "chat") redis.publish(`room:${msg.room}`, JSON.stringify({ user, ...msg }));
  });
  socket.on("close", () => presence.remove(user));
});
```

Operationally: WebSocket needs a [Load Balancer](/concept/load-balancing) and proxies
that speak HTTP/1.1 upgrade (or HTTP/2 extended CONNECT), long idle timeouts, and
capacity planning in *connections* rather than requests per second.

## Deep Dive

**The handshake is HTTP, the rest is not.** The client sends `GET /ws` with
`Upgrade: websocket` and a random `Sec-WebSocket-Key`; the server answers `101 Switching
Protocols` with a hash of that key. From then on the TCP connection carries WebSocket
frames (RFC 6455): a small header (opcode, length, mask) plus payload. Text and binary
frames, fragmentation, ping/pong and a close frame with a status code are all the
protocol offers. RFC 8441 lets a WebSocket ride inside a single HTTP/2 stream instead of
hijacking a whole TCP connection; support is uneven across proxies, so most production
deployments still use HTTP/1.1 upgrade.

**Connections are state.** An HTTP server is stateless between requests; a WebSocket
server holds a socket, a user identity, subscriptions and buffers for every client for
minutes or hours. Ten thousand idle connections cost roughly tens of kilobytes each in
kernel and user-space buffers — memory and file descriptors become the limits, not CPU.
Servers cannot be drained by simply stopping traffic: deploying a new version means
closing sockets and triggering a reconnect storm unless you drain gradually.

**Delivery is only as reliable as TCP — and TCP is not enough.** A frame that was
written before a network drop may or may not have arrived; the sender learns nothing.
Anything that must not be lost needs application-level acknowledgements, message ids and
a replay path (fetch missed messages over HTTP after reconnect). Ordering holds within one
socket, not across a reconnect.

**Backpressure.** A slow client (mobile in a tunnel) makes the server buffer outgoing
frames. Without per-connection limits one slow reader can exhaust memory. Check
`bufferedAmount`/socket buffer sizes and drop or close aggressively.

**Horizontal scaling** means the server a user is attached to is arbitrary; any state
the conversation needs must be in a shared store, and any message another server produces
has to be routed across. That is why WebSocket almost always arrives with Redis Pub/Sub
or a broker, and why "sticky" load balancing is convenient but not required once the
state lives elsewhere. See [Distributed System](/concept/distributed-system).

## Why

HTTP is request/response: the server can only speak when asked. For a chat room the
client would have to poll — ask "anything new?" every second — which multiplies load,
wastes battery and still delivers messages up to one interval late. Long polling hides
the delay but keeps a request open per client and tears it down after every message.

```sequence
title: Polling — the client asks, mostly for nothing
participants: Browser, API [backend], DB [postgresql]
Browser -> API: GET /messages?since=t (poll)
API -> DB: SELECT … new rows
DB --> API: none
API --> Browser: 200 [] (wasted)
Browser -> API: GET /messages?since=t (1 s later)
API -> DB: SELECT …
DB --> API: 1 row
API --> Browser: 200 [msg] (up to 1 s late)
```

With WebSocket the connection is opened once and both sides push frames the moment they
have something to say. No repeated headers, no empty responses, latency measured in
network round-trip time rather than poll interval.

```sequence
title: WebSocket — one connection, messages pushed both ways
participants: Browser, Chat server [websocket], Redis [redis]
Browser -> Chat server: GET /ws  Upgrade: websocket
Chat server --> Browser: 101 Switching Protocols
Browser -> Chat server: frame {type:"chat", text:"hi"}
Chat server -> Redis: PUBLISH room:42
Redis --> Chat server: message (from any server)
Chat server --> Browser: frame {type:"chat", …} (~RTT)
Browser -> Chat server: frame {type:"typing"}
```

## Advantages

- True bidirectional messaging: the client can push as freely as the server
- Low per-message overhead after the handshake — a few bytes of framing instead of full HTTP headers
- Latency bounded by network RTT, not by a poll interval
- Native in every browser (`new WebSocket(url)`) and every server platform; works through TLS on port 443
- Binary frames for compact payloads (game state, audio chunks, protobuf)
- One connection can multiplex many logical channels if your protocol defines them

## Trade-offs

- Stateful connections: memory, file descriptors and deploys all become harder than with stateless HTTP
- No built-in semantics — topics, acks, resume and request/response must be designed and tested by you
- Reconnects lose everything; every real app needs a replay path over plain HTTP
- Some corporate proxies and older load balancers mishandle upgrades or kill idle sockets
- Cannot use standard HTTP caching, CDNs or most HTTP middleware (auth headers, rate limiters)
- Browsers cannot set custom headers on the handshake, complicating token-based auth

## When to use

- Both sides send frequently: chat, collaborative editing, multiplayer games, live cursors
- Sub-second latency matters and messages are small and many
- A client keeps a long session with evolving subscriptions (trading screens, dashboards with user-driven filters)
- You need binary streaming to the browser (audio, telemetry) without HTTP request overhead

## When not to use

- Data only flows server → client (notifications, progress, LLM token streams) — [SSE](/technology/sse) is simpler and works with plain HTTP infrastructure
- Updates are rare (minutes apart): polling or push notifications cost less than an always-open socket
- You need guaranteed delivery and replay out of the box — a broker like [Kafka](/technology/kafka) or [RabbitMQ](/technology/rabbitmq) is the right layer, with WebSocket only as the last hop
- The environment cannot keep long connections (serverless functions with short timeouts, restrictive proxies)
- A plain REST call would do — do not tunnel request/response over a socket just because it is open

## Real-world

WebSocket is the browser-facing edge of the [Chat System](/architecture/chat-system):
each chat server holds thousands of sockets, persists messages to the database and uses
Redis Pub/Sub to reach users attached to other servers. In a
[Notification System](/architecture/notification-system) it is one delivery channel next
to mobile push and email, chosen for users who currently have the app open. The choice
between it and SSE is laid out in [WebSocket vs SSE](/compare/websocket-vs-sse).
