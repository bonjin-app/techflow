---
id: websocket-vs-sse
name: WebSocket vs SSE
tagline: Two ways to push from server to browser — full duplex socket or a one-way HTTP stream
category: decision
tags: [Real-time, Networking, Protocol, Decision]
difficulty: 3
subjects: [websocket, sse]
related:
  - { to: http, rel: RELATED_TO }
  - { to: pub-sub, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: chat-system, rel: RELATED_TO }
  - { to: notification-system, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Both let a server push data to a browser without polling. [SSE](/technology/sse)
(Server-Sent Events) is an ordinary HTTP response that never ends: the server keeps writing
`data:` lines and the browser's `EventSource` parses them, reconnecting on its own if the
connection drops. [WebSocket](/technology/websocket) upgrades an HTTP connection into a raw
bidirectional socket where either side sends framed text or binary messages at any time.
If the client mostly *receives* (feeds, notifications, progress, streamed tokens), SSE is
simpler and rides on infrastructure you already have. If the client also *sends*
frequently (chat, games, collaborative editing), WebSocket avoids one extra HTTP request
per client message.

## Comparison

```compare
Feature                  | WebSocket                                          | SSE
Direction                | Full duplex — both sides send any time              | Server → client only; client uses normal requests
Transport                | Upgrades HTTP/1.1 to its own framed protocol         | Plain HTTP response with text/event-stream
Payload                  | Text and binary frames                              | UTF-8 text only (JSON, base64 for binary)
Reconnection             | You implement it, plus resume logic                 | Built into EventSource, with Last-Event-ID resume
Browser API              | new WebSocket(url), onmessage, send()               | new EventSource(url), onmessage, addEventListener
Custom request headers   | Not from the browser API (use cookies or a ticket)   | Not from EventSource either (cookies or query)
Proxies, CDNs, firewalls | Some intermediaries block or time out Upgrade        | Passes wherever streaming HTTP passes
HTTP/2 and HTTP/3        | Separate tunnelling; often stays on HTTP/1.1        | Multiplexed like any other HTTP stream
Connection limit         | One socket per tab, no per-origin HTTP cap          | HTTP/1.1 caps ~6 per origin; not an issue on HTTP/2
Server complexity        | Stateful connection handler and heartbeats           | Keep a response open and flush
```

## Decision

```decision
? Does the client send messages frequently over the same channel (chat, cursors, game input)?
  YES -> WebSocket [websocket]
  NO -> ? Is the pushed payload text such as JSON, and strictly server → client?
    YES -> ? Must it pass through proxies, CDNs and corporate networks with no special setup?
      YES -> SSE [sse]
      NO -> ? Is built-in reconnection and resume (Last-Event-ID) valuable to you?
        YES -> SSE [sse]
        NO -> WebSocket [websocket]
    NO -> WebSocket [websocket]
```

## When WebSocket

- Genuinely two-way traffic: chat, multiplayer, collaborative editing, live cursors, trading terminals.
- Binary payloads (audio chunks, protobuf, compressed deltas) where base64 over SSE would be wasteful.
- Very low-latency client → server messages where one HTTP request per message is too much overhead.
- You control the network path (mobile app, internal tool) and can tolerate extra infrastructure care.
- See the [Chat System](/architecture/chat-system) architecture for a typical deployment behind a load balancer.

## When SSE

- One-way updates: notification feeds, dashboards, build logs, order status, streamed LLM tokens.
- You want the browser to handle reconnection and pick up where it left off via `Last-Event-ID`.
- The path runs through CDNs, API gateways or corporate proxies that treat WebSocket Upgrade badly.
- HTTP/2 is available and you prefer one multiplexed connection over a second protocol.
- The server stack is request/response oriented and adding a stateful socket layer would be disproportionate.
- See the [Notification System](/architecture/notification-system) for SSE as the last hop to the browser.

## Deep Dive

**How each connection is established.** A WebSocket starts as an HTTP request carrying
`Upgrade: websocket`; after a `101 Switching Protocols` response the TCP connection stops
speaking HTTP and both sides exchange frames. Every hop in between — load balancer, reverse
proxy, CDN — must understand the Upgrade and keep the connection open indefinitely, which
is where most production trouble comes from (idle timeouts, sticky sessions, missing
`Connection: upgrade` forwarding).

```sequence
title: WebSocket — one upgrade, then messages flow both ways
participants: Browser [websocket], LB [load-balancing], Server [backend]
Browser -> LB: GET /ws  Upgrade: websocket
LB -> Server: forward Upgrade
Server --> Browser: 101 Switching Protocols
Browser -> Server: frame {"type":"join","room":42}
Server -> Browser: frame {"user":"ana","text":"hi"}
Browser -> Server: frame {"text":"hello"}
Server -> Browser: frame {"typing":"ana"}
Browser -> Server: ping
Server --> Browser: pong
```

SSE never leaves HTTP. The client issues a normal `GET` with `Accept: text/event-stream`;
the server responds `200` with that content type and simply does not close the response.
Each event is a block of `event:`, `id:` and `data:` lines ending in a blank line. If the
connection drops, `EventSource` waits (the server can suggest a delay with `retry:`) and
reconnects, sending the last `id` it saw so the server can replay what was missed.

```sequence
title: SSE — one long GET, server pushes, client reconnects with Last-Event-ID
participants: Browser [sse], LB [load-balancing], Server [backend]
Browser -> LB: GET /events  Accept: text/event-stream
LB -> Server: forward
Server --> Browser: 200 OK  Content-Type: text/event-stream
Server -> Browser: id: 101  data: {"order":"packed"}
Server -> Browser: id: 102  data: {"order":"shipped"}
Server --> Browser: (connection lost)
Browser -> LB: GET /events  Last-Event-ID: 102
LB -> Server: forward
Server -> Browser: id: 103  data: {"order":"delivered"}
```

**Client → server on SSE.** Nothing stops an SSE client from talking back — it uses
ordinary `fetch`/`POST` requests. That is fine for occasional actions (mark as read,
acknowledge) and awkward for a stream of small messages, because each carries full HTTP
headers and its own request lifecycle.

**Scaling out.** Both hold one connection per client open for a long time, so both push
you towards many stateless connection servers behind a load balancer and a shared
[Pub/Sub](/concept/pub-sub) layer (often [Redis](/technology/redis)) to reach a user
connected elsewhere. The fan-out problem is identical; only the last hop differs.

**Heartbeats and timeouts.** Intermediaries close idle connections. WebSocket has
ping/pong frames; SSE uses comment lines (`: keepalive`) every 15–30 seconds. Forgetting
either produces the classic "works locally, dies in production after 60 seconds".

**Authentication.** Neither browser API lets you set an `Authorization` header. Both
usually rely on cookies, or on a short-lived ticket obtained via a normal request and
passed in the URL. See [Authentication](/concept/authentication).

## Related

- [HTTP](/concept/http) — SSE is HTTP; WebSocket starts as HTTP
- [Pub/Sub](/concept/pub-sub) — how many connection servers share events
- [Load Balancing](/concept/load-balancing) — long-lived connections change how you balance
- [Chat System](/architecture/chat-system) and [Notification System](/architecture/notification-system)
