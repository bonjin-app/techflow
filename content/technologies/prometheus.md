---
id: prometheus
name: Prometheus
tagline: Pull-based metrics store and query language that became the observability standard
category: observability
tags: [Observability, Monitoring, Metrics, Time Series]
difficulty: 3
usedFor: [observability, availability]
prerequisites: [http, backend, distributed-system, observability]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - docker
  - kubernetes
  - observability
  - prometheus
related:
  - { to: observability, rel: RELATED_TO }
  - { to: availability, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: kubernetes, rel: USED_WITH }
  - { to: docker, rel: USED_WITH }
  - { to: nginx, rel: USED_WITH }
  - { to: microservices, rel: USED_IN }
  - { to: payment-system, rel: USED_IN }
  - { to: video-streaming, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "Prometheus 3.x", confidence: high }
---

## TL;DR

Prometheus is an open-source monitoring system built around a time-series database. It
**scrapes** metrics over HTTP from every service on a schedule, stores them locally with
labels, and lets you query and alert on them with PromQL. Its exposition format became
the OpenMetrics standard, so almost every runtime, proxy, database and cloud component
can expose metrics it understands. It is the metrics pillar of
[observability](/concept/observability) — not logs, not traces — and it is designed for
reliability of monitoring over long-term storage.

## Practical

A working setup has four parts: instrumented services, a Prometheus server, Alertmanager,
and a dashboard (usually Grafana).

- **Instrument** your code with a client library exposing `/metrics`: counters for
  requests and errors, histograms for latency, gauges for in-flight work and queue
  depth. Follow the four golden signals (latency, traffic, errors, saturation).
- **Exporters** expose metrics for things you did not write: node_exporter (host),
  kube-state-metrics, exporters for [NGINX](/technology/nginx),
  [PostgreSQL](/technology/postgresql), [Redis](/technology/redis),
  [Kafka](/technology/kafka).
- **Service discovery** — in [Kubernetes](/technology/kubernetes) Prometheus finds pods
  via annotations or `ServiceMonitor` objects; no manual target lists.
- **Alert rules** in PromQL fire into Alertmanager, which groups, deduplicates, silences
  and routes to chat, paging or email.
- **Recording rules** precompute expensive queries for dashboards.

```yaml
# prometheus.yml (excerpt)
global: { scrape_interval: 15s, evaluation_interval: 15s }
scrape_configs:
  - job_name: api
    kubernetes_sd_configs: [{ role: pod }]
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"
rule_files: [alerts.yml]

# alerts.yml — error budget burning fast
groups:
  - name: api
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{job="api",status=~"5.."}[5m]))
            / sum(rate(http_requests_total{job="api"}[5m])) > 0.02
        for: 5m
        labels: { severity: page }
        annotations: { summary: "API 5xx ratio above 2% for 5m" }
```

For long retention or many clusters, remote-write to Thanos, Cortex/Mimir, or a managed
Prometheus-compatible backend; the local server keeps recent data and alerts.

## Deep Dive

**Pull model.** Prometheus scrapes targets rather than receiving pushes. Consequences:
the server knows when a target is down (`up == 0`), scrape load is controlled centrally,
and services need no knowledge of the monitoring system. Short-lived jobs use the
Pushgateway, and edge/IoT setups use remote-write agents — both are exceptions to the
model rather than the norm.

**Data model.** A time series is a metric name plus a set of label key/value pairs;
each sample is a float64 and a millisecond timestamp. Labels make PromQL powerful
(`sum by (route)`), and also cause the classic failure: a high-cardinality label (user
id, request id, full URL) multiplies series and blows up memory. Native histograms in
3.x reduce the cost of latency distributions considerably.

**Storage.** Samples land in an in-memory head block and a write-ahead log, then get
compacted into two-hour blocks on local disk with heavy compression (~1–2 bytes per
sample). It is a single-node database by design: no clustering, no replication. HA is
two identical servers scraping the same targets; long-term and global views come from
remote-write systems built on top.

**PromQL.** Functions like `rate()`, `histogram_quantile()`, `increase()` and vector
matching across label sets let you compute error ratios, p99 latency and saturation from
raw counters. Counters reset on restart; `rate()` handles that. Most alerting mistakes
are PromQL mistakes: rating a gauge, wrong range windows, missing `for:`.

**Alerting philosophy.** Alert on symptoms (users see errors, latency budget burning)
rather than causes (CPU high). Multi-window burn-rate alerts on SLOs are the standard
pattern. Alertmanager's grouping and inhibition keep one outage from producing a hundred
pages.

