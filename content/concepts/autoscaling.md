---
id: autoscaling
name: Autoscaling
tagline: Adding capacity automatically, on a signal that arrives after the users did
category: operations
tags: [Operations, Scalability, Cloud, Capacity]
difficulty: 3
prerequisites: [load-balancing, capacity-planning, observability]
learningPath:
  - load-balancing
  - capacity-planning
  - observability
  - autoscaling
  - cost-optimization
  - slo
related:
  - { to: capacity-planning, rel: RELATED_TO }
  - { to: load-balancing, rel: REQUIRES }
  - { to: kubernetes, rel: USED_WITH }
  - { to: serverless, rel: RELATED_TO }
  - { to: cost-optimization, rel: RELATED_TO }
  - { to: backpressure, rel: RELATED_TO }
  - { to: health-check, rel: RELATED_TO }
  - { to: slo, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

Autoscaling watches a signal and changes the number of instances to match. The mechanics are
easy; the two hard parts are that **the signal arrives late** — CPU rises because users are
already waiting — and that **new capacity arrives later still**, once an instance has booted,
warmed and passed its readiness check. Everything useful follows from those two delays: scale
out fast and in slowly, pick a signal that leads rather than lags, keep start-up short, and
set a floor that covers the traffic that arrives before the scaler reacts. Autoscaling
handles gradual and predictable load well. It does not save you from a step change, and it
cannot fix a bottleneck that is not the thing you are scaling.

## Why it matters

The appeal is obvious: pay for what you use, survive a spike without provisioning for the
worst day of the year. The disappointments are specific.

A service scales on CPU, but the bottleneck is a [database](/concept/database) connection pool. Adding instances
adds connections, the database saturates, latency rises, CPU falls, and the scaler removes
the instances it just added — while the outage continues. A scaler reacts to a traffic step
in 90 seconds and the instance takes 120 more to become ready, so three and a half minutes of
users get errors. A scale-in happens during a lull and the next burst arrives against a cold
fleet. A retry storm looks like real traffic, so the system scales up to serve requests
nobody is waiting for any more.

None of these are bugs in the scaler. They are consequences of reacting to a signal that
trails reality, which is why autoscaling is a capacity strategy and not a capacity answer.

## Visual

```steps
title: A traffic step, and where the four minutes go
Traffic doubles at 09:00 | the fleet is sized for the previous minute's load
Queues build | requests wait; latency rises before any metric moves much
CPU crosses the threshold | 30–60s later, because the metric is averaged over a window
The scaler decides | after the threshold holds for its evaluation period — another 30s
New instances requested | the cloud allocates and boots them: 30–90s for a container, more for a VM
The process starts | framework boot, config fetch, connection pools, JIT warm-up
Readiness passes | only now does the load balancer send it traffic
Caches are cold | the first requests it serves are slower than steady state
Steady again | roughly three to five minutes after the step, depending on every line above
Traffic falls at 09:30 | scale in slowly, or the next burst meets a fleet that just shrank
```

## Solutions

**Scale on the signal closest to the user's experience.** CPU is easy and lags. Requests per
instance, concurrency, or queue depth lead it, because they rise the moment demand does. For
a worker pool, queue depth or age is almost always the right signal: it directly measures the
work waiting. Latency is tempting and dangerous as a scaling signal, because it also rises
when a dependency is slow — and adding instances then makes that dependency worse.

**Be asymmetric: out fast, in slow.** Scaling out too eagerly costs money; scaling in too
eagerly costs an outage. Short evaluation and small cooldown on the way up, long stabilisation
on the way down. Thrashing — adding and removing repeatedly around a threshold — is the
signature of symmetric settings.

**Set the floor from the traffic that arrives before you react.** The minimum instance count
is not "the least we can run at 3am"; it is what absorbs a step change during the minutes the
scaler needs. This single number prevents most autoscaling incidents, and it is the one most
often left at the default.

**Make start-up fast, then measure it.** Every second of boot, config fetch and warm-up is a
second of the response time to a spike. Slim images, lazy initialisation of what is not
needed to serve, and readiness that passes as soon as the instance can actually work. Track
time-from-request-to-serving-traffic as a real metric; it is the scaler's true reaction time.

**Pre-scale what you can predict.** Load with a shape — business hours, a scheduled sale, a
marketing send — should be scheduled, not discovered. Scheduled scaling ahead of a known
event costs an hour of extra capacity and removes the entire reaction delay.

**Know what you are not scaling.** Stateless instances scale; the database usually does not,
and neither does a third-party API with a quota. Before enabling a scaler, name the next
bottleneck and what happens when you reach it, or you will automate your way into it faster.
[Capacity Planning](/concept/capacity-planning) is where that number comes from.

**Cap it, and alarm on the cap.** A maximum protects the database and the bill from a retry
storm or a bug. Hitting the ceiling should page someone — it means either real growth you
have not planned for, or a loop.

## Deep Dive

**Three axes, often confused.** *Horizontal* adds instances — the default, and it requires
the work to be stateless and spreadable. *Vertical* makes an instance bigger, which suits a
database or a memory-bound process and usually needs a restart. *Cluster* scaling adds the
machines the instances run on, which is a second, slower loop underneath the first: on
[Kubernetes](/technology/kubernetes) a pod can be scheduled in a second, or in three minutes if a node has to be
provisioned first. When a scale-out seems inexplicably slow, it is usually the lower loop.

**Scale to zero is a different product.** Serverless platforms and some container services
can run nothing until a request arrives. That is the best possible cost profile and it puts
a cold start in front of a user — see [Serverless](/concept/serverless). It suits spiky,
latency-tolerant and internal workloads, and it is a poor fit for a checkout page.

**Autoscaling and backpressure solve different halves.** Scaling adds capacity over minutes.
[Backpressure](/concept/backpressure) — bounded queues, load shedding, rate limits — protects
the system in the seconds before that capacity exists, and keeps the failure honest when it
never will. A system with autoscaling and no backpressure has no answer for its own reaction
time; the queue grows until something falls over.

**The retry-storm feedback loop is worth naming.** Errors cause retries, retries look like
traffic, traffic causes scale-out, and the new instances hammer the struggling dependency.
Retries with jitter, circuit breakers and a cap on the fleet break the loop. Scaling on a
signal that counts *useful* work rather than raw arrivals helps too.

**Statefulness is the constraint, not the scaler.** Anything held in instance memory —
sessions, sticky connections, in-process caches, a local queue — makes instances
non-interchangeable, and scale-in throws that state away. Push session state to
[Redis](/technology/redis) or a signed cookie, and treat every instance as disposable. The
work to make a service autoscalable is almost entirely this work.

**Measure whether it is helping.** The honest scorecard is three numbers: the SLO through the
spikes, the utilisation between them, and the bill. A scaler that never triggers is a
floor set too high; one that triggers constantly is a threshold set wrong; one that triggers
and the errors happen anyway is reacting too late, which is a start-up-time problem rather
than a scaling-policy problem.
