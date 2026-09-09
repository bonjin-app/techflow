---
id: http
name: HTTP
tagline: The stateless request/response protocol every web client and server speaks
category: protocol
tags: [Networking, Protocol, Fundamentals, Web]
difficulty: 1
prerequisites: [programming-fundamentals]
learningPath:
  - programming-fundamentals
  - http
  - rest
  - backend
  - cdn
related:
  - { to: rest, rel: RELATED_TO }
  - { to: websocket, rel: RELATED_TO }
  - { to: sse, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: session, rel: RELATED_TO }
  - { to: authentication, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

HTTP (Hypertext Transfer Protocol) is a text-based, stateless protocol in which a
client sends a **request** (method, path, headers, optional body) and a server
returns a **response** (status code, headers, optional body). Every browser page
load, mobile app API call and most service-to-service traffic is HTTP. Because the
protocol itself remembers nothing between requests, everything that feels stateful —
logins, shopping carts — is layered on top with cookies, tokens and server-side
storage.

## Why it matters

HTTP is the contract between the frontend and the [Backend](/concept/backend).
Status codes decide how clients retry, headers decide what a [CDN](/concept/cdn) or
browser [Cache](/concept/cache) may keep, and the method decides whether a request is
safe to repeat. Most production incidents that "look like" application bugs —
duplicate orders on refresh, stale pages, sessions lost behind a load balancer — are
really misunderstandings of HTTP semantics. Knowing the protocol well is the cheapest
debugging skill a backend engineer can acquire.

```steps
title: One request, layer by layer
DNS lookup | hostname → IP address
TCP connection | three-way handshake
TLS handshake | HTTPS only; keys negotiated
HTTP request [http] | method + path + headers + body
Server processing [backend] | routing, auth, database
HTTP response [http] | status + headers + body
```

## Visual

```sequence
title: A typical GET with caching headers
participants: Browser, CDN [cdn], API [backend], DB [postgresql]
Browser -> CDN: GET /products/42  (Accept: application/json)
CDN -> API: GET /products/42  (cache miss)
API -> DB: SELECT … WHERE id = 42
DB --> API: row
API --> CDN: 200 OK  Cache-Control: max-age=60, ETag: "a1b2"
CDN --> Browser: 200 OK  (body, ETag)
Browser -> CDN: GET /products/42  If-None-Match: "a1b2"
CDN --> Browser: 304 Not Modified
```

## How it works

**Methods** express intent and carry guarantees the whole ecosystem relies on:

- `GET` / `HEAD` — read only, **safe** and **idempotent**; may be cached and prefetched.
- `PUT` / `DELETE` — idempotent: repeating them yields the same end state.
- `POST` — neither safe nor idempotent by default; a retry can create a second order
  unless the API adds an [Idempotency](/concept/idempotency) key.
- `PATCH` — partial update; idempotency depends on the payload.

**Status codes** are grouped by the first digit: `2xx` success, `3xx` redirect or
"use your cached copy" (`304`), `4xx` the client did something wrong (`400`, `401`,
`403`, `404`, `409`, `429`), `5xx` the server failed (`500`, `502`, `503`, `504`).
Clients and proxies branch on these classes: a `503` is worth a retry with backoff,
a `400` is not.

**Headers** carry metadata. The ones you will touch weekly:

- `Content-Type` / `Accept` — body format negotiation.
- `Cache-Control`, `ETag`, `Last-Modified` — the HTTP caching model used by browsers
  and CDNs.
- `Authorization`, `Cookie` / `Set-Cookie` — how [Authentication](/concept/authentication)
  and [Session](/concept/session) state ride on a stateless protocol.
- `Retry-After` — sent with `429`/`503` so clients know when to come back; central to
  [Rate Limiting](/concept/rate-limiting).

**Statelessness** is the design choice that makes HTTP scale. Any server can answer
any request, so a [Load Balancer](/concept/load-balancing) may spread traffic freely
and servers can be added or replaced without coordination. The cost is that shared
state must live somewhere else — a database, [Redis](/technology/redis), or a signed
token the client carries.

## Deep Dive

**Versions.** HTTP/1.1 uses one request at a time per TCP connection (browsers open
several connections to compensate). HTTP/2 multiplexes many streams over a single
connection and compresses headers, removing most of the need for domain sharding and
asset bundling. HTTP/3 runs over QUIC (UDP) so a lost packet stalls only its own
stream and connections survive network changes. Application code rarely changes
between versions; the transport does.

**Connections are expensive.** TCP and TLS handshakes cost round trips, so keep-alive
and connection pooling matter far more than most application-level micro-optimisations.
A backend calling another service without a pool pays a handshake per request.

**Real-time.** HTTP is request-initiated, so a server cannot push on its own. Options
are polling, long-polling, [SSE](/technology/sse) (a long-lived HTTP response that
streams events) and [WebSocket](/technology/websocket) (an upgraded connection that
leaves HTTP semantics entirely). See [WebSocket vs SSE](/compare/websocket-vs-sse).

**Common failure modes.**

- Treating `POST` as retry-safe → duplicate side effects.
- Forgetting `Vary` or setting `Cache-Control: public` on personalised responses → one
  user's data cached and served to another.
- Sticky sessions instead of an external session store → uneven load and lost logins
  when a server dies.
- Ignoring `Retry-After` → clients hammer an already overloaded service.

**REST** is the most common way to shape an HTTP API around resources and methods;
see [REST](/concept/rest). GraphQL and gRPC also run over HTTP but ignore much of its
method and caching vocabulary, which is why they need their own caching stories.
