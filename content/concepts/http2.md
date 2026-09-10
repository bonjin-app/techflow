---
id: http2
name: HTTP/2 & HTTP/3
tagline: Multiplexed, binary HTTP — one connection carrying many concurrent streams
category: networking
tags: [Networking, Protocol, Performance, HTTP]
difficulty: 3
prerequisites: [http, tcp, tls]
learningPath:
  - http
  - tcp
  - tls
  - http2
  - grpc
related:
  - { to: http, rel: REQUIRES }
  - { to: tls, rel: REQUIRES }
  - { to: grpc, rel: RELATED_TO }
  - { to: cdn, rel: USED_WITH }
  - { to: udp, rel: RELATED_TO }
  - { to: nginx, rel: USED_WITH }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: video-streaming, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

HTTP/2 keeps HTTP's semantics — methods, URLs, status codes, headers — and replaces the
wire format with a binary, framed protocol where many **streams** share one connection.
That removes head-of-line blocking at the HTTP layer and compresses headers, but TCP still
blocks all streams when a packet is lost. HTTP/3 moves the same stream model onto QUIC over
UDP, giving independent streams, a faster handshake and connection migration. Both are
strict upgrades in nearly all cases; the interesting part is which HTTP/1.1 workarounds you
must now *undo*.

## Why it matters

[HTTP](/concept/http)/1.1 allows one outstanding request per connection, so browsers open
six connections per origin and developers invented workarounds — sprite sheets, bundled
assets, inlined resources, domain sharding — each of which trades cacheability for
parallelism. Those workarounds actively hurt on HTTP/2: one huge bundle invalidates on every
change, and sharding across hostnames splits a connection that was better off shared.
Server-side, one multiplexed connection per client instead of six changes connection-pool
sizing, load-balancer behaviour and how [gRPC](/technology/grpc) can stream at all.

## Visual

```compare
Aspect          | HTTP/1.1              | HTTP/2                    | HTTP/3
Framing         | text, one req at once | binary frames, streams    | binary frames on QUIC
Transport       | TCP                   | TCP, usually with TLS 1.2+ | QUIC over UDP, TLS 1.3 built in
Concurrency     | 6 connections/origin  | many streams, 1 connection | many independent streams
HOL blocking    | at the HTTP layer     | moved down to TCP          | none per stream
Header overhead | full text every time  | HPACK compression          | QPACK compression
Handshake       | TCP, then TLS         | TCP, then TLS, then ALPN   | 1 RTT, 0-RTT on resume
Connection move | breaks on IP change   | breaks on IP change        | survives, connection id
Encryption      | optional              | required by all browsers    | mandatory
```

```sequence
title: Three requests multiplexed over one HTTP/2 connection
participants: Browser, Server [nginx]
Browser -> Server: HEADERS stream 1, GET /index.html
Browser -> Server: HEADERS stream 3, GET /app.css
Browser -> Server: HEADERS stream 5, GET /photo.jpg
Server --> Browser: HEADERS stream 3, 200 OK
Server --> Browser: DATA stream 3, css bytes, END_STREAM
Server --> Browser: DATA stream 5, first chunk of the image
Server --> Browser: HEADERS stream 1, 200 OK
Server --> Browser: DATA stream 1, html bytes, END_STREAM
Browser -> Server: WINDOW_UPDATE stream 5, flow control credit
Server --> Browser: DATA stream 5, remaining image bytes, END_STREAM
```

## How it works

**Frames and streams.** Every message is split into frames (`HEADERS`, `DATA`,
`SETTINGS`, `WINDOW_UPDATE`, `RST_STREAM`, `GOAWAY`) tagged with a stream id. Frames from
different streams interleave freely, so a slow response no longer blocks the ones behind
it. Streams are cheap, bidirectional and individually cancellable — `RST_STREAM` is what
makes a client-cancelled fetch or a gRPC deadline actually free server resources.

**Header compression.** HPACK (HTTP/2) and QPACK (HTTP/3) keep a shared table of previously
seen header fields, so repeated cookies and user-agent strings cost a few bytes after the
first request. This is a large win for API traffic, where headers often exceeded the body.

**Flow control.** Per-stream and per-connection windows let a receiver throttle a fast
sender — [Backpressure](/concept/backpressure) built into the protocol. Default windows
(64 KB) are small for high-bandwidth links, and untuned windows are a common cause of
"HTTP/2 is slower" reports.

**Negotiation.** The version is chosen during the [TLS](/concept/tls) handshake via ALPN,
which is why browsers only speak HTTP/2 over HTTPS. HTTP/3 is advertised by an
`Alt-Svc` header or an HTTPS DNS record; the client tries QUIC and falls back to TCP if UDP
is blocked.

**QUIC's differences.** Streams are a transport concept, so loss on one stream does not
stall the others. The handshake merges transport and TLS 1.3 into one round trip, with
0-RTT resumption available (and replay-unsafe for non-idempotent requests). A connection id
rather than the 4-tuple identifies the session, so a phone switching from Wi-Fi to cellular
keeps its connection.

## Deep Dive

**TCP head-of-line blocking is the real limit of HTTP/2.** With no loss, multiplexing is a
clear win. With 2% loss, a single missing segment stalls every stream sharing that
connection, and six HTTP/1.1 connections can outperform one HTTP/2 connection because only
one of the six stalls. This is precisely the problem HTTP/3 exists to solve, and it is why
mobile and lossy networks show the largest HTTP/3 gains while a datacentre link shows
almost none.

**Server push failed; preload won.** HTTP/2 push let a server send resources the client had
not asked for. In practice it pushed things the client already had cached, wasting
bandwidth, and it was hard to reason about. Browsers removed support; `103 Early Hints`
with `Link: rel=preload` achieves the intent without the guessing.

**Undo the old workarounds, carefully.** Serve many small, individually cacheable files
instead of one bundle; drop domain sharding; stop inlining images as data URIs. But "many"
has limits: per-request overhead, compression efficiency across files and browser
scheduling mean a few dozen chunks beat a thousand. Measure with real device profiles
rather than assuming.

**Load balancers and proxies.** A single long-lived multiplexed connection defeats
connection-count-based [load balancing](/concept/load-balancing): one client's connection
lands on one backend and stays there, so requests-in-flight becomes the metric that
matters, and `GOAWAY` becomes the mechanism for draining during a
[graceful shutdown](/concept/graceful-shutdown). Many deployments terminate HTTP/2 at the
edge or [CDN](/concept/cdn) and speak HTTP/1.1 internally — which silently gives up
multiplexing for internal calls, and breaks gRPC, which requires HTTP/2 end to end.

**Operational costs.** QUIC runs in user space, so it typically costs more CPU per byte
than kernel TCP with offload; some networks throttle or block UDP; and the tooling story is
weaker — packet captures are encrypted at the transport layer, so debugging relies on
application logs and qlog rather than tcpdump. Middleboxes that expect TCP-shaped traffic
occasionally interfere.

**Failure modes.** Stream limits (`SETTINGS_MAX_CONCURRENT_STREAMS`) silently queue requests
when a client opens hundreds in parallel. A 100-continue or long-poll pattern designed for
one-request-per-connection behaves differently. And a shared connection concentrates
failure: when it dies, every in-flight request on it dies together, so
[Retry](/pattern/retry) with idempotency matters more, not less.
