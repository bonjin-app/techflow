---
id: load-testing
name: Load Testing
tagline: Apply controlled traffic to learn where a system bends, and where it breaks
category: operations
tags: [Performance, Testing, Operations, Reliability]
difficulty: 3
prerequisites: [http, observability, slo]
learningPath:
  - http
  - observability
  - slo
  - load-testing
  - capacity-planning
related:
  - { to: capacity-planning, rel: RELATED_TO }
  - { to: slo, rel: REQUIRES }
  - { to: observability, rel: REQUIRES }
  - { to: prometheus, rel: USED_WITH }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: backpressure, rel: RELATED_TO }
  - { to: chaos-engineering, rel: RELATED_TO }
  - { to: video-streaming, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Load testing drives a system with synthetic traffic to measure how latency, error rate and
resource use respond to demand. The useful outputs are a **latency curve against arrival
rate**, the point where the curve turns vertical, and the component that caused the turn.
"Requests per second" alone is not a result; the number only means something next to a
latency target and an error rate, which is why load testing and
[SLOs](/concept/slo) belong together.

## Why it matters

Systems do not degrade linearly. Up to some load, queues stay short and latency is flat;
past it, queueing delay grows without bound and the service collapses well before CPU
reaches 100%. You cannot find that knee by reasoning about averages, and finding it during
a product launch is expensive. Load testing also answers the questions that architecture
reviews cannot: whether the connection pool is the real ceiling, whether the autoscaler
reacts fast enough, and whether an overload response is a clean 429 or a cascading failure.

## Visual

```steps
title: One test type per question
1. Smoke | 1-5 users for a few minutes, does the scenario even work before you scale it
2. Load | ramp to expected peak, hold, confirm latency and errors stay inside the SLO
3. Stress | keep ramping past peak to find the knee and the first component to saturate
4. Spike | jump from idle to peak in seconds, tests autoscaling and cold caches
5. Soak | expected load for 4-24 hours, exposes leaks, disk growth, log rotation, cert reload
6. Breakpoint teardown | after the knee, drop load and check the system recovers on its own
```

```compare
Type   | Load profile        | Question it answers               | Typical duration
Smoke  | minimal             | is the script and env correct     | minutes
Load   | expected peak       | do we meet the SLO at peak         | 15-60 min
Stress | ramp beyond peak    | where is the knee and the cause    | until it breaks
Spike  | 0 to peak instantly | does elasticity keep up            | minutes
Soak   | steady, long        | does anything degrade over time    | hours to days
```

## How it works

**Model arrival rate, not user count.** A test that keeps 500 virtual users in a loop is a
*closed* model: when the system slows down, the load generator sends less traffic, so the
system self-protects and you never see the knee. Real internet traffic is *open* — arrivals
keep coming regardless. Prefer tools and modes that hold a target requests-per-second, and
watch the generator's own queue for coordinated omission, where a stalled request hides the
worst latencies from the report.

**Test realistic scenarios, not one endpoint.** A user journey mixes reads and writes,
carries cookies and tokens, follows pagination and re-uses connections. Cache behaviour
dominates results, so the key distribution matters more than the request count: hammering
one product id measures your cache, and requesting random ids measures your database. Both
are valid, but only one of them resembles production.

**Instrument both sides.** The generator reports client-observed latency and errors; the
system must report the same signals plus saturation — CPU, memory, pool utilisation, queue
depth, lock waits, replication lag — through [Observability](/concept/observability) and
[Prometheus](/technology/prometheus). Without the server side you learn *that* it broke,
not *why*.

**Environment fidelity, honestly labelled.** A quarter-size staging environment gives valid
*shapes* (which resource saturates first) but not valid *numbers*. Extrapolating capacity
from a smaller environment is only safe when the bottleneck scales linearly, which caches,
databases and coordination rarely do. Say which of the two you are producing.

## Deep Dive

**Read the curve, not the average.** Plot p50, p95 and p99 against offered rate. Flat p50
with a rising p99 means occasional queueing — usually one slow dependency or garbage
collection. All percentiles rising together means a shared resource is saturated. Errors
before latency means an explicit limit (pool, rate limit, file descriptors) is doing its
job. Little's law is the sanity check: concurrency ≈ arrival rate × latency, so if
concurrency is pinned at the pool size, the pool is the ceiling and nothing behind it is
being exercised.

**The knee is a queueing phenomenon.** As utilisation approaches 1, waiting time grows
hyperbolically; at 80% utilisation a small traffic increase produces a large latency
increase. That is why capacity targets sit near 60–70% and why measuring the knee is more
useful than measuring the maximum throughput — the maximum is a number you must never
operate at. See [Capacity Planning](/concept/capacity-planning).

**Failure modes of the practice.** Load-testing a system with warm caches and pre-created
accounts, which measures nothing about a cold start. A single client machine that saturates
its own CPU or ephemeral ports and reports the generator's limits as the system's. Fixed
think times that synchronise every virtual user into waves. Test data that shrinks the
working set until everything fits in memory. And the most expensive one: results that never
turn into an action item, so the same knee is rediscovered next quarter.

**Testing in production, carefully.** Staging cannot reproduce real data volumes or
third-party behaviour, so mature teams shift some of this to production: shadow traffic
(mirror real requests to a new version, discard the responses), a small share of live
traffic to a [Canary Release](/pattern/canary-release), or a scheduled load test with a
kill switch and an error-budget abort condition. That is a close relative of
[Chaos Engineering](/concept/chaos-engineering) and needs the same discipline — a
hypothesis, a blast-radius limit, and someone watching. Synthetic writes must be
identifiable and reversible, or they contaminate analytics and billing forever.

**Trade-offs.** Realistic tests are expensive to build and go stale as the product changes;
cheap endpoint benchmarks are easy to maintain and easy to misread. A pragmatic split is a
small suite of journey tests run before each release plus a nightly soak, with stress tests
reserved for architectural changes. Automating a hard pass/fail threshold in
[CI/CD](/concept/ci-cd) sounds attractive but is noisy on shared runners — compare against
a rolling baseline and alert on regression, not on an absolute number.

**What good output looks like.** One page: the scenario, the rate at which the SLO was
still met, the knee, the saturated component, and the specific change that would move it.
That last line is what turns a load test into capacity you can buy.
