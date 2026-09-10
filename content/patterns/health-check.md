---
id: health-check
name: Health Check
tagline: Expose an endpoint that says whether an instance should receive traffic right now
category: reliability
tags: [Reliability, Operations, Infrastructure, Observability]
difficulty: 2
prerequisites: [http, backend, load-balancing]
learningPath:
  - http
  - backend
  - load-balancing
  - observability
  - health-check
  - graceful-shutdown
  - circuit-breaker
related:
  - { to: kubernetes, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: graceful-shutdown, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: availability, rel: SOLVES }
  - { to: observability, rel: RELATED_TO }
  - { to: nginx, rel: USED_WITH }
  - { to: microservices, rel: USED_IN }
  - { to: observability-stack, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

A process can be running and still be useless. Its connection pool is exhausted, a
required migration has not finished, its cache client is stuck reconnecting, or the JVM is
in a garbage-collection death spiral. From the outside the port is open, so the
[load balancer](/concept/load-balancing) keeps sending it a third of all traffic — and a
third of all requests fail.

The inverse hurts too. A freshly started instance takes twelve seconds to warm caches and
open connections; if traffic arrives at second two, every early request times out. And
during a deploy an instance that is about to exit still receives new requests, so a routine
rollout produces a spike of errors that nobody can explain afterwards.

## Solution

Have every instance expose a **health endpoint** that answers one specific question: should
this instance receive traffic *right now*? Infrastructure polls it and acts on the answer —
the load balancer removes failing members, the orchestrator restarts hung ones, and neither
has to guess from request errors.

```sequence
title: One instance goes bad and is taken out
participants: LB [load-balancing], App A [backend], App B [backend], DB [postgresql]
LB -> App A: GET /healthz (every 5s)
App A --> LB: 200 OK
LB -> App B: GET /readyz
App B -> DB: SELECT 1 (200ms budget)
DB --> App B: timeout
App B --> LB: 503 not ready
LB -> LB: mark B unhealthy after 2 failures | traffic now only to A
LB -> App B: GET /readyz (keeps polling)
App B --> LB: 200 OK
LB -> LB: return B to the pool after 2 successes
```

Note the two thresholds: failing twice before removal avoids flapping on one slow poll, and
succeeding twice before return avoids sending traffic to an instance that is still unstable.

## How it works

Separate the checks by the decision they drive — this is the part teams most often get
wrong.

```steps
title: Three questions, three endpoints
Liveness — is the process wedged? [kubernetes] | failing means RESTART me
Readiness — can I serve traffic now? | failing means STOP routing to me
Startup — am I still warming up? | suppresses liveness during slow boot
Dependency probe — are my critical dependencies usable? [postgresql] | only if their loss makes me useless
Shutdown hook flips readiness to false first [graceful-shutdown] | drain, then exit
```

```http
GET /readyz HTTP/1.1

HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{ "status": "DOWN", "checks": { "db": "UP", "cache": "DOWN" }, "since": "2026-09-10T09:14:02Z" }
```

The critical rule: **liveness must not check dependencies**. If `/livez` returns failure
because the database is briefly unreachable, every instance fails at once and the
orchestrator restarts the entire fleet — turning a recoverable dependency blip into a full
outage with cold caches. Liveness should check only that this process can still do local
work. Readiness may consider dependencies, but only those without which the instance truly
cannot serve, and it should degrade rather than fail when a dependency is optional.

Checks must be cheap and time-boxed. A probe that runs a real query every second becomes
load; cache the result for a few seconds and give every check a timeout shorter than the
probe interval. The endpoint should be unauthenticated but return no internal detail
publicly, and it should be excluded from request metrics or it will dominate them.

## Advantages

- Bad instances leave the rotation in seconds without human involvement
- Rolling deploys become safe: traffic arrives only after warm-up completes
- Combined with [graceful shutdown](/concept/graceful-shutdown), deploys drop no requests
- Wedged processes are restarted automatically instead of failing silently overnight
- Gives operators one honest answer per instance instead of inference from error rates
- Cheap to implement — usually a framework feature, not a project

## Disadvantages

- A shallow check ("return 200") passes while the instance is broken, giving false confidence
- A deep check couples instances together: one shared dependency can fail the whole fleet
- Aggressive liveness probes cause restart loops that look like an application bug
- Probe traffic is real load and pollutes latency and request-count metrics
- Thresholds and intervals are tuning work; too fast flaps, too slow serves errors for minutes
- Says nothing about *partial* correctness — a service returning wrong data reports healthy
- The endpoint often becomes a dumping ground for checks that belong in monitoring

## When to use

- Any service behind a load balancer, service mesh or orchestrator — effectively all of them
- Deployments should be automated and zero-downtime
- Instances need warm-up before serving, or drain time before exiting
- Dependency-driven degradation needs to be visible to routing rather than guessed

## When not to use

- Not really a choice for a served application; the choice is *what* each probe checks
- Batch jobs and one-shot workers, where completion status is the signal instead
- Do not use readiness as a monitoring or [SLO](/concept/slo) substitute — it answers
  routing, not "is the product working"
- Do not use it as a [circuit breaker](/pattern/circuit-breaker) between services; that
  decision belongs to the caller, based on its own observed failures

## Real-world

Health checks are wired into every serving platform: [Kubernetes](/technology/kubernetes)
liveness, readiness and startup probes, target-group checks in cloud load balancers, and
upstream checks in [Nginx](/technology/nginx). The standard production setup is a trivial
`/livez`, a `/readyz` that reports critical dependencies and flips false on shutdown, and a
separate metrics endpoint scraped by [Prometheus](/technology/prometheus) — as in the
[Observability Stack](/architecture/observability-stack) architecture, where the probe
answers routing questions and the metrics answer diagnostic ones. In
[Microservices](/architecture/microservices) they are also what makes service discovery
usable: a registry only advertises instances whose readiness check currently passes.
