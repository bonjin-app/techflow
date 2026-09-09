---
id: bulkhead
name: Bulkhead
tagline: Partition resources per dependency or tenant so one failure cannot sink the whole service
category: reliability
tags: [Reliability, Resilience, Isolation, Distributed System]
difficulty: 3
prerequisites: [backend, concurrency, distributed-system]
learningPath:
  - backend
  - concurrency
  - distributed-system
  - timeout
  - circuit-breaker
  - bulkhead
  - rate-limiting
related:
  - { to: distributed-system, rel: SOLVES }
  - { to: circuit-breaker, rel: USED_WITH }
  - { to: timeout, rel: USED_WITH }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: concurrency, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
  - { to: payment-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

An API server has one thread pool and one outbound connection pool shared by
every feature. The recommendations provider slows to 10 seconds per call. Within
a minute every worker thread is parked waiting on recommendations, and requests
that only need the database — login, checkout, health checks — queue behind them
and time out. A non-critical dependency has taken the critical path down with it.

The same shape appears with noisy tenants (one customer's batch import starves
everyone), with queue consumers (one poison topic blocks all consumers), and
with shared database pools.

## Solution

Take the name from ship design: divide the hull into watertight compartments so a
breach floods one section, not the vessel. In software, give each dependency,
feature or tenant its **own bounded pool** of threads, connections, queue slots
or instances. When one compartment fills, callers to it fail fast; every other
compartment keeps its capacity.

```sequence
title: Recommendations flood their own compartment only
participants: Client, API [backend], Rec pool (max 10), Rec API, DB pool (max 50), DB [postgresql]
Client -> API: GET /home
API -> Rec pool (max 10): acquire
Rec pool (max 10) -> Rec API: fetch (slow…)
Client -> API: GET /home (11th concurrent)
API -> Rec pool (max 10): acquire
Rec pool (max 10) --> API: REJECTED — pool full
API --> Client: 200 OK, without recommendations
Client -> API: POST /checkout
API -> DB pool (max 50): acquire
DB pool (max 50) -> DB: query
DB --> API: OK — unaffected
```

## How it works

```steps
title: Levels of isolation, cheapest first
Semaphore per dependency [concurrency] | cap concurrent calls; excess fail immediately
Thread / connection pool per dependency | queueing and timeouts per compartment
Separate process or container per feature [docker] | a crash or leak is contained
Separate deployment per tenant or tier [kubernetes] | noisy neighbours cannot touch premium traffic
```

Choosing the compartment size is the hard part. Too small and you reject traffic
the dependency could have served; too large and a slow dependency still eats most
of the process. A common starting point: expected concurrency at p99 latency
(Little's law: throughput × latency), with headroom, then tune from metrics.

```ts
class Bulkhead {
  private active = 0;
  constructor(private max: number) {}

  async run<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.active >= this.max) return fallback();   // fail fast, do not queue
    this.active++;
    try { return await fn(); } finally { this.active--; }
  }
}

const recs = new Bulkhead(10);
const payments = new Bulkhead(30);
```

Bulkheads compose with the other resilience patterns: a [Timeout](/pattern/timeout)
bounds how long a slot is held, a [Circuit Breaker](/pattern/circuit-breaker)
stops even trying when the dependency is clearly down, and the bulkhead
guarantees that whatever happens, the damage stays inside its compartment. At
the infrastructure level the same idea is separate node pools or namespaces per
workload, and separate service pools behind a load balancer (as the
[e-commerce](/architecture/e-commerce) architecture does for catalog vs checkout).

## Advantages

- Contains failures: a slow or broken dependency degrades one feature, not the service
- Protects critical paths (payment, login) from noisy non-critical ones
- Rejections are immediate and cheap; no threads parked on a dying call
- Makes capacity explicit and observable — pool saturation is a precise alert
- Works at every level, from a semaphore to a Kubernetes namespace

## Disadvantages

- Sizing is guesswork at first; wrong limits cause needless rejections or no protection
- Total capacity is fragmented — idle slots in one pool cannot help a busy one
- More pools mean more configuration, more metrics and more things to tune per environment
- Requires a fallback per compartment; "reject" is only useful if the caller handles it
- Process-level bulkheads cost real money in duplicated instances

## When to use

- A service calls several dependencies with different criticality or latency profiles
- Multi-tenant systems where one tenant's load must not affect others
- Consumers of several queues or topics in one process
- Any shared pool (threads, connections, sockets) that a single slow path could exhaust

## When not to use

- A service with one dependency — there is nothing to isolate from
- Very low traffic, where a pool of 5 would reject legitimate bursts and never see saturation
- When every dependency is equally critical and the service is useless without all of them; fix capacity instead
- As a replacement for [Timeout](/pattern/timeout) — a bulkhead without timeouts fills up and stays full

## Real-world

Bulkheads appear in every mature [microservices](/architecture/microservices)
estate: per-dependency connection pools in HTTP clients, separate consumer groups
per topic, and separate deployments for the payment path. In a
[payment system](/architecture/payment-system) the outbound pool to the card
provider is isolated from the pool used for the ledger database, so a provider
incident slows authorisations but leaves refunds, reconciliation and reads
healthy.
