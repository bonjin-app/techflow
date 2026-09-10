---
id: chaos-engineering
name: Chaos Engineering
tagline: Inject realistic failures on purpose to test what you believe about resilience
category: operations
tags: [Reliability, Operations, Testing, Distributed System]
difficulty: 4
prerequisites: [distributed-system, observability, slo]
learningPath:
  - distributed-system
  - observability
  - slo
  - circuit-breaker
  - chaos-engineering
related:
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: timeout, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: observability, rel: REQUIRES }
  - { to: slo, rel: REQUIRES }
  - { to: bulkhead, rel: RELATED_TO }
  - { to: load-testing, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

Chaos engineering is experimentation on a system to build confidence in its behaviour under
turbulent conditions. Each experiment states a **steady-state hypothesis** in terms of a
user-facing metric, introduces one realistic fault — latency, an error rate, a lost
instance, a partition — into a bounded blast radius, and either confirms the hypothesis or
finds a weakness before a customer does. It is not random breakage: an experiment without a
hypothesis and an abort condition is just an outage you caused yourself.

## Why it matters

Resilience mechanisms are code paths that never run in normal operation, which means they
are usually the least-tested code in the system. A [Circuit Breaker](/pattern/circuit-breaker)
with an unreachable threshold, a [Timeout](/pattern/timeout) longer than the caller's own,
a fallback that throws, a retry storm that turns a blip into an outage — all of these look
correct in review and only reveal themselves under real failure. Distributed systems also
fail in combinations nobody designed: the dependency is not down, it is slow, and the pool
fills, and the health check still passes. Experiments are the only practical way to find
those before they find you.

## Visual

```sequence
title: One controlled experiment, with an abort condition
participants: Engineer, Platform [kubernetes], Fault agent, Checkout [backend], Payments, Dashboard [prometheus]
Engineer -> Dashboard: record steady state, 99.95% success, p99 320 ms
Engineer -> Platform: hypothesis, checkout stays above 99.9% with payments at +300 ms
Engineer -> Platform: scope, 5% of checkout pods, 10 minutes, business hours, on-call informed
Platform -> Fault agent: inject 300 ms latency on calls to payments, 5% of pods only
Fault agent -> Checkout: delayed responses from Payments begin
Checkout -> Payments: request, now slow
Payments --> Checkout: response after 300 ms extra
Dashboard --> Engineer: success 99.93%, p99 610 ms, pool utilisation 96%
Engineer -> Dashboard: check abort condition, success below 99.5% or burn above 5x
Dashboard --> Engineer: retry storm detected, upstream errors climbing
Engineer -> Fault agent: abort, remove the fault immediately
Fault agent -> Checkout: normal latency restored
Dashboard --> Engineer: steady state recovered in 40 s, no rollback needed
Engineer -> Platform: finding, connection pool too small and retries unbudgeted
```

## How it works

**Define steady state as a business or user metric.** "Orders per minute" and "checkout
success rate" are steady-state metrics; "CPU is at 40%" is not. The hypothesis is a
statement that this metric stays within bounds while the fault is applied, which is why
[SLO](/concept/slo) definitions and [Observability](/concept/observability) are hard
prerequisites — without them you cannot tell an experiment's result from noise.

**Inject faults that actually happen.** In rough order of value: added latency (the most
common and most damaging real failure), error responses from a dependency, instance
termination, resource exhaustion (CPU, memory, disk, file descriptors), DNS failure,
network partition, clock skew, and the loss of a whole zone. Latency first, because slow is
harder to handle than down.

**Bound the blast radius before you start.** Smallest useful scope: one pod, one percent of
traffic, one non-critical dependency, in one zone. Have a single, fast, tested way to remove
the fault, and never rely on the fault agent staying healthy — a fault injector that leaks
its own failure is a real incident.

**Write the abort condition down.** A threshold on the steady-state metric, on error-budget
burn rate, or on a specific alert. Aborting on that condition is a successful experiment: it
found the weakness at 5% instead of 100%.

**Escalate deliberately.** Development, then staging with realistic load, then production
at a tiny share, then larger. Announce the first production experiments, run them in
business hours with on-call aware, and only automate them continuously once the manual
version has been boring several times in a row.

## Deep Dive

**Game days versus automated chaos.** A game day is a scheduled exercise with people —
often the fault is injected and the on-call team responds as if it were real, which tests
runbooks, dashboards and escalation as much as the code. Automated continuous chaos catches
regressions but only for failure modes you already encoded. Most teams get more value from
a monthly game day than from an always-on instance killer, because the findings are
organisational as often as technical.

**What experiments typically find.** Timeouts that are absent, infinite, or inconsistent
along a call chain (an inner timeout longer than the outer one guarantees the caller gives
up first, wasting work). Retries without budgets or jitter, which amplify load exactly when
capacity is lowest — see [Retry](/pattern/retry). Health checks that report healthy while
the service is useless, or liveness probes that kill a pod that was merely busy. Shared
thread pools where one slow dependency starves everything, the case
[Bulkhead](/pattern/bulkhead) exists for. Fallbacks that were never executed and therefore
never worked. And hidden critical dependencies — a "non-essential" recommendation service
that turns out to block page render.

**It is not a substitute for design or planning.** Chaos engineering validates resilience;
it does not create it. Running experiments against a system with no timeouts and no
isolation produces a long list of predictable failures and a lot of resentment. Fix the
known gaps first, then use experiments to test the parts you believe are handled. Likewise
it complements rather than replaces [Load Testing](/concept/load-testing) — one varies
demand, the other varies dependency behaviour, and the interesting failures often need
both.

**Prerequisites people skip.** You need a way to see the effect within seconds, an
error-budget policy that says whether you may spend budget on experiments, a rollback that
works, and organisational agreement that a discovered weakness is a good outcome rather
than someone's fault. Without the last one, the practice quietly stops after the first
experiment that causes a visible blip.

**Trade-offs and real risks.** Experiments consume error budget and engineering time, and a
production experiment can cause a genuine incident — that risk is the price of finding the
weakness on your schedule instead of the customer's. Data-affecting faults deserve extra
care: injecting failures into payment or write paths can create partial writes, which is
why [Idempotency](/concept/idempotency) and a reconciliation path should exist before you
experiment there. In [Multi-Tenant SaaS](/architecture/multi-tenant-saas), pick the blast
radius so it never lands on a single tenant twice.

**Make the output an action.** Every experiment ends in one of three states: hypothesis
held (record it, raise the scope next time), hypothesis broken (a ticket with the specific
mechanism, and a re-run once fixed), or aborted inconclusively (usually a gap in
observability, which is itself a finding). A log of experiments and their results is what
turns "we think we are resilient" into evidence.
