---
id: capacity-planning
name: Capacity Planning
tagline: Work backwards from a reliability target to the resources and headroom you need
category: operations
tags: [Operations, Performance, Reliability, Cost]
difficulty: 4
prerequisites: [slo, observability, load-testing]
learningPath:
  - observability
  - slo
  - load-testing
  - capacity-planning
  - kubernetes
related:
  - { to: slo, rel: REQUIRES }
  - { to: observability, rel: REQUIRES }
  - { to: load-testing, rel: RELATED_TO }
  - { to: prometheus, rel: USED_WITH }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: backpressure, rel: RELATED_TO }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: video-streaming, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

Capacity planning turns a reliability target into a resource decision: given an
[SLO](/concept/slo), a measured demand forecast and a known per-unit capacity, how much of
each resource must be provisioned, and how much **headroom** must sit unused so the target
survives a peak, a failed zone and a deploy. The arithmetic is simple; the discipline is in
measuring per-unit capacity honestly and in accounting for the failure cases you must
absorb without breaching the target.

## Why it matters

Two failure modes cost real money. Under-provisioning shows up as a launch that melts, an
autoscaler that cannot grow fast enough, or a database that hits its connection ceiling at
the worst moment. Over-provisioning is quieter and often larger: fleets running at 8%
utilisation because nobody knows what they can safely remove. Capacity planning replaces
both with a defensible number — and it converts "we think we need more servers" into a
statement a finance team can evaluate.

## Visual

```steps
title: From an SLO to a provisioning decision
1. Start from the SLO | 99.9% of checkout requests under 400 ms, rolling 30 days
2. Find the load the SLO survives | from a stress test: 400 rps/instance at p99 380 ms, knee at 520 rps
3. Set the utilisation target | operate at 65% of the knee, because queueing delay explodes near 1.0
4. Take the demand forecast | current peak 6,000 rps, 3%/month organic growth, 2.5x seasonal peak
5. Size for the forecast peak | 15,000 rps peak ÷ (520 x 0.65) ≈ 45 instances of steady capacity
6. Add failure headroom N+1 | survive one zone of three failing, so 45 x 1.5 ≈ 68 instances
7. Add deploy and drain headroom | one rollout batch unavailable at a time, plus a few percent
8. Check every other resource | DB connections, cache memory, queue partitions, egress, licences, quotas
9. Find the real constraint | 68 app instances x 20 pooled connections exceeds the database limit
10. Decide | raise the pooler, shard, or cap instances — the smallest ceiling is the actual capacity
11. Define the trigger | alert when sustained utilisation crosses 55%, lead time to add capacity is 3 weeks
12. Re-measure monthly | per-unit capacity drifts with every release, so the number is never final
```

## How it works

**Per-unit capacity comes from measurement, not from a spec sheet.** The only trustworthy
input is a [Load Test](/concept/load-testing) against the current build: requests per
second per instance at which the SLO still holds, plus the knee where latency turns
vertical. Deriving capacity from CPU alone is misleading — many services saturate on locks,
connection pools, or a downstream dependency long before CPU.

**Headroom is a stack of specific reserves,** not one fudge factor: peak-to-average ratio,
growth over the lead time to acquire capacity, one failure domain lost, one rollout batch
unavailable, and a margin for forecast error. Naming each one makes the total arguable
instead of arbitrary.

**Every resource has its own ceiling.** Compute is the easy one. The ones that actually
cause incidents are database connections (see
[Connection Pooling](/concept/connection-pooling)), cache memory and hit ratio, queue
partition count, file descriptors, ephemeral ports, IP addresses, cloud API rate limits and
account quotas. Capacity is the minimum across all of them.

**Forecast from the business, not only from the graph.** Extrapolated traffic curves miss
the marketing campaign, the enterprise customer onboarding in March and the regulatory
deadline. Seasonality and one-off events belong in the model explicitly, with their
expected multiplier.

**Autoscaling is a tool, not an answer.** It handles diurnal variation well and sudden
spikes poorly: instances take time to boot, caches start cold, and the scaling signal lags
the demand. Plan static capacity for the spike you cannot wait out, and use elasticity for
the predictable shape. Scaling limits, quota ceilings and node pool sizes must be part of
the plan or the autoscaler stops silently at a number nobody chose.

## Deep Dive

**Why 65% and not 95%.** Queueing theory: with random arrivals, waiting time grows roughly
as u/(1−u). At 50% utilisation, waiting equals service time; at 90% it is nine times it; at
95%, nineteen. Tail latency degrades far earlier than throughput, so a target chosen from
"CPU is only at 80%" will already be missing a p99 SLO. Multi-core and multi-instance
systems soften this, but the shape is the same, and it is the single most important
intuition in the topic. Little's law (concurrency = arrival rate × latency) is the
companion check for whether a pool size or thread count is the binding constraint.

**Failure domains multiply.** If you must survive one of three zones failing, the remaining
two carry 50% more each, so the whole fleet needs 1.5× — and each zone must have the
capacity, not just the total. Regional failover is more expensive still: a warm standby
region can double the bill, which is why degraded-mode plans (serve reads, disable
recommendations, queue writes) are often the better answer than full redundancy.

**Failure modes of the practice.** Planning compute and forgetting the database, which
cannot be scaled in ten minutes. Using averages, so a fleet sized for the mean fails every
evening. Ignoring the acquisition lead time — GPU capacity, dedicated instances and
enterprise licences are not available on demand. Assuming linear scaling across a
coordination point: adding instances to a shared lock or a single writer makes things
worse, not better. Treating an autoscaler's maximum as infinity. And planning once, then
letting a release quietly halve per-instance capacity.

**Trade-offs.** Headroom is money spent on unused resources; the alternative is spending
error budget. Making that trade explicit — "removing the third zone's spare capacity saves
X per month and risks Y minutes of budget per zone failure" — is the whole point of doing
the arithmetic. Reserved or committed pricing lowers cost but assumes the forecast; spot
capacity is cheap but can vanish, which only works if the workload tolerates it and
[Graceful Shutdown](/concept/graceful-shutdown) actually drains.

**Protecting the plan at the edges.** Capacity is finite whatever the plan says, so the
system needs a defined behaviour past its limit:
[Rate Limiting](/concept/rate-limiting) for fairness between clients,
[Backpressure](/concept/backpressure) and load shedding to protect the core, and
[Bulkhead](/pattern/bulkhead) isolation so one greedy workload cannot consume the whole
budget. A plan without a shedding strategy assumes demand respects your forecast.

**Making it routine.** A monthly review with three numbers per critical service — current
peak utilisation, measured knee, weeks of headroom remaining at the current growth rate —
is enough for most organisations, and it turns capacity from an annual panic into a
scheduled decision.
