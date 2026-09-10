---
id: slo
name: SLI, SLO & Error Budget
tagline: Measure what users feel, set a target, and spend the remainder on change
category: operations
tags: [Reliability, Observability, SRE, Operations]
difficulty: 3
prerequisites: [observability, availability, distributed-system]
learningPath:
  - observability
  - availability
  - slo
  - ci-cd
  - canary-release
related:
  - { to: prometheus, rel: RELATED_TO }
  - { to: observability, rel: RELATED_TO }
  - { to: availability, rel: REQUIRES }
  - { to: opentelemetry, rel: RELATED_TO }
  - { to: canary-release, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: ci-cd, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

An **SLI** is a metric of service quality as a user experiences it — the fraction of
requests that are fast and successful. An **SLO** is the target for that metric over a
window, such as 99.9% of requests under 300 ms per 30 days. The **error budget** is the
allowed remainder (0.1%, about 43 minutes a month), and it converts reliability from an
argument into arithmetic: while budget remains, ship; when it is exhausted, stabilise. An
**SLA** is the contractual, usually looser, version with money attached.

## Why it matters

"Is the service healthy?" has no useful answer from CPU graphs, and "100% uptime" is not a
goal anyone can plan against — it forbids all change, including the changes that improve
reliability. SLOs give a shared, quantified definition of good enough, agreed by
engineering and product. That single number resolves the recurring standoff between
feature velocity and reliability work, decides which alerts are worth waking someone for,
and tells you when *more* reliability is no longer worth paying for.

## Visual

```steps
title: From raw signal to a decision
1. Pick the user journey | "load the feed", "submit checkout" — not "the pod is up"
2. Define the SLI as a ratio | good events ÷ valid events, e.g. non-5xx requests under 300ms
3. Choose where to measure | load balancer or client, not deep inside one service
4. Set the SLO and window | 99.9% over a rolling 30 days, agreed with product owners
5. Compute the error budget | 0.1% of ~43,200 min ≈ 43 min of full unavailability
6. Track burn rate | budget spent ÷ time elapsed; 1× means exactly on target
7. Alert on burn, not on blips | 14.4× over 1h = page; 3× over 6h = ticket
8. Spend the budget deliberately | budget left → ship features, canary releases, chaos tests
9. Freeze when exhausted | stop feature deploys, fix the top causes of loss, then resume
10. Review each window | miss it twice and either invest in reliability or relax the target
```

```compare
Term         | What it is                                | Example                      | Owner
SLI          | measured indicator of user experience     | 99.95% of requests < 300ms   | engineering
SLO          | internal target for the SLI over a window | 99.9% per rolling 30 days    | eng + product
Error budget | 1 − SLO, the failure you may spend        | 43 min/month                 | shared
SLA          | external contract, penalties attached     | 99.5% or service credits     | business/legal
```

## How it works

**Good SLIs are ratios of events**, not averages. `good / valid` is easy to aggregate
across time and instances, and it degrades gracefully — unlike a mean latency, which hides
the tail where users actually suffer. The three common families are availability (error
rate), latency (proportion of requests under a threshold) and quality/freshness (for
pipelines: proportion of data processed within *n* minutes).

**Set thresholds, not percentiles, in the SLI.** "99% of requests under 300 ms" is a
counting problem you can compute anywhere. Averaging p99 values across instances or time
buckets is mathematically meaningless, which is why threshold counters are the standard
implementation in [Prometheus](/technology/prometheus) recording rules.

**Measure from the user's side.** An SLI computed inside the service misses DNS failures,
proxy errors, cold starts and dropped connections. The load balancer is a good compromise;
real-user monitoring in the client is better still for anything a browser or app touches.

**Burn-rate alerting.** Instead of alerting on every error spike, alert on how fast the
budget is being consumed. A fast burn (14× the sustainable rate over an hour) means the
month's budget disappears in two days — page someone. A slow burn (2–3× over six hours)
is a ticket. This replaces dozens of threshold alerts with two or three that always mean
something, and it is the most effective cure for alert fatigue.

**Error budget policy.** Write down, before an incident, what happens when the budget is
gone: feature deploys pause, reliability work takes priority, and the decision is not
renegotiated per incident. A budget with no policy attached is just another dashboard.

## Deep Dive

**Choosing the target.** Start from measured current performance and user expectation, not
from a row of nines. Each extra nine roughly multiplies cost — redundancy, on-call load,
review overhead — while the marginal user experience improvement shrinks toward the
noise floor of the network and device. If your dependencies collectively offer 99.9%, an
application SLO of 99.99% is arithmetic fiction unless you build around their failures.

**Dependencies compose badly.** Serial dependencies multiply: five components at 99.9%
each yield about 99.5% together. Redundancy is how you buy back the difference —
[Circuit Breaker](/pattern/circuit-breaker) and graceful degradation let a dependency fail
without the journey failing, which is why "which SLI does this dependency affect?" is a
better design question than "what is its uptime?".

**Windows and their trade-offs.** A rolling 30-day window responds smoothly and never
resets on the first of the month; a calendar window aligns with reporting but invites
end-of-month gambling. Short windows are noisy for low-traffic services, where a handful
of failures moves the number by a whole nine.

**Valid events need a definition.** Decide explicitly whether load tests, health checks,
bot traffic and 4xx responses count. A `429` returned deliberately as
[Rate Limiting](/concept/rate-limiting) is arguably correct behaviour, not a failure.
Undocumented denominators are how two teams report different numbers for one service.

**Failure modes of the practice itself.** SLOs on internal details nobody feels; too many
SLOs, so none carries weight; targets set to whatever the service already does, so they
can never be missed; budgets tracked but never spent, meaning reliability is
over-funded; and burn-rate alerts on a metric with gaps, which read as perfect health
while the exporter is down.

**Where it pays off.** Budget data makes rollout decisions mechanical: promote a
[Canary Release](/pattern/canary-release) only while its slice's SLI holds, and roll back
on regression. Over a few quarters the same numbers turn "the system feels flaky" into a
ranked list of the journeys that lost the most budget.
