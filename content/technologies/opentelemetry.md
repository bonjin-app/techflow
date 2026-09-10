---
id: opentelemetry
name: OpenTelemetry
tagline: Vendor-neutral standard, SDKs and collector for traces, metrics and logs
category: observability
tags: [Observability, Tracing, Metrics, Standard, Instrumentation]
difficulty: 3
usedFor: [observability, slo, distributed-system]
prerequisites: [http, backend, distributed-system, observability]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - distributed-system
  - observability
  - opentelemetry
  - prometheus
  - slo
related:
  - { to: observability, rel: RELATED_TO }
  - { to: prometheus, rel: USED_WITH }
  - { to: slo, rel: RELATED_TO }
  - { to: sidecar, rel: RELATED_TO }
  - { to: kubernetes, rel: USED_WITH }
  - { to: grpc, rel: USED_WITH }
  - { to: microservices, rel: USED_IN }
  - { to: iot-telemetry, rel: USED_IN }
  - { to: analytics-pipeline, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "OTLP 1.x; traces/metrics/logs stable, profiling still developing", confidence: medium }
---

## TL;DR

OpenTelemetry is not a monitoring product — it is the **standard** for producing telemetry.
It defines a wire protocol (OTLP), a set of naming conventions, per-language SDKs, and a
routing daemon called the Collector. Your code emits spans, metrics and logs against a
vendor-neutral API; the Collector receives them, processes them and forwards them to
whichever backend you pay for. The point is that instrumentation lives in your codebase and
survives changing vendors. It is a CNCF project and, by activity, one of the largest after
Kubernetes.

## Practical

Three moving parts, in the order you meet them:

1. **Instrumentation in the service.** Auto-instrumentation covers the framework
   boundaries — incoming HTTP, outgoing HTTP, database drivers, [gRPC](/technology/grpc),
   message consumers — usually with an agent or a single import. You add manual spans only
   for the business steps that matter.
2. **Context propagation.** A `traceparent` header (W3C Trace Context) carries the trace id
   across every hop, so one request through five services is one trace — the part that
   actually makes [Microservices](/architecture/microservices) debuggable.
3. **The Collector.** A separate binary deployed as a [Sidecar](/pattern/sidecar), a
   DaemonSet or a central gateway. It batches, samples, redacts and fans telemetry out.

```yaml
# collector: receive OTLP from services, sample, then fan out
receivers:
  otlp:
    protocols: { grpc: { endpoint: 0.0.0.0:4317 }, http: { endpoint: 0.0.0.0:4318 } }

processors:
  memory_limiter: { check_interval: 1s, limit_percentage: 75 }
  tail_sampling:                       # keep every error, 5% of the rest
    policies:
      - { name: errors, type: status_code, status_code: { status_codes: [ERROR] } }
      - { name: slow, type: latency, latency: { threshold_ms: 500 } }
      - { name: baseline, type: probabilistic, probabilistic: { sampling_percentage: 5 } }
  batch: { timeout: 5s, send_batch_size: 8192 }

exporters:
  otlp/vendor: { endpoint: otel.vendor.example:4317 }
  prometheus: { endpoint: 0.0.0.0:9464 }   # scraped by Prometheus

service:
  pipelines:
    traces:  { receivers: [otlp], processors: [memory_limiter, tail_sampling, batch], exporters: [otlp/vendor] }
    metrics: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [prometheus] }
```

Set `service.name`, `service.version` and `deployment.environment` as resource attributes on
day one — telemetry without them is nearly useless for correlation.

## Deep Dive

**Signals mature at different rates.** Tracing stabilised first, then metrics, then logs;
continuous profiling is the newest signal and still moving. "OpenTelemetry is stable" is
therefore a per-signal, per-language claim — check the SDK's own status page before betting
a migration on it. Bridges exist for existing log libraries, so you rarely rewrite logging.

**Semantic conventions are the real product.** Agreeing that an HTTP server span carries
`http.request.method`, `http.response.status_code` and `server.address` is what lets one
dashboard or alert work across services written in different languages. The conventions have
been through renames (notably the HTTP set), so pin a version and expect one migration if
you instrumented early.

**Sampling is a cost decision with correctness consequences.** *Head* sampling decides at
the root span: cheap but blind — you may drop the one slow request you needed. *Tail*
sampling in the Collector buffers a whole trace before deciding, so you keep all errors and
slow traces, at the price of memory and of routing every span of a trace to the same
Collector instance. Getting that routing wrong produces broken, partial traces.

**Metrics vs traces.** Traces answer "what happened in this request"; metrics answer "what
is the rate and distribution across all requests". [Prometheus](/technology/prometheus) is
the usual metrics destination — scraping the Collector's exporter or receiving OTLP
directly. The two are complements: you alert on metrics and [SLOs](/concept/slo), then open
a trace to find out why.

