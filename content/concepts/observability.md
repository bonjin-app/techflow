---
id: observability
name: Observability
tagline: Logs, metrics and traces that let you explain what a running system is doing — and why
category: operations
tags: [Operations, Reliability, Monitoring]
difficulty: 3
prerequisites: [backend, http, distributed-system]
learningPath:
  - backend
  - http
  - distributed-system
  - observability
  - prometheus
  - availability
related:
  - { to: distributed-system, rel: REQUIRES }
  - { to: prometheus, rel: RELATED_TO }
  - { to: elasticsearch, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: availability, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: timeout, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Observability is the ability to understand a system's internal state from the signals
it emits, well enough to answer questions you did not anticipate when you built it. The
three core signals are **logs** (discrete events), **metrics** (numbers over time) and
**traces** (the path of one request across services), joined by shared identifiers.
Monitoring tells you *that* something is wrong; observability lets you find out *why*.

## Why it matters

In a single process you attach a debugger. In a [Distributed System](/concept/distributed-system)
a slow checkout might be caused by any of a dozen services, a saturated database, a
misbehaving [API Gateway](/concept/api-gateway) or a retry storm — and the evidence is
scattered across machines that may have already been replaced. Observability is how
teams find the cause in minutes instead of hours, which is the dominant factor in
[Availability](/concept/availability) once basic redundancy is in place.

It also drives everyday engineering: capacity planning from metrics, performance work
from traces, product decisions from event logs, and objective SLOs instead of "it
feels slow". Systems that cannot be observed cannot be safely changed.

## Visual

```steps
title: The observability pipeline
Instrument | code emits structured logs, metric updates and spans, each carrying the request's trace id
Collect | agents or sidecars (OpenTelemetry Collector, Fluent Bit) receive or scrape the signals
Store | metrics → time-series DB [prometheus]; logs → search index [elasticsearch]; traces → trace store
Correlate | trace id joins a slow span to its logs and the metric spike it caused
Alert | SLO burn-rate and symptom-based alerts page a human only when users are affected
Investigate | dashboard → trace → logs → fix, then add the instrumentation that was missing
```

## How it works

```compare
Signal   | Answers                          | Cost model                 | Weakness
Logs     | What exactly happened here?      | Per event, volume-driven   | Expensive at scale; hard to aggregate
Metrics  | How much, how often, how fast?   | Per series, cardinality    | No per-request detail
Traces   | Where did this request spend time? | Per trace, usually sampled | Sampling can miss the rare failure
```

- **Logs** — structured (JSON), one event per line, with level, timestamp, service,
  and the trace/request id. Structured fields make logs queryable; free text does not.
  Centralise them so a request's logs from five services appear in one search.
- **Metrics** — counters (requests, errors), gauges (queue depth, connections) and
  histograms (latency distribution), labelled by service, route and status. Pull-based
  scraping as in [Prometheus](/technology/prometheus) is the common model in
  [Kubernetes](/technology/kubernetes). Standard methods: RED (rate, errors,
  duration) for services, USE (utilisation, saturation, errors) for resources.
- **Traces** — a trace is a tree of spans, one per operation, each with start time,
  duration, attributes and parent. Context (`traceparent` header) propagates across
  HTTP, gRPC and message queues so the tree spans services.
- **Correlation** — the trace id appears in every log line and as an exemplar on
  latency histograms, so you can jump from a metric spike to a representative trace to
  the exact log lines.
- **Alerting** — alert on user-visible symptoms (error ratio, latency SLO burn rate)
  rather than on causes (CPU 80%); route causes to dashboards. Every page should be
  actionable and have a runbook.

## Deep Dive

**Monitoring versus observability.** Monitoring checks known failure modes with
predefined dashboards and thresholds. Observability is the property that lets you ask
new questions — "which tenants saw errors on the new endpoint in the last ten minutes,
and did they share a database shard?" — from data you already collected. It comes from
rich, high-cardinality, correlated telemetry, not from more dashboards.

**Cardinality is the metrics budget.** Each unique label combination is a time series
kept in memory. A `user_id` label on a request counter creates millions of series and
takes the metrics system down. Keep metrics low-cardinality (service, route template,
status class) and put high-cardinality detail in traces and logs.

**Sampling.** Recording every trace at high volume is unaffordable. Head sampling
decides at the start (simple, misses rare errors); tail sampling decides after the
trace completes (keeps errors and slow requests, costs a buffering collector). Always
keep 100% of errors if you can.

**OpenTelemetry.** A vendor-neutral standard for APIs, SDKs and wire protocol across
all three signals; instrument once and export to any backend. Auto-instrumentation
covers frameworks, HTTP clients and databases; manual spans add business context
(order id, tenant).

**Instrument the resilience patterns.** A [Circuit Breaker](/pattern/circuit-breaker)
opening, a [Timeout](/pattern/timeout) firing or a retry succeeding are exactly the
events you need to see; expose their state as metrics and record them as span events,
or they will hide the outage they are mitigating.

**SLOs turn telemetry into decisions.** Define an SLI (fraction of requests under
300 ms with status < 500), an objective (99.9% per 30 days) and alert when the error
budget is being consumed too fast. Burn-rate alerts are quieter and more meaningful
than static thresholds.

**Cost and retention.** Telemetry volume can rival production traffic. Sample traces,
aggregate logs into metrics where the per-event detail is not needed, tier retention
(hot for days, cold for months), and drop debug logs in production by default with a
switch to enable them per request.

**Privacy.** Logs and spans capture request data; keep personal data, tokens and
secrets out of them by design (redaction at the SDK or collector), because telemetry
stores are rarely protected like the primary database.

## Related

- [Prometheus](/technology/prometheus) — the de facto metrics store in cloud-native systems
- [Elasticsearch](/technology/elasticsearch) — a common backend for centralised logs
- [Availability](/concept/availability) — MTTR is where observability pays off
