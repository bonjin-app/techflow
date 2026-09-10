---
id: http1-vs-http2
name: HTTP/1.1 vs HTTP/2 & HTTP/3
tagline: One request per connection, one multiplexed connection, or no TCP at all
category: decision
tags: [Protocol, Networking, Performance, Decision]
difficulty: 3
subjects: [http, http2]
related:
  - { to: tcp, rel: RELATED_TO }
  - { to: tls, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: grpc, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

The semantics never changed: methods, status codes, headers and bodies mean the same thing
in every version of [HTTP](/concept/http). What changed is the wire format.
[HTTP/1.1](/concept/http) sends one request at a time per connection, so browsers open six
per origin and everything else queues behind whatever is in front — head-of-line blocking
at the application layer. [HTTP/2](/concept/http2) multiplexes many independent streams
over one [TCP](/concept/tcp) connection with binary framing and header compression, which
removes that queue but leaves TCP's own: one lost packet stalls every stream. HTTP/3 moves
the same stream model onto QUIC over UDP, where loss on one stream no longer blocks the
others. The upgrade is real but narrow — it shows up on high-latency, lossy links with
many small resources, and barely at all on one big download inside a datacenter.

## Comparison

```compare
Feature                | HTTP/1.1 [http]                                    | HTTP/2 & HTTP/3 [http2]
Concurrency            | One request in flight per connection; ~6 per origin | Many streams multiplexed over one connection
Wire format            | Plain text, newline delimited                       | Binary frames with stream ids
Application-layer HOL  | Yes — a slow response blocks the connection         | No — streams are independent and interleaved
Transport-layer HOL    | Present, but spread over 6 connections              | HTTP/2 concentrates it on one TCP connection; HTTP/3 removes it
Header cost            | Full headers and cookies repeated per request       | HPACK or QPACK compresses and indexes them
Prioritisation         | None; browser guesses by request order              | Explicit stream priority and dependency hints
Transport              | TCP, TLS optional in the spec                       | HTTP/2 on TCP plus TLS in practice; HTTP/3 on QUIC over UDP
Handshake cost         | TCP plus TLS round trips per new connection         | One connection reused; QUIC merges transport and TLS setup
Connection migration   | New IP means a new connection                       | QUIC keeps the session across network changes
Front-end tactics      | Sprite, concatenate, shard domains                  | Ship granular files; sharding and inlining now hurt
```

## Decision

```decision
? Are clients browsers or mobile apps over the public internet?
  NO -> ? Is this internal service-to-service traffic with pooled, long-lived connections?
    YES -> ? Do you need streaming, multiplexing or gRPC semantics?
      YES -> HTTP/2 [http2]
      NO -> HTTP/1.1 is fine [http]
    NO -> HTTP/2 [http2]
  YES -> ? Does a page load pull dozens of small resources, or one large file?
    Dozens of small resources -> HTTP/2 and HTTP/3 [http2]
    One large file -> ? Are users on lossy mobile or satellite networks?
      YES -> HTTP/3 for loss resilience [http2]
      NO -> The version barely matters; optimise bytes and caching [cdn]
```

## When HTTP/1.1 is enough

- Internal, pooled connections between services where request count per connection is low and latency is a fraction of a millisecond.
- A single large payload — a video segment, a backup, a big JSON export — where throughput is bounded by bandwidth, not by concurrency.
- Debugging, scripting and legacy middleboxes: the text protocol is readable on the wire and every proxy in existence understands it.
- Servers or load balancers you cannot upgrade; terminating HTTP/2 at the [CDN](/concept/cdn) or the edge proxy and speaking HTTP/1.1 to the origin captures most of the benefit anyway.

## When HTTP/2 & HTTP/3

- Browser page loads with many small assets, API calls or images — the case the protocol was designed for.
- High round-trip-time clients: mobile networks, users far from your region, anywhere the six-connection cap turns into serialised waiting.
- Lossy links, where HTTP/3 is the meaningful step: a dropped packet stalls one QUIC stream instead of the whole connection.
- [gRPC](/technology/grpc) and long-lived streaming, which require HTTP/2 framing outright.
- Heavy cookies or repeated headers, where HPACK removes kilobytes per request.

## Deep Dive

**Two different head-of-line problems.** HTTP/1.1's is at the application layer: responses
must come back in request order on a connection, so one slow endpoint blocks the queue
behind it. Browsers work around this by opening about six connections per origin, which is
why domain sharding used to help. HTTP/2 fixes that layer completely — streams interleave
frame by frame — but it puts everything on a single TCP connection, and TCP guarantees
in-order delivery of the whole byte stream. A lost segment therefore stalls *all* streams
until it is retransmitted. On a clean network HTTP/2 wins easily; at a few percent packet
loss, six HTTP/1.1 connections can beat one HTTP/2 connection, because loss on one of six
only stalls one sixth of the work.

**What QUIC actually changes.** HTTP/3 keeps HTTP/2's stream model and moves it to QUIC,
a transport built on UDP that tracks loss and ordering per stream. Recovery becomes local
to the affected stream. QUIC also folds the transport and TLS handshakes together, so a
fresh connection costs one round trip instead of two or three, resumption can approach
zero, and a connection id rather than an IP tuple identifies the session — so a phone
moving from Wi-Fi to cellular keeps its connection. The costs: UDP is blocked or
deprioritised on some networks (so you always advertise HTTP/3 via `Alt-Svc` and keep
HTTP/2 as fallback), congestion control runs in user space and burns more CPU per byte,
and the protocol is far harder to inspect with familiar tools.

**Where the difference disappears.** All three versions move the same bytes with the same
caching rules. If a page is slow because it ships 3 MB of JavaScript, has no
[CDN](/concept/cdn) in front of it, or waits on a serial chain of API calls, the protocol
version is noise. Multiplexing removes *queueing* latency, not work: fifty parallel
streams still contend for the same bandwidth and the same backend. Measure first — if the
network tab shows requests waiting in a "queued" or "stalled" state, upgrading helps; if
they show long time-to-first-byte, fix the server.

**Practices that inverted.** Concatenating files, inlining assets, spriting images and
sharding across `static1`/`static2` hostnames were all workarounds for the per-connection
limit. Under HTTP/2 they are counterproductive: sharding forces extra connections and
extra handshakes, and a single bundle invalidates the whole cache when one line changes.
Ship granular, individually cacheable files instead. HTTP/2 Server Push was the one
genuinely new feature and it has been abandoned in practice — it re-sent resources clients
already had; `103 Early Hints` with preload is the replacement.

## Related

- [HTTP](/concept/http) — the semantics that stayed the same across versions
- [HTTP/2](/concept/http2) — binary framing, multiplexing and HPACK in detail
- [TCP](/concept/tcp) — why in-order delivery causes transport head-of-line blocking
- [TLS](/concept/tls) — handshakes that QUIC merges into the transport
- [gRPC](/technology/grpc) — a protocol that requires HTTP/2 framing
