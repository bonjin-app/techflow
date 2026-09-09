---
id: availability
name: Availability
tagline: The share of time a system answers correctly — and what it costs to add another nine
category: operations
tags: [Reliability, Operations, Distributed System]
difficulty: 3
prerequisites: [backend, distributed-system, load-balancing]
learningPath:
  - backend
  - distributed-system
  - load-balancing
  - replication
  - availability
  - consistency
  - cap-theorem
  - observability
related:
  - { to: load-balancing, rel: REQUIRES }
  - { to: replication, rel: RELATED_TO }
  - { to: consistency, rel: RELATED_TO }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: observability, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: nginx, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Availability is the proportion of time a service is up and doing its job, usually
quoted in "nines": 99.9% allows about 8.8 hours of downtime a year, 99.99% about 53
minutes. It is achieved by removing single points of failure — redundant instances
behind [Load Balancing](/concept/load-balancing), replicated data, multiple zones —
and by failing fast and degrading gracefully when dependencies break. Every extra nine
costs roughly ten times more effort and trades against [Consistency](/concept/consistency)
and speed of change.

## Why it matters

Downtime is lost revenue, broken SLAs and eroded trust; for an
[E-commerce](/architecture/e-commerce) site the cost per minute is easy to compute and
large. But availability is also a systems-thinking discipline: a service is only as
available as the dependencies on its critical path, hardware and networks fail
routinely at scale, and most outages are caused by changes, not by broken disks.
Designing for availability means assuming every component will fail and deciding, in
advance, what the user sees when it does.

## Visual

```sequence
title: Failover behind a load balancer
participants: Client, LB [nginx], App A, App B, DB Primary, DB Replica
Client -> LB: GET /orders
LB -> App A: forward
App A -> DB Primary: query
DB Primary --> App A: rows
App A --> LB: 200 OK
LB --> Client: 200 OK
LB -> App A: health check (timeout ✗)
LB -> App A: health check (timeout ✗) — marked unhealthy
Client -> LB: GET /orders
LB -> App B: forward (A removed from pool)
App B -> DB Primary: query (connection refused ✗)
App B -> DB Replica: promoted to primary after failover
DB Replica --> App B: rows
App B --> LB: 200 OK
LB --> Client: 200 OK
```

Two independent failures — an application instance and the database primary — and the
client still received an answer, because every layer had a spare and a way to detect
that the active one was dead.

## Solutions

- **Redundancy at every layer** — at least two of everything: instances, zones,
  database nodes, DNS servers. A single instance, however reliable, caps availability
  at that instance's uptime plus its restart time.
- **Health checks and automatic failover** — a balancer or orchestrator
  ([Kubernetes](/technology/kubernetes), a cloud load balancer, [nginx](/technology/nginx)
  upstreams) must *detect* failure to route around it. Check something meaningful
  (can the app reach its database?) but keep checks cheap and their thresholds
  tolerant of a single slow response.
- **Stateless services** — if any instance can serve any request, instances are
  interchangeable and failover is trivial. State moves to replicated stores.
- **Data replication** — [Replication](/concept/replication) with a promotable
  standby, ideally in another zone. Decide and rehearse how promotion happens and how
  clients find the new primary.
- **Fail fast and degrade gracefully** — [Timeout](/pattern/timeout) every call,
  wrap flaky dependencies in a [Circuit Breaker](/pattern/circuit-breaker), isolate
  them with a [Bulkhead](/pattern/bulkhead), and define fallbacks: cached results, a
  reduced feature set, a queue to process later. Partial service beats no service.
- **Safe deployments** — rolling or canary releases, automatic rollback on error
  budgets, and feature flags. Since most incidents follow a change, change management
  is availability engineering.
- **Capacity headroom** — running at 90% means one lost zone is an outage. Plan for
  N+1 (or N+2) so losing a unit leaves enough to carry the load.

## Deep Dive

**The arithmetic of dependencies.** Components in series multiply: a request that
needs three services each at 99.9% is available 99.7% of the time at best
(0.999³). Components in parallel help: two independent 99% instances where either
suffices give 99.99%. Hence the two rules — shorten the critical path, and put
redundancy on whatever remains.

```compare
Availability | Downtime per year | Downtime per month
99%          | 3.65 days         | 7.3 hours
99.9%        | 8.77 hours        | 43.8 minutes
99.99%       | 52.6 minutes      | 4.4 minutes
99.999%      | 5.26 minutes      | 26 seconds
```

**MTBF and MTTR.** Availability = MTBF / (MTBF + MTTR). Above three nines, reducing
mean time to recovery — fast detection, automated failover, practiced runbooks — pays
more than trying to prevent every failure. That makes [Observability](/concept/observability)
and on-call process part of the availability design.

**SLI, SLO, SLA.** Measure a *service level indicator* users care about (fraction of
requests succeeding within 300 ms), set an internal *objective* (99.95% over 30 days),
and sign a looser external *agreement* with penalties. The gap between SLO and SLA is
your safety margin; the unused portion of the SLO is an error budget that decides how
aggressively to ship.

**Availability versus consistency.** During a partition, a replica can either keep
answering (possibly stale) or refuse (correct but unavailable) — the
[CAP Theorem](/concept/cap-theorem). A strongly consistent database that requires a
quorum is *less* available than an eventually consistent one by design. Choose per
data set.

**Failover has its own failure modes.** Split brain: two nodes both believe they are
primary and accept conflicting writes — fencing or consensus prevents it. Flapping:
health checks toggling a node in and out. Thundering herd: every client reconnecting
to the new primary at once. Long [DNS](/concept/dns) TTLs: clients keep the dead
address for an hour. Failover that has never been exercised should be assumed broken;
game days and chaos testing are how you find out.

**Cascading failure.** One slow dependency exhausts a thread pool, that service slows,
its callers time out and retry, the load doubles. Retries without backoff and
timeouts without circuit breakers convert a small outage into a total one. Load
shedding — deliberately rejecting some requests — keeps the rest alive.

**Cost.** Multi-zone doubles infrastructure; multi-region doubles it again and adds
data-consistency complexity. Match the target to the business: an internal tool at
99.5% with a good status page may be the right call.

## Related

- [Load Balancing](/concept/load-balancing) — the mechanism that routes around failure
- [Replication](/concept/replication) — availability for data
- [Circuit Breaker](/pattern/circuit-breaker) — stopping failures from cascading