**Overhead and cardinality.** SDK overhead on a well-configured service is typically low
single-digit percent CPU, but two mistakes are expensive: putting a high-cardinality value
(user id, request id, full URL) into a *metric* attribute, which multiplies time series,
and exporting 100% of spans to a per-gigabyte vendor. Telemetry bills have surprised more
teams than telemetry latency has.

**The Collector is infrastructure.** It needs memory limits, a queue, retry with backoff
and its own monitoring. An unmonitored Collector silently dropping data is worse than no
Collector, because the dashboards still look fine.

## Why

Before a common standard, every vendor shipped its own agent, SDK and field names.
Instrumentation was written against a vendor API, so switching backends meant touching
every service, and a polyglot estate had a different trace format per language.

```sequence
title: Before — one proprietary agent per vendor, per language
participants: Svc A [nodejs], Svc B [go], Svc C [python], Vendor X, Vendor Y
Svc A -> Vendor X: vendor SDK, vendor field names
Svc B -> Vendor X: different agent, no trace context passed on
Svc C -> Vendor Y: second vendor, second instrumentation effort
Vendor X --> Svc A: trace for A only — the hop to B is a black box
Svc A -> Svc B: HTTP call (no traceparent header)
Svc B --> Svc A: 500 — cause invisible, three dashboards to correlate by hand
```

With OpenTelemetry the service is instrumented once against a neutral API and exports OTLP
to a Collector. Trace context is propagated by the same standard headers everywhere, so a
request across languages is a single trace, and the vendor becomes a Collector config line
rather than a code change.

```sequence
title: After — instrument once, propagate context, route in the Collector
participants: Svc A [nodejs], Svc B [go], Svc C [python], Collector [opentelemetry], Prometheus [prometheus], Vendor
Svc A -> Svc B: HTTP + traceparent
Svc B -> Svc C: gRPC + traceparent
Svc A -> Collector: OTLP spans/metrics
Svc B -> Collector: OTLP spans/metrics
Svc C -> Collector: OTLP spans/metrics
Collector -> Collector: batch, redact, tail-sample
Collector -> Prometheus: metrics
Collector --> Vendor: one end-to-end trace, swappable destination
```

The payoff shows up the first time you change backends, or the first time an incident spans
three services written by three teams.

## Advantages

- Vendor-neutral: instrumentation outlives your monitoring contract
- One API and one wire format across languages, frameworks and infrastructure components
- Auto-instrumentation gives useful traces with very little application code
- W3C Trace Context propagation makes cross-service requests a single trace
- The Collector centralises sampling, redaction, enrichment and routing outside the app
- Semantic conventions make dashboards and alerts portable between services

## Trade-offs

- Large surface area: API, SDK, Collector, conventions — plenty to learn and to operate
- Signal and language maturity vary; check status per SDK rather than trusting "stable"
- Semantic-convention renames have forced dashboard migrations on early adopters
- Tail sampling needs trace-aware routing; misconfiguration yields broken partial traces
- High-cardinality attributes on metrics blow up storage cost quickly
- It produces telemetry but stores nothing — you still need a backend, and a bill
- SDK overhead on very hot paths is real and must be measured, not assumed

## When to use

- Any system with more than a handful of services, especially polyglot ones
- When you want to avoid or undo lock-in to a single observability vendor
- Distributed debugging: latency that only appears across service boundaries
- Adding trace context to an existing metrics-only setup built on [Prometheus](/technology/prometheus)
- Edge and device fleets where the Collector can aggregate before egress costs bite

## When not to use

- Don't add distributed tracing to a single-process monolith with one database — logs and metrics are usually enough
- When no one is funded to run the Collector and the backend; unowned telemetry rots
- If your vendor's own agent already gives everything you need and lock-in is acceptable to you
- On extremely hot, allocation-sensitive paths where per-span overhead is measurable — sample at the source instead
- As a replacement for [Observability](/concept/observability) practice: dashboards nobody reads are not improved by a new protocol

## Real-world

The typical shape in a [Microservices](/architecture/microservices) deployment is: SDK in
every service, a Collector DaemonSet per node doing batching and redaction, a central
Collector gateway doing tail sampling, then metrics to
[Prometheus](/technology/prometheus) and traces to a hosted backend. In
[IoT Telemetry](/architecture/iot-telemetry) the Collector sits at the edge gateway,
aggregating and downsampling device data before it crosses an expensive link. In an
[Analytics Pipeline](/architecture/analytics-pipeline) the same Collector is sometimes used
as generic plumbing — receive OTLP, export to [Kafka](/technology/kafka) or object
storage — because it already handles batching, retry and backpressure. Ownership matters
more than tooling here: the teams that get value from OpenTelemetry treat `service.name`,
span attributes and [SLOs](/concept/slo) as reviewed code, not as a one-off installation.
