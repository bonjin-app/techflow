---
id: timeout
name: Timeout
tagline: Bound how long you wait on any call so a slow dependency fails fast and predictably
category: reliability
tags: [Reliability, Resilience, Latency, Distributed System]
difficulty: 2
prerequisites: [http, backend, distributed-system]
learningPath:
  - http
  - backend
  - distributed-system
  - timeout
  - retry
  - circuit-breaker
  - bulkhead
related:
  - { to: distributed-system, rel: SOLVES }
  - { to: retry, rel: USED_WITH }
  - { to: circuit-breaker, rel: USED_WITH }
  - { to: bulkhead, rel: USED_WITH }
  - { to: idempotency, rel: REQUIRES }
  - { to: tcp, rel: RELATED_TO }
  - { to: http, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
  - { to: payment-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

A service calls a dependency and waits for the answer. The dependency does not
answer — a dropped packet, a wedged process, a database lock, a network partition.
Without a limit, the caller waits *forever*: the thread is stuck, the connection
is held, the user sees a spinner. Enough of these and the caller has no threads
left for anything else. Default settings make it worse: many HTTP clients and
database drivers ship with **no** timeout or with one measured in minutes, and
TCP alone can take many minutes to notice a dead peer.

Slow is more dangerous than down. A dead dependency fails immediately; a slow
one consumes your resources while it fails.

## Solution

Every call that leaves the process gets an explicit upper bound on waiting time.
When the bound is reached the call is abandoned, resources are released and the
caller decides what to do — return an error, a fallback or retry.

```sequence
title: Bounded wait — fail after 800 ms instead of never
participants: Client, API [backend], Inventory [http]
Client -> API: GET /product/42
API -> Inventory: GET /stock/42  (timeout 800 ms)
Inventory --> API: … no response …
API --> API: 800 ms elapsed → abort, release connection
API --> Client: 200 OK, stock "unknown" (fallback)
```

## How it works

```steps
title: Timeouts stack from the socket upward
Connect timeout [tcp] | how long to wait for the TCP handshake (short — 100s of ms)
Read / request timeout | how long to wait for a response once connected
Per-attempt vs total | each retry has its own bound; the whole operation has an overall budget [retry]
Deadline propagation | pass the remaining budget downstream so callees do not outlive the caller
Server-side timeout | the callee also stops work it can no longer return in time
```

Picking values is an engineering decision, not a default:

- Start from the dependency's observed **p99 latency** plus margin; a timeout near
  the median rejects healthy calls.
- Respect the **caller's budget**: if the user request has 2 s, a downstream call
  cannot have 3 s. Deadlines are usually propagated as a header or context.
- Distinguish **connect** from **read** timeouts — a refused connection should fail
  in milliseconds, not seconds.
- Decide the **outcome**: a timed-out write may or may not have happened. Only
  retry if the operation is [idempotent](/concept/idempotency).

```ts
async function getStock(sku: string, budgetMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const res = await fetch(`http://inventory/stock/${sku}`, {
      signal: controller.signal,
      headers: { "x-deadline-ms": String(budgetMs) },   // propagate the budget
    });
    return await res.json();
  } catch (e) {
    if (controller.signal.aborted) return { status: "unknown" };   // fallback
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
```

Timeouts are the foundation the other resilience patterns build on: a
[Circuit Breaker](/pattern/circuit-breaker) counts timeouts as failures, a
[Bulkhead](/pattern/bulkhead) relies on them to free slots, and
[Retry](/pattern/retry) needs a bounded attempt to know when to try again.

## Advantages

- Converts an unbounded hang into a bounded, predictable failure
- Frees threads and connections so the caller keeps serving other traffic
- Makes latency SLOs enforceable — the worst case has a known ceiling
- Cheap to implement; every client library exposes it
- Surfaces slow dependencies early through timeout metrics

## Disadvantages

- An aborted call may have completed on the other side — the state is unknown, which complicates writes
- Wrong values hurt: too short causes false failures under normal jitter, too long protects nothing
- Nested timeouts that are not coordinated produce confusing failures (the inner one fires first, or never)
- Aborting the client side does not stop server-side work unless the server honours deadlines
- Values drift out of date as dependencies change; they need periodic review

## When to use

- Every network call, database query, lock acquisition and external API request — no exceptions
- User-facing paths with a latency budget that must be met
- Together with [Retry](/pattern/retry) and [Circuit Breaker](/pattern/circuit-breaker) as the first layer of resilience
- Batch jobs that must finish inside a window and should skip a stuck item rather than block

## When not to use

- Long-running operations by design (large uploads, report generation) — use progress, streaming or async jobs instead of a single huge timeout
- As the *only* protection for non-idempotent writes; you also need idempotency keys or a status check on ambiguity
- In-process CPU-bound work, where "timeout" usually means cancellation tokens, a different mechanism
- Never "no timeout"; if a wait must be unbounded, that is a design smell to revisit

## Real-world

Timeouts are the quietest pattern in a [microservices](/architecture/microservices)
system and the one most often missing from incident post-mortems' root causes. In a
[payment system](/architecture/payment-system) the call to the card provider
carries a tight timeout; because a timed-out authorisation might have succeeded,
the request is sent with an idempotency key so it can be safely retried or its
outcome queried instead of charging twice.
