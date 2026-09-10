---
id: canary-release
name: Canary Release
tagline: Send a small slice of real traffic to the new version and watch before widening
category: deployment
tags: [Deployment, CI/CD, Observability]
difficulty: 3
prerequisites: [load-balancing, observability, http]
learningPath:
  - http
  - load-balancing
  - observability
  - ci-cd
  - blue-green-deployment
  - canary-release
related:
  - { to: observability, rel: SOLVES }
  - { to: ci-cd, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: github-actions, rel: USED_WITH }
  - { to: prometheus, rel: USED_WITH }
  - { to: blue-green-deployment, rel: ALTERNATIVE_TO }
  - { to: feature-flag, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

Some defects only exist in production. Tests pass, staging is green, load tests
look fine — and then the new version meets real traffic: the actual query
distribution, the actual cache hit rate, the 0.3% of users whose data has a shape
nobody wrote a test for, the connection pool sized for last week's concurrency.

Releasing to everyone at once means every defect reaches every user at once.
Even with instant rollback the damage window covers 100% of traffic, and some
damage does not undo: emails sent, payments double-charged, rows corrupted.

You need a way to *learn* whether a version is good using real traffic, while
keeping the number of affected users small enough that the answer is cheap.

## Solution

Deploy the new version alongside the old one and route a **small percentage** of
traffic to it — 1%, then 5%, 25%, 50%, 100% — pausing at each step to compare
metrics between the two populations. If the canary's error rate, latency or
business metrics degrade, shift traffic back to zero and investigate; only a
fraction of users ever saw it.

The name comes from the canary carried into coal mines: a small, sensitive
detector that fails before the miners do.

```sequence
title: Progressive traffic shift with automatic abort
participants: Users [http], Router [nginx], Stable [backend], Canary [backend], Metrics [prometheus]
Users -> Router: traffic
Router -> Stable: 99%
Router -> Canary: 1% (v1.5)
Canary -> Metrics: latency, errors, saturation
Stable -> Metrics: baseline for the same window
Metrics --> Router: canary within thresholds
Router -> Canary: 25%
Canary -> Metrics: p99 latency doubles
Metrics --> Router: threshold breached
Router -> Canary: 0% — abort
Router -> Stable: 100%
```

```steps
title: A canary step
Define success thresholds before the release [slo] | error rate, p99 latency, a business metric
Shift a small slice of traffic to the canary [load-balancing]
Wait long enough to collect a statistically useful sample | minutes, not seconds — and cover a full cache cycle
Compare canary metrics against the stable population in the same window [observability]
Within thresholds → increase the share
Outside thresholds → route back to 0% and keep the canary for debugging
Reach 100%, then retire the old version
```

## How it works

Traffic can be split three ways, and the choice determines what you can detect.
**Random per-request** is simplest and gives clean metrics, but a user may hit
both versions in one session. **Sticky by user** (hash the user id) keeps each
user on one version, which is required for visible UI changes and is what a
[Feature Flag](/pattern/feature-flag) does natively. **By segment** (staff first,
then one region) trades statistical purity for lower risk.

```yaml
# Weighted routing: 5% canary
upstream_groups:
  orders:
    - { target: orders-v1-4, weight: 95 }
    - { target: orders-v1-5, weight: 5 }
```

Analysis decides whether this pattern works or merely feels safe. Comparing the
canary against *yesterday* is misleading; compare it against the stable version
over the *same* window, so traffic mix and time of day cancel out. Watch four
signals: errors, latency (p95/p99, not mean), saturation (CPU, pool waits, GC),
and at least one business metric. A version can be technically healthy and still
lose 20% of conversions.

Two failure modes are common. **Too small, too short:** 1% for two minutes gives
too few events to tell a 0.5% error increase from noise, so the canary passes and
the defect ships anyway. **Cold-start bias:** a fresh canary has empty caches and
cold JIT, so healthy releases get aborted on early latency. Both are fixed by
sizing the sample deliberately and warming up before measuring.

## Advantages

- Blast radius is bounded — a bad release affects a few percent of users, not all of them
- Detects problems that only appear under real traffic, data and load
- Metric comparison against a live baseline removes time-of-day and traffic-mix noise
- The traffic shift is reversible at every step, and automatable end to end
- Requires far less spare capacity than a full second environment
- Can be scoped to internal users first, making the first exposure nearly free

## Disadvantages

- Two versions run concurrently, so schema, message formats and shared caches must be compatible in both directions
- Meaningful signal needs meaningful traffic; low-volume services cannot canary usefully
- Slower releases — a careful ramp takes tens of minutes to hours
- Requires real observability: per-version metrics, dashboards and agreed thresholds. Without them a canary is theatre
- Small percentages still mean *some* users get the broken version, and side effects they trigger may be irreversible
- Automated analysis is a system of its own to build, tune and trust

## When to use

- High-traffic services where a few percent is still a large, representative sample
- Risky changes: a rewritten query path, a new dependency, a data-layer swap
- You already have per-version metrics and defined thresholds
- Both versions can safely run at the same time against shared state
- You want automated, gradual, reversible rollout as the default release path

## When not to use

- Low traffic — the sample is too small to conclude anything; prefer [Blue-Green](/pattern/blue-green-deployment)
- Changes that cannot coexist: an incompatible schema migration, a breaking message format
- Any exposure is unacceptable (a bug would misprice trades, send wrong invoices) — test differently, or shadow traffic instead
- You have no per-version observability yet; build that first
- Batch or scheduled workloads with no request stream to split

## Real-world

Progressive delivery on [Kubernetes](/technology/kubernetes) is the common
implementation: a service mesh or ingress splits traffic by weight, a controller
queries [Prometheus](/technology/prometheus) between steps and promotes or aborts
automatically. Mobile app stores implement the same idea as staged rollouts over
days. In practice canary and [Blue-Green](/pattern/blue-green-deployment) are
combined — canary to learn, blue-green's routing switch to make the final cutover
and its rollback instant — while [Feature Flag](/pattern/feature-flag) handles
turning a single feature off without any deploy at all.
