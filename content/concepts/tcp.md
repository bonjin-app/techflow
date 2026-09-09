---
id: tcp
name: TCP
tagline: Reliable, ordered byte streams over an unreliable network
category: networking
tags: [Networking, Protocol, Fundamentals]
difficulty: 2
prerequisites: [programming-fundamentals]
learningPath:
  - programming-fundamentals
  - tcp
  - udp
  - tls
  - http
  - https
  - websocket
related:
  - { to: programming-fundamentals, rel: REQUIRES }
  - { to: udp, rel: ALTERNATIVE_TO }
  - { to: http, rel: RELATED_TO }
  - { to: tls, rel: RELATED_TO }
  - { to: websocket, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: timeout, rel: RELATED_TO }
  - { to: chat-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

TCP (Transmission Control Protocol) turns the lossy, reordering, best-effort delivery
of IP into a **reliable, ordered byte stream** between two endpoints. It opens a
connection with a three-way handshake, numbers every byte, acknowledges what arrived,
retransmits what did not, and slows down when the network is congested. Almost every
application protocol you use daily — [HTTP](/concept/http), [TLS](/concept/tls),
[WebSocket](/technology/websocket), database wire protocols — runs on top of it.

## Why it matters

The network drops packets, duplicates them and delivers them out of order. Without
TCP every application would have to solve those problems itself. Because TCP hides
them, a backend developer can write `socket.write(bytes)` and trust that the bytes
arrive intact and in order — or that the connection fails loudly.

The abstraction leaks, though. Connection setup costs a round trip, a single lost
packet stalls everything behind it, and a slow receiver slows the sender. Understanding
why explains many production symptoms: latency spikes under load, connection pools
that run dry, "connection reset" errors during deploys, and why HTTP/3 abandoned TCP
for [UDP](/concept/udp).

## Visual

```sequence
title: Handshake, data and one retransmission
participants: Client, Server
Client -> Server: SYN (seq=x)
Server --> Client: SYN-ACK (seq=y, ack=x+1)
Client -> Server: ACK (ack=y+1)
Client -> Server: DATA seq=1..1000
Server --> Client: ACK 1001
Client -> Server: DATA seq=1001..2000 (lost ✗)
Client -> Server: DATA seq=2001..3000
Server --> Client: ACK 1001 (duplicate — gap detected)
Client -> Server: retransmit seq=1001..2000
Server --> Client: ACK 3001
```

The handshake costs one round trip before any application data flows. The lost
segment is detected by duplicate acknowledgements (fast retransmit) or, if nothing
arrives at all, by a retransmission timer (RTO).

## How it works

- **Connection** — the three-way handshake (SYN, SYN-ACK, ACK) synchronises initial
  sequence numbers and confirms both sides are reachable. Closing uses FIN/ACK in
  each direction; the side that closes first waits in `TIME_WAIT` so late packets
  cannot be confused with a new connection on the same port pair.
- **Sequencing and acknowledgement** — every byte has a sequence number. The
  receiver sends cumulative ACKs ("I have everything up to N"); with SACK it can also
  report which later blocks arrived, so only the gaps are resent.
- **Retransmission** — a segment is resent when the RTO fires (computed from measured
  round-trip time) or when three duplicate ACKs signal a hole.
- **Flow control** — the receiver advertises a window (how much it can buffer). A slow
  consumer shrinks the window and the sender must wait; this is backpressure at the
  transport layer.
- **Congestion control** — the sender also keeps a congestion window that grows
  (slow start, then additive increase) and shrinks on loss. Algorithms such as CUBIC
  and BBR decide how aggressively. This is why throughput ramps up over the life of a
  connection instead of being instant.
- **Ports** — a connection is identified by the 4-tuple (source IP, source port,
  destination IP, destination port). Servers listen on a well-known port; clients use
  an ephemeral port, which is a finite resource on a busy host.

## Deep Dive

**Connection cost drives architecture.** Handshake plus slow start means a fresh
connection is expensive; a fresh [TLS](/concept/tls) connection more so. Hence HTTP
keep-alive, HTTP/2 multiplexing, database connection pools, and long-lived
[WebSocket](/technology/websocket) connections in a [Chat System](/architecture/chat-system).
Pool sizing is a TCP question: too small and requests queue, too large and the
database or the ephemeral port range runs out.

**Head-of-line blocking.** TCP delivers bytes strictly in order. If segment 2 is lost,
segments 3–10 sit in the receive buffer until the retransmit arrives, even though
they belong to a different HTTP/2 stream. This single property motivated QUIC
(HTTP/3), which runs independent streams over [UDP](/concept/udp).

**Nagle and delayed ACK.** Nagle's algorithm batches small writes; delayed ACK holds
acknowledgements briefly to coalesce them. Together they can add tens of milliseconds
to request/response protocols that send small messages. Latency-sensitive services
set `TCP_NODELAY`.

**Timeouts are yours to set.** TCP will retry for minutes before declaring a peer
dead. An application that waits for the kernel to give up will hang, so every client
needs its own connect and read [Timeout](/pattern/timeout). Keepalive probes detect
silently dead peers (crashed hosts, dropped NAT mappings) on idle connections.

**Load balancers and connections.** A layer-4 [Load Balancing](/concept/load-balancing)
tier forwards TCP connections without reading them; a layer-7 balancer terminates the
connection and opens its own to the backend. With long-lived connections, a new
backend instance receives no traffic until clients reconnect — a common surprise when
scaling out gRPC or WebSocket services.

**Resets during deploys.** When a process exits with connections open, the kernel
sends RST and clients see "connection reset by peer". Graceful shutdown means stop
accepting, drain in-flight requests, then close — and the balancer must stop routing
first.

**When TCP is the wrong tool.** Real-time voice, video and game state prefer a late
packet to be dropped rather than retransmitted; they use [UDP](/concept/udp) and
handle loss at the application layer.

## Related

- [UDP](/concept/udp) — the connectionless alternative
- [TLS](/concept/tls) and [HTTPS](/concept/https) — what usually runs on top
- [Timeout](/pattern/timeout) — because TCP will not give up for you
