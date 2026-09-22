---
id: tcp-vs-udp
name: TCP vs UDP
tagline: A reliable ordered stream you get for free, or datagrams and the recovery is yours
category: decision
tags: [Networking, Protocol, Latency, Reliability, Decision]
difficulty: 3
subjects: [tcp, udp]
related:
  - { to: http, rel: RELATED_TO }
  - { to: http2, rel: RELATED_TO }
  - { to: websocket, rel: RELATED_TO }
  - { to: tail-latency, rel: RELATED_TO }
  - { to: mobile-networking, rel: RELATED_TO }
  - { to: video-streaming, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-22, confidence: high }
---

## TL;DR

Both carry bytes between two machines over a network that loses, reorders and duplicates
packets. [TCP](/concept/tcp) hides all of that: it hands your application a reliable,
ordered stream, and pays for it with a handshake, acknowledgements and retransmissions.
[UDP](/concept/udp) hides none of it: a datagram is sent once and either arrives or does
not, and anything you need beyond that — ordering, retries, congestion control — you build.

The choice is not "reliable or unreliable". It is **who decides what to do about loss**. TCP
decides for you, and its decision is always "stop and retransmit". When a late packet is
worth less than a prompt gap — a voice frame, a position update, a frame of video — that
decision is the wrong one, and UDP exists so you can make a different one.

## Comparison

```compare
Feature           | TCP [tcp]                                       | UDP [udp]
Connection        | Three-way handshake before any data              | None; send and hope
Delivery          | Guaranteed or the connection dies                | Best effort, no notification
Ordering          | Bytes arrive in the order sent                    | Datagrams may arrive out of order
Loss recovery     | Automatic retransmit, application never sees it   | Yours to build, or to ignore
Head-of-line      | One lost segment stalls everything behind it      | A lost datagram affects only itself
Congestion        | Built in; backs off when the network is stressed  | None; you can flood a link
Overhead          | 20-60 byte header, plus ACK traffic              | 8 byte header, no ACKs
Boundaries        | A stream; you frame your own messages            | A datagram is a message
Multicast         | No, point to point only                          | Yes, one send to many receivers
Typical latency   | Predictable until loss, then a retransmit spike   | Consistently low, with gaps
```

## Decision

```decision
? Would a late message still be worth having?
  YES -> ? Do you need to write the retry and ordering logic yourself?
    NO -> TCP [tcp]
    YES -> ? Is there a reason the built-in recovery is wrong for you?
      YES -> UDP [udp]
      NO -> TCP [tcp]
  NO -> ? Is the data a continuous flow where a gap beats a stall — audio, video, telemetry?
    YES -> UDP [udp]
    NO -> ? Do you need one send to reach many receivers on a local network?
      YES -> UDP [udp]
      NO -> TCP [tcp]
```

## When TCP

- The data is a document, a request, a row, a file — anything where arriving late is still
  arriving, and arriving never is a failure.
- You would otherwise reimplement acknowledgements, sequence numbers, retransmission timers
  and congestion control, which is what every serious UDP protocol ends up doing.
- The path crosses the public internet, where a protocol without congestion control is both
  a bad citizen and likely to be throttled by middleboxes.
- It is an [HTTP](/concept/http) API, a database connection, a [WebSocket](/technology/websocket),
  a message broker — effectively all of them already sit on TCP, and going below that layer
  means rebuilding what they give you.

## When UDP

- A late datagram is worthless: a voice frame for a call already past that moment, a
  player's position two ticks ago, a sensor reading superseded by the next one.
- Head-of-line blocking is the problem you are trying to escape. One lost segment stalling
  an entire multiplexed connection is exactly why HTTP/3 moved to QUIC, which is UDP with
  its own per-stream recovery.
- You need multicast or broadcast on a local network — service discovery, mDNS, a video
  feed to many screens.
- The exchange is one small request and one small reply, and a handshake would double the
  cost: DNS is the canonical example, and falls back to TCP only when the answer is large.
- You are prepared to own reliability where it matters and skip it where it does not, which
  is a real engineering commitment rather than a shortcut.

## Deep Dive

**Head-of-line blocking is TCP's defining cost.** TCP delivers bytes in order, so a single
lost segment holds back every byte received after it until the retransmission arrives — even
bytes belonging to unrelated messages multiplexed on the same connection. [HTTP/2](/concept/http2)
made this worse by putting many streams on one connection: one lost packet stalls all of
them. HTTP/3 fixes it by moving to QUIC over UDP, where each stream recovers independently.
That is the clearest illustration of the trade here: the fix was not to abandon reliability
but to move it up a layer, where it can be applied per stream instead of per connection.

**"Unreliable" does not mean "lossy in practice".** On a healthy local network UDP loses
almost nothing; on a congested mobile link it loses plenty, and so does TCP — TCP just hides
it behind latency. Measuring one as reliable and the other as not misses the point. What
differs is where the cost of loss lands: in TCP as a delay you cannot opt out of, in UDP as
a gap you must decide how to handle.

**Congestion control is not optional, only invisible.** TCP backs off when it detects loss,
which is why the internet works at all. A UDP application that sends at a fixed rate
regardless of conditions will collapse a shared link and be punished by traffic shaping.
Real UDP protocols — QUIC, WebRTC, RTP — implement congestion control themselves, and the
serious work in building on UDP is precisely this, not the sending of packets.

**Datagram boundaries are a genuine convenience.** TCP gives a stream, so every protocol on
it invents framing: a length prefix, a delimiter, chunked encoding. With UDP a datagram is
the message and the boundary is free. The price is a size limit — stay under the path MTU,
practically about 1,200 bytes, or fragmentation costs you the whole datagram when any
fragment is lost.
