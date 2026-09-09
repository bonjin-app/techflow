---
id: retry
name: Retry with Backoff
tagline: Repeat a failed call after an increasing, randomised delay — only when it is safe
category: reliability
tags: [Reliability, Resilience, Distributed System]
difficulty: 2
prerequisites: [http, backend, idempotency]
learningPath:
  - http
  - backend
  - idempotency
  - retry
  - circuit-breaker
  - dead-letter-queue
related:
  - { to: distributed-system, rel: SOLVES }
  - { to: idempotency, rel: REQUIRES }
  - { to: circuit-breaker, rel: USED_WITH }
  - { to: dead-letter-queue, rel: USED_WITH }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: rabbitmq, rel: RELATED_TO }
  - { to: notification-system, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

Networks drop packets, connections reset, a pod restarts during a deploy, a
database fails over for two seconds. Most of these failures are *transient*: the
same request, sent a moment later, would succeed. If every transient failure is
surfaced to the user as an error, a system that is 99.9% healthy at each hop looks
much worse from the outside.

The naive fix — loop until it works — creates a new problem. Thousands of clients
retrying at the same instant hammer the recovering service (a "retry storm"), and
retrying a non-idempotent call such as "charge the card" can execute it twice.

## Solution

Retry only failures that are likely transient, wait between attempts with an
**exponentially increasing** delay, add **jitter** so clients do not retry in
lock-step, and cap the total number of attempts. Make the operation
[idempotent](/concept/idempotency) — for example by sending an idempotency key —
so a retry after an ambiguous failure cannot apply the change twice.

```sequence
title: Retry with exponential backoff and jitter
participants: Client [backend], Service [http]
Client -> Service: POST /orders (Idempotency-Key: k1)
Service --> Client: 503 Service Unavailable
Client -> Client: wait ~200 ms (base × 2^0 + jitter)
Client -> Service: POST /orders (Idempotency-Key: k1)
Service --> Client: connection reset
Client -> Client: wait ~450 ms (base × 2^1 + jitter)
Client -> Service: POST /orders (Idempotency-Key: k1)
Service --> Client: 201 Created
```

## How it works

```steps
title: Retry decision
Call fails
Is the error retryable? (timeout, 503, 429, connection reset) — 4xx like 400/404 are not
Attempts left? if not → give up, surface error or dead-letter [dead-letter-queue]
Compute delay = min(cap, base × 2^attempt) + random jitter
Check the overall deadline — do not retry past the caller's timeout
Retry with the same idempotency key [idempotency]
```

The three ingredients each solve a specific failure mode:

- **Exponential growth** backs off harder the longer the outage lasts, so a service
  that is down for a minute is not hit at the same rate as one that hiccupped once.
- **Jitter** spreads the retries of many clients over time; without it they all
  retry at exactly the same offsets and recreate the spike.
- **A cap** on attempts and on total elapsed time ensures the caller eventually
  fails and the user is not left hanging.

```ts
async function withRetry<T>(fn: () => Promise<T>, max = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err) || attempt >= max) throw err;
      const base = Math.min(5_000, 200 * 2 ** attempt);
      await sleep(Math.random() * base);          // "full jitter"
    }
  }
}
```

Retries also interact with layers above and below. A queue consumer that fails
should usually let the broker redeliver the message (with its own backoff) rather
than loop in place. Servers can tell clients how long to wait with a `Retry-After`
header. And a [Circuit Breaker](/pattern/circuit-breaker) should sit *outside* the
retry loop: once the breaker is open, no retries are attempted at all.

## Advantages

- Masks the majority of transient failures without human involvement
- Exponential backoff plus jitter protects the recovering dependency from a retry storm
- Cheap to add; most HTTP clients and SDKs have it built in
- Idempotency keys make "did it go through?" ambiguity safe
- Works at every layer: HTTP calls, database connections, queue consumers

## Disadvantages

- Retrying non-idempotent operations causes duplicates — double charges, duplicate emails
- Adds latency: a caller can wait through several backoff periods before failing
- Nested retries multiply — three layers each retrying 3 times is 27 attempts
- Retrying non-transient errors (bad input, auth failure) wastes capacity and hides bugs
- Easy to misconfigure: no jitter, no cap, or retrying on every exception

## When to use

- Calls over a network where brief failures are expected
- The operation is idempotent, or can be made so with a key
- The failure classification is clear (timeouts, 5xx, 429, connection errors)
- The caller can afford the added latency, or the work runs asynchronously

## When not to use

- The operation is not idempotent and cannot be made idempotent
- The failure is deterministic — a validation error will fail the same way every time
- Latency budget is tight and a fallback is preferable — use a [Circuit Breaker](/pattern/circuit-breaker) with a default
- Retries are already happening at another layer (SDK, service mesh, broker redelivery) — pick one place

## Real-world

Retry with backoff is built into cloud SDKs, database drivers, HTTP clients and
message brokers such as [RabbitMQ](/technology/rabbitmq) and
[Kafka](/technology/kafka) consumers. In the
[Notification System](/architecture/notification-system) architecture the push,
email and SMS workers retry provider calls with backoff and hand messages that still
fail to a [Dead Letter Queue](/pattern/dead-letter-queue) for inspection rather than
retrying forever.
