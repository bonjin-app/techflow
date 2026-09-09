---
id: circuit-breaker
name: Circuit Breaker
tagline: Stop calling a failing dependency so it can recover and your service stays up
category: reliability
tags: [Reliability, Resilience, Distributed System]
difficulty: 3
prerequisites: [http, backend, distributed-system]
learningPath:
  - backend
  - distributed-system
  - retry
  - circuit-breaker
  - rate-limiting
related:
  - { to: distributed-system, rel: SOLVES }
  - { to: retry, rel: USED_WITH }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

Service A calls service B on every request. B slows down — a bad deploy, a full
connection pool, a database lock. A's requests now wait on B until they time out.
A's threads and connections fill with waiting calls, its own latency climbs, and
the services that call *A* begin to time out too. Meanwhile every retry from A adds
load to B, which was already struggling. One slow dependency becomes an outage that
cascades upstream through the whole [distributed system](/concept/distributed-system).

The root issue is that a caller keeps sending traffic to a dependency that is
clearly failing, and pays the full timeout for each attempt.

## Solution

Wrap calls to the dependency in a *breaker* that tracks recent outcomes. While
calls succeed the breaker is **closed** and traffic flows. When failures exceed a
threshold it **opens**: for a cooling-off period every call fails immediately with a
fallback, without touching the dependency. After the period it becomes
**half-open** and lets a few trial requests through; if they succeed it closes,
if they fail it opens again.

```sequence
title: Breaker opens, then probes recovery
participants: Client, Breaker [backend], Payment API [http]
Client -> Breaker: charge()
Breaker -> Payment API: POST /charge
Payment API --> Breaker: timeout (5th failure)
Breaker --> Client: error — breaker OPEN
Client -> Breaker: charge()
Breaker --> Client: fail fast (no call made)
Breaker -> Payment API: trial request (HALF-OPEN after 30s)
Payment API --> Breaker: 200 OK
Breaker --> Breaker: CLOSED — traffic resumes
```

## How it works

```steps
title: Breaker states
CLOSED — calls pass; count failures in a sliding window
Threshold exceeded (e.g. 50% of last 20 calls) → OPEN
OPEN — fail fast, return fallback, start a timer [ttl]
Timer expires → HALF-OPEN
HALF-OPEN — allow N trial calls
Trials succeed → CLOSED · trials fail → OPEN again
```

Key parameters are the failure threshold, the minimum number of calls before the
breaker can trip (so one failure at startup does not open it), the open duration,
and what counts as a failure — usually timeouts and 5xx responses, but not 4xx,
which are the caller's fault. The fallback decides what the user sees: a cached
value, a default, a degraded feature ("recommendations unavailable") or a clear
error.

```ts
class Breaker {
  private state: "closed" | "open" | "half" = "closed";
  private failures = 0;
  private openedAt = 0;

  async call<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.openedAt < 30_000) return fallback();
      this.state = "half";
    }
    try {
      const result = await fn();
      this.failures = 0; this.state = "closed";
      return result;
    } catch (e) {
      if (++this.failures >= 5 || this.state === "half") {
        this.state = "open"; this.openedAt = Date.now();
      }
      return fallback();
    }
  }
}
```

One breaker per dependency (or per endpoint) is the usual granularity. Breakers are
per process; a fleet of 50 instances has 50 independent breakers that trip at
slightly different moments, which is fine and avoids needing shared state.

## Advantages

- Failing fast frees threads and connections instead of burning them on timeouts
- Gives the struggling dependency breathing room to recover
- Turns a cascade into a contained, degraded feature
- Explicit fallback forces the team to decide what "partially working" means
- State transitions are excellent signals for alerting and dashboards

## Disadvantages

- Wrong thresholds cause flapping (open/close churn) or a breaker that never trips
- A fallback that is wrong is worse than an honest error — stale prices, empty carts
- Adds a state machine to every external call; testing all three states takes effort
- Per-instance breakers mean a large fleet still sends some trial traffic
- Hides problems if alerts are not wired to the OPEN transition

## When to use

- Synchronous calls to remote dependencies: other services, payment providers, third-party APIs
- The dependency can be slow rather than merely down — timeouts are the expensive case
- A sensible fallback exists (cache, default, feature off)
- Combined with [Retry](/pattern/retry): retry handles blips, the breaker handles outages

## When not to use

- In-process calls or local resources — there is nothing to isolate
- The operation has no acceptable fallback and the user must simply wait (a synchronous bank transfer)
- Very low traffic — the window never has enough samples to make a trustworthy decision
- As a substitute for fixing the dependency; it limits damage, it does not restore service

## Real-world

Circuit breakers are standard in service meshes and client libraries for
[microservices](/architecture/microservices), and in any backend that depends on a
payment, shipping or email provider. In the [E-commerce](/architecture/e-commerce)
architecture the checkout service wraps its payment-provider call so that a provider
incident fails fast and leaves the order in a "payment pending" state rather than
exhausting the checkout service's connection pool.