## Why

A system of many services fails in ways no single log line explains. Without metrics you
learn about problems from customers, then grep logs on individual hosts, and cannot
answer "is it getting worse?" or "did the deploy at 14:02 cause this?" — because you
have no numbers over time, only anecdotes.

```sequence
title: Before — outage discovered by users, diagnosed by hand
participants: Users, Support, Engineer, Host-3 [backend]
Users -> Support: "checkout is slow / failing"
Support -> Engineer: ticket after 40 minutes
Engineer -> Host-3: ssh, tail app.log, grep 500
Host-3 --> Engineer: thousands of lines, no baseline to compare
Engineer -> Engineer: which of 12 hosts? since when? deploy-related? ❌
```

With Prometheus every instance exposes counters and histograms, the server scrapes them
every 15 seconds, and a PromQL alert fires when the error ratio crosses a threshold —
minutes before the first ticket. The dashboard shows the exact moment the rate changed,
broken down by version, route and instance.

```sequence
title: After — metrics scraped continuously, symptom-based alert fires first
participants: API pods [kubernetes], Prometheus [prometheus], Alertmanager, Engineer
Prometheus -> API pods: GET /metrics (every 15s, all pods via service discovery)
API pods --> Prometheus: http_requests_total, http_request_duration_seconds
Prometheus -> Prometheus: eval rate(5xx)/rate(all) > 2% for 5m
Prometheus -> Alertmanager: HighErrorRate{severity=page}
Alertmanager -> Engineer: one grouped page with runbook link (T+5m)
Engineer -> Prometheus: PromQL: sum by (version) (rate(...5xx...))
Prometheus --> Engineer: errors only on version=2.14.0 → roll back
```

The same data drives capacity planning, SLO reporting and autoscaling decisions, which
is why metrics are usually the first observability signal a team invests in.

## Advantages

- Simple, robust pull model with built-in target health; monitoring keeps working when the rest is failing
- Multidimensional label-based data model and an expressive query language (PromQL)
- De-facto standard exposition format; exporters and client libraries exist for nearly everything
- First-class Kubernetes service discovery; the default in the cloud-native ecosystem
- Efficient local storage and single-binary operation — easy to run and reason about
- Strong alerting stack with grouping, silencing and routing via Alertmanager

## Trade-offs

- Single-node storage: no built-in clustering, replication or long-term retention; you add Thanos/Mimir/managed backends for that
- High-cardinality labels cause memory blow-ups and are the top operational hazard
- Pull model is awkward for short-lived jobs, serverless functions and networks you cannot scrape into
- Metrics only — logs and traces need separate systems (or OpenTelemetry pipelines feeding several backends)
- Float64 samples and scrape intervals make it unsuitable for exact counts, billing or per-event data
- PromQL has a real learning curve; bad queries silently produce wrong alerts

## When to use

- Monitoring services and infrastructure in Kubernetes or any container platform
- Alerting on SLO burn rates, error ratios, latency percentiles and saturation
- Capacity and performance dashboards where 15-second granularity is sufficient
- Environments where you want vendor-neutral instrumentation (OpenMetrics/OpenTelemetry) with a self-hosted or compatible backend
- Feeding autoscalers and [circuit breakers](/pattern/circuit-breaker) with health signals

## When not to use

- Don't use Prometheus as an event store or for per-request analytics — that is logs or traces, and it aggregates by design
- When you need exact, durable counts (billing, audit) — use a transactional database
- For years of retention or global multi-cluster queries on its own; pair it with a long-term store or a managed service
- When most workloads are short-lived functions that cannot be scraped and a push-based or vendor-native metrics service is simpler
- For business KPIs with high-cardinality dimensions (per customer, per SKU) — a warehouse fits better

## Real-world

In a [Microservices](/architecture/microservices) platform Prometheus scrapes every pod,
the ingress ([NGINX](/technology/nginx)), the message brokers and the databases, and
Grafana dashboards per service are generated from the same label conventions. A
[Payment System](/architecture/payment-system) alerts on authorization error ratio and
p99 latency per provider so a failing acquirer is detected and routed around within
minutes; a [Video Streaming](/architecture/video-streaming) service tracks segment
delivery latency, transcoder queue depth and CDN origin hit ratio to decide when to
scale. Managed Prometheus-compatible services from every major cloud mean the same
instrumentation works whether you run the server yourself or not.
