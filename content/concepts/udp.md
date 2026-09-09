---
id: udp
name: UDP
tagline: Fire-and-forget datagrams with no handshake, ordering or retransmission
category: networking
tags: [Networking, Protocol, Real-time]
difficulty: 2
prerequisites: [programming-fundamentals, tcp]
learningPath:
  - programming-fundamentals
  - tcp
  - udp
  - dns
  - https
related:
  - { to: programming-fundamentals, rel: REQUIRES }
  - { to: tcp, rel: RELATED_TO }
  - { to: dns, rel: RELATED_TO }
  - { to: https, rel: RELATED_TO }
  - { to: tls, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: video-streaming, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

UDP (User Datagram Protocol) sends independent packets — datagrams — with an 8-byte
header and no promises: no connection, no ordering, no retransmission, no congestion
control. What you gain is zero setup latency and full control over how to handle
loss. It carries [DNS](/concept/dns), voice and video, game state, metrics, and,
through QUIC, HTTP/3.

## Why it matters

[TCP](/concept/tcp)'s reliability has a price: a handshake round trip, in-order
delivery that stalls on a single lost packet, and congestion control tuned for bulk
transfer. For a video call, a retransmitted frame arriving 300 ms late is useless — the
conversation has moved on. For a DNS lookup, a handshake would double the latency of a
one-packet question. UDP lets the application decide which guarantees it needs and
build only those.

That freedom is also why UDP is the substrate for the newest transport work: QUIC
implements its own reliability, streams and encryption on top of UDP precisely because
TCP's behaviour is frozen in operating-system kernels and middleboxes.

## Visual

```sequence
title: Same request, TCP vs UDP
participants: Client, TCP Server, UDP Server
Client -> TCP Server: SYN
TCP Server --> Client: SYN-ACK
Client -> TCP Server: ACK + request
TCP Server --> Client: response (after 1 extra RTT)
Client -> UDP Server: request datagram
UDP Server --> Client: response datagram
Client -> UDP Server: request datagram (lost ✗)
Client -> UDP Server: application-level retry after its own timer
UDP Server --> Client: response datagram
```

UDP answers in one round trip. When a datagram is lost nobody notices unless the
application implements its own detection and retry.

## How it works

- **Header** — source port, destination port, length, checksum. That is all. No
  sequence numbers, no acknowledgements, no window.
- **Connectionless** — a socket can send to any address at any time and receive from
  anyone. One server socket serves all clients; there is no per-client connection
  state unless the application keeps it.
- **Message boundaries** — each `send` is one datagram and arrives (if at all) as one
  `recv`. TCP is a byte stream; UDP is a sequence of messages.
- **Size** — a datagram larger than the path MTU (typically ~1,500 bytes on Ethernet,
  less through tunnels) is fragmented by IP, and losing one fragment loses the whole
  datagram. Protocols on UDP keep payloads small or probe the path MTU.
- **Delivery** — datagrams may be lost, duplicated or reordered. The checksum detects
  corruption (mandatory in IPv6, optional in IPv4) and the packet is silently dropped.
- **Multicast and broadcast** — UDP can address a group or a whole subnet, which TCP's
  point-to-point connections cannot; used for service discovery and local streaming.

## Deep Dive

**Who uses it and why.**
- [DNS](/concept/dns): one question, one answer; the resolver retries itself and falls
  back to TCP only for large responses.
- Voice and video (RTP over UDP, WebRTC): timeliness beats completeness; codecs
  conceal missing frames. A [Video Streaming](/architecture/video-streaming) platform
  may use UDP for live/low-latency paths and TCP-based HTTP for on-demand segments.
- Multiplayer games: the latest position supersedes older ones, so a lost update is
  simply skipped.
- Telemetry (StatsD-style metrics, syslog): losing a sample is acceptable; blocking
  the application is not.
- QUIC / HTTP/3: reliable, multiplexed streams and [TLS](/concept/tls) 1.3 rebuilt in
  user space on UDP, avoiding TCP's head-of-line blocking and enabling 0-RTT
  reconnects. [CDN](/concept/cdn) edges and browsers negotiate it transparently under
  [HTTPS](/concept/https).

**You inherit the hard problems.** Whatever TCP did for you, you now do yourself:
detect loss (sequence numbers), decide whether to retransmit, reorder, deduplicate,
and — the one most often forgotten — back off when the network is congested. A UDP
sender with no congestion control can starve every TCP flow sharing the link.

**Middleboxes.** NATs and firewalls track TCP connections easily; UDP "sessions" have
to be inferred from traffic and expire quickly when idle, so long-lived UDP protocols
send keepalives every few seconds. Some corporate networks block UDP outright, which is
why QUIC clients always keep a TCP fallback.

**Amplification.** Because there is no handshake, a server answers whoever the source
address claims to be. Attackers spoof a victim's address and send small queries to
services with large answers (DNS, NTP). Public UDP services rate-limit responses per
source and prefer answers no larger than the question.

**Choosing.** Use TCP by default. Reach for UDP when latency matters more than
completeness, when the payload is a single small message, or when you are prepared to
implement (or adopt, via QUIC/WebRTC) the reliability you actually need.

## Related

- [TCP](/concept/tcp) — the reliable, ordered alternative
- [DNS](/concept/dns) — the most common UDP protocol
- [HTTPS](/concept/https) — HTTP/3 runs on UDP via QUIC
