---
id: tail-latency
name: Tail Latency
tagline: The average is nobody's experience — p99 is, and it is where systems actually fail
category: reliability
tags: [Performance, Reliability, Observability, SLO]
difficulty: 3
prerequisites: [observability, load-testing]
learningPath:
  - observability
  - load-testing
  - tail-latency
  - slo
  - capacity-planning
  - backpressure
related:
  - { to: slo, rel: RELATED_TO }
  - { to: observability, rel: REQUIRES }
  - { to: load-testing, rel: RELATED_TO }
  - { to: capacity-planning, rel: RELATED_TO }
  - { to: backpressure, rel: RELATED_TO }
  - { to: timeout, rel: RELATED_TO }
  - { to: fan-out, rel: RELATED_TO }
  - { to: web-performance, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

An average response time tells you almost nothing, because latency distributions are not
symmetric: a handful of very slow requests barely move the mean while defining what users
experience. Percentiles describe the shape instead — p50 is the typical request, p99 is the
one in a hundred that is slowest, and p99 is where timeouts, retries and abandoned checkouts
live. Two facts make the tail worse than it first appears: a page that makes many calls is
governed by the slowest of them, not the typical one, and percentiles cannot be averaged
across servers or time buckets. Optimise the tail, measure it correctly, and set your
[SLO](/concept/slo) on it.

## Why it matters

Consider a service with a mean of 80ms. That number is consistent with almost any reality:
every request taking 80ms, or 99% taking 40ms and 1% taking 4 seconds. The second is a
product with a visible problem and a dashboard that looks fine.

Now count who meets the tail. At p99, one request in a hundred is slow — but a single page
load might make 30 requests, so the chance that *at least one* is slow is about 26%. A user
who performs ten actions in a session meets it with near certainty. The rare case is rare per
request and common per user, which is why "only 1%" is the most misleading sentence in
performance work.

The tail is also what breaks systems rather than merely annoying people. Slow requests hold
connections, threads and memory, so a rising tail consumes capacity that fast requests need,
which slows more requests. Clients time out and retry, adding load to the thing that is
already slow. The failure is not gradual.

## Visual

```steps
title: Why the average hides the problem
1,000 requests, mean 80ms | the dashboard is green and nobody is paged
990 of them took 40ms | this is the typical experience — p50
9 took 1.2s | a garbage-collection pause, a cold cache, a slow shard
1 took 4s | a retry after a timeout, or a lock it had to wait for
The mean is still 80ms | ten bad requests cannot move an average of a thousand
p99 is 1.2s and p99.9 is 4s | these are the numbers that describe those users
A page makes 30 such calls | ~26% of page loads contain at least one p99 request
The slowest call gates the page | so the page's p50 is roughly the request's p99
Threads are held for seconds | capacity drops exactly when demand is highest
Clients retry | the same slow dependency now receives more traffic
```

## Solutions

**Record percentiles, not averages, and record them per endpoint.** A single service-wide
number mixes a health check with a report query and describes neither. Tag by route and by
the dimensions that actually differ — region, client type, tenant — because a tail is usually
one segment, not a uniform slowdown.

**Never average percentiles.** The mean of each server's p99 is not the fleet's p99, and
neither is the mean of five one-minute p99s the five-minute p99. Percentiles are not additive.
Aggregate by merging histograms, which is what histogram-based metrics exist for; if your
tooling only stores pre-computed percentiles per instance, you cannot answer the question
you are asking.

**Set a timeout from the distribution, and make it shorter than you think.** A timeout above
p99.9 lets every pathological request consume a connection for its full duration; one near
p99 turns a slow request into a fast failure the caller can retry elsewhere. This is what
makes [Timeout](/pattern/timeout) a capacity control rather than a politeness.

**Hedge the requests that matter.** For idempotent reads, send a second request to another
replica if the first has not answered by roughly p95, and take whichever returns first. A few
percent more load buys a dramatic tail reduction, because the two slow events are usually
independent. Do it only for reads, and cap it.

**Attack the causes, which are a short list.** Garbage collection pauses, cold caches, lock
and connection-pool contention, one slow shard or replica, noisy neighbours on shared
hardware, a cold start, and queueing. Each is visible in a trace, which is why tracing beats
guessing here — see [Observability](/concept/observability).

**Watch queueing before it becomes latency.** Utilisation above roughly 80% makes queueing
delay rise sharply and non-linearly, so the tail explodes long before the average moves.
Capacity headroom is a tail-latency control, which is the practical reading of
[Capacity Planning](/concept/capacity-planning).

**Shed load rather than serving everyone slowly.** When demand exceeds capacity, a bounded
queue with rejection keeps the served requests fast; an unbounded one makes every request
slow and then fails anyway. That trade is [Backpressure](/concept/backpressure).

## Deep Dive

**Tail amplification is the reason distributed systems feel slow.** If a request needs
responses from N services in parallel, its latency is the maximum of N samples. With N = 100
and each service at p99 = 1s, the probability that *no* call is slow is 0.99¹⁰⁰ ≈ 37% — so
roughly two in three requests contain a one-second call. Adding a service makes it worse even
if the new service is fast. This is why a fan-out architecture must care about the tail of
every component, and why [Fan-out](/concept/fan-out) and tail latency are the same
conversation.

**p99 of what, over what window?** A percentile is meaningless without a population and a
time range. "p99 over five minutes" during a quiet night is a different claim from "p99 over
a day" including the peak. State both, and prefer a window long enough to contain the
behaviour you care about — an SLO measured over 30 days needs 30 days of data, not an average
of daily figures.

**Coordinated omission makes benchmarks lie.** A load generator that waits for a response
before sending the next request stops sending during a stall, so the stall is measured once
instead of affecting every request that should have been issued. The result is a benchmark
tail far better than production. Generators that send at a fixed rate regardless of responses
avoid it; if your load test says p99 is 50ms and production says 800ms, this is usually why.
See [Load Testing](/concept/load-testing).

**The tail is often one thing.** Before optimising broadly, segment: by host (a bad instance),
by shard (an unbalanced key), by tenant (one customer's data volume), by version (a bad
deploy), by cache state (cold starts). Most tail problems collapse to a single dimension, and
the fix is usually to remove or rebalance the outlier rather than to make the system faster.

**Retries interact with the tail badly.** A retry sends more load to a dependency that is
already slow, and if every client retries at once the result is a storm. Retry with jitter,
budget retries as a percentage of traffic rather than per-request, and pair them with a
circuit breaker.

**Choose the percentile from the consequence.** p50 describes typical experience. p99 is
where an interactive product's complaints come from. p99.9 matters when a request is part of
a fan-out or an internal dependency chain, because at that point other people's tails are
your median. Tracking only p50 hides the problem; tracking only p99.99 chases noise.
