---
id: backpressure
name: Backpressure
tagline: Let a slow consumer push back on a fast producer instead of collapsing under load
category: architecture
tags: [Distributed System, Reliability, Streaming, Performance]
difficulty: 4
prerequisites: [tcp, concurrency, message-queue]
learningPath:
  - tcp
  - concurrency
  - message-queue
  - backpressure
  - rate-limiting
  - circuit-breaker
related:
  - { to: kafka, rel: RELATED_TO }
  - { to: rabbitmq, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: bulkhead, rel: RELATED_TO }
  - { to: timeout, rel: RELATED_TO }
  - { to: analytics-pipeline, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Backpressure is the feedback a slow consumer sends upstream so a fast producer stops
producing faster than the system can absorb. Without it, excess work piles up in a
buffer — a queue, a socket, a thread pool, the heap — and the buffer either exhausts
memory or grows so long that every response is already useless by the time it is
computed. The only sustainable options under sustained overload are to **slow the
producer, shed load, or degrade**; buffering merely postpones the choice.

## Why it matters

Every system has a bottleneck, and arrival rate is usually set by someone else: users,
sensors, an upstream service retrying. When arrival exceeds service rate, queueing theory
is unforgiving — the queue grows without bound, and latency grows with it. This is the
mechanism behind most cascading outages: a database slows by 30%, request threads pile up
waiting, the [Load Balancing](/concept/load-balancing) tier sees timeouts and retries,
retries double the arrival rate, and a small slowdown becomes a total outage. Explicit
backpressure converts that into a bounded, visible, survivable degradation.

## Visual

```timeline
title: Producer 10k/s, consumer 4k/s — unbounded buffer vs backpressure
Unbounded buffer                  | With backpressure
t0: queue 0, latency 20ms         | t0: queue 0, latency 20ms
t1: +6k queued, latency 1.5s      | t1: queue hits high-water mark 5k
t2: +12k queued, latency 3s       | t2: consumer stops requesting, producer blocks
t3: heap pressure, GC pauses      | t3: producer applies 429 / pause to its source
t4: consumer slows further ↺      | t4: queue drains to low-water mark 1k
t5: OOM kill, whole queue lost ❌  | t5: demand resumes, latency back to 20ms ✅
```

```sequence
title: Where the "no" comes from
participants: Client, API [nodejs], Queue [kafka], Worker [go], DB [postgresql]
Client -> API: burst of writes
API -> Queue: produce (buffer.memory full)
Queue --> API: block — producer buffer exhausted
API --> Client: 429 Too Many Requests + Retry-After
Worker -> Queue: poll(max.poll.records=100)
Worker -> DB: batch insert
DB --> Worker: slow — pool saturated
Worker -> Queue: pause partition, stop polling
Worker -> DB: retry batch with backoff
DB --> Worker: ok
Worker -> Queue: resume partition
Worker -> Queue: commit offsets
```

## How it works

Backpressure appears at every layer, and the mechanism differs:

- **TCP** does it in hardware terms: the receive window shrinks as the application stops
  reading, and the sender stalls. This is why a blocking socket write is itself a
  backpressure signal — [TCP](/concept/tcp) has solved this since the 1980s.
- **Pull-based consumers** are naturally back-pressured. A [Kafka](/technology/kafka)
  consumer fetches only what it asks for; if it stops polling, nothing arrives. Lag grows
  in the broker's durable log instead of in the consumer's heap, and `pause`/`resume`
  gives fine control per partition.
- **Push-based brokers** need explicit limits. [RabbitMQ](/technology/rabbitmq) uses a
  prefetch count (unacked messages per consumer) and will block publishers when memory or
  disk alarms trigger.
- **Reactive streams** make demand part of the protocol: the subscriber requests *n*
  items and the publisher may never send more.
- **HTTP APIs** have no channel to slow a caller down, so they answer with `429` or `503`
  plus `Retry-After` — [Rate Limiting](/concept/rate-limiting) is backpressure expressed
  as a status code.
- **Thread pools and connection pools** apply it by bounding concurrency: a bounded queue
  with a rejection policy is backpressure, an unbounded one is a memory leak with extra
  steps.

The design rule: **every buffer must be bounded**, and every bound must have a defined
behaviour when reached — block, drop oldest, drop newest, or reject with an error.
"Unbounded" is not a policy, it is a deferred crash.

## Deep Dive

**Little's Law sets the budget.** Concurrency = arrival rate × latency. A service handling
1,000 requests/s at 50 ms holds 50 requests in flight; if latency degrades to 500 ms, it
needs 500 slots to keep accepting the same rate. Since slots are finite, either the
arrival rate must fall or requests must be rejected. Choosing the limit deliberately —
and rejecting fast — is what keeps the tail latency of accepted work sane.

**Queue depth is a latency measurement.** A steady-state queue that never empties is pure
added latency, not capacity. Alert on *age of the oldest item* and consumer lag rather
than raw depth: depth alone cannot tell a healthy burst absorber from a permanently
under-provisioned consumer.

**Load shedding beats fair degradation.** Under overload, serving 70% of traffic well is
better than serving 100% of it too slowly to be useful. Shed by priority: drop
speculative or batch work first, keep checkout and health checks. Combine with
[Timeout](/pattern/timeout) so a caller that has already given up does not consume
capacity — dropping requests whose deadline has passed is free throughput.

**Retries are anti-backpressure.** Naive retries multiply arrival rate exactly when the
system is weakest. Pair every retry with exponential backoff, jitter, a retry budget
(cap retries at a small fraction of total requests) and a
[Circuit Breaker](/pattern/circuit-breaker) that stops calling a failing dependency
altogether.

**Dropping is a valid strategy — sometimes.** For telemetry, metrics or live video,
newest data supersedes old: a bounded ring buffer that overwrites is correct, and
sampling degrades gracefully. For payments and orders it is not; there the answer is a
durable log plus a slow, honest queue. Decide per data type, and write the choice down.

**Distributed subtlety.** Backpressure must propagate all the way to the *original*
source, or it just relocates the buffer. A gateway that returns 429 to a client which
immediately retries has moved the queue into the client. Ingestion pipelines therefore
push the signal to the edge: pause the upload, slow the sensor's sampling rate, or let
the durable log at the front absorb bursts while consumers scale.

**Failure modes to watch.** Unbounded in-memory work queues; async producers whose
`send()` never blocks and silently buffers; per-request tasks with no concurrency limit;
a bounded queue whose rejection path throws an unhandled error; and head-of-line
blocking, where one slow item stalls a whole partition — the case where
[Bulkhead](/pattern/bulkhead) isolation earns its keep.
