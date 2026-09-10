---
id: sidecar
name: Sidecar
tagline: Run cross-cutting concerns in a helper process next to the application
category: distributed
tags: [Distributed System, Infrastructure, Containers]
difficulty: 3
prerequisites: [backend, distributed-system, docker]
learningPath:
  - backend
  - http
  - docker
  - kubernetes
  - sidecar
  - observability
related:
  - { to: observability, rel: SOLVES }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: docker, rel: RELATED_TO }
  - { to: opentelemetry, rel: USED_WITH }
  - { to: nginx, rel: USED_WITH }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

Every service in a fleet needs the same set of things that have nothing to do
with its business logic: TLS termination between services, retries and
[timeouts](/pattern/timeout), a [circuit breaker](/pattern/circuit-breaker),
metric export, structured log shipping, distributed tracing headers, secret
rotation, config reload.

Implementing these inside each service means a library per language. Ten services
in four languages is four implementations of the same retry policy — and when you
change the tracing header format, you need forty deployments coordinated across
teams that do not share a release calendar. Services written in a language with no
maintained library are simply excluded. The behaviour drifts, and "is
mutual TLS enabled everywhere?" becomes unanswerable.

## Solution

Deploy a **second process next to the application** — same host, same pod, same
lifecycle, same network namespace — and let it own the cross-cutting concern. The
application talks to `localhost`; the sidecar talks to the world. The application
knows nothing about TLS, retries or where metrics go.

Because the sidecar is a separate process, it is language-agnostic: one Go binary
serves a Python service and a Java service equally. Because it shares the pod, it
shares the network interface and can mount the same volumes, so the coupling is
tight enough to be useful (localhost latency, shared filesystem) without being a
library.

```sequence
title: Outbound call through a sidecar proxy
participants: App [backend], Sidecar [nginx], Peer Sidecar [nginx], Peer [backend]
App -> Sidecar: GET http://orders/ (plain HTTP, localhost)
Sidecar -> Sidecar: apply retry + timeout policy
Sidecar -> Peer Sidecar: mTLS, trace headers added
Peer Sidecar -> Peer: plain HTTP, localhost
Peer --> Peer Sidecar: 200 OK
Peer Sidecar --> Sidecar: 200 OK
Sidecar --> App: 200 OK
```

```steps
title: What the sidecar takes over
Service discovery and load balancing [load-balancing]
Mutual TLS between services [tls] | certificates rotated without touching the app
Retries, timeouts, circuit breaking [circuit-breaker]
Metric and trace export [observability] | one exporter config for every language
Log collection from a shared volume
Rate limiting at the edge of each pod [rate-limiting]
```

## How it works

A pod (or a systemd unit pair, or two containers on the same host) runs the
application container and the sidecar container together. Traffic is redirected
into the sidecar either explicitly — the app calls `localhost:15001` — or
transparently, by rewriting iptables rules in the pod so all outbound
connections are intercepted.

```yaml
# Kubernetes: two containers, one lifecycle
spec:
  containers:
    - name: app
      image: orders:1.4.2
      env: [{ name: PEER_URL, value: "http://localhost:15001/inventory" }]
    - name: proxy            # sidecar
      image: envoy:1.31
      volumeMounts: [{ name: certs, mountPath: /etc/certs }]
```

Three flavours are common. A **proxy sidecar** handles network traffic (this is
what a service mesh deploys on every pod). An **agent sidecar** collects
something and pushes it out — a log tailer, a metrics scraper, an
[OpenTelemetry](/technology/opentelemetry) collector. An **adapter sidecar**
translates: it exposes a legacy service's odd health endpoint as the standard
one the platform expects.

The sidecar's lifecycle matters more than it looks. If the sidecar starts after
the app, the app's first calls fail; if it stops before the app drains, the last
requests fail. Container platforms grew explicit sidecar start/stop ordering
precisely because of these two bugs.

## Advantages

- One implementation serves every language and framework in the fleet
- Policy is upgraded by rolling the sidecar image — no application release
- The application gets smaller and its dependency tree shrinks
- Uniform, auditable behaviour: mTLS, retries and tracing are either on for the pod or not
- Enables legacy or third-party services to join the platform without code changes
- Failure is contained to the pod: a broken sidecar affects one instance, not a shared gateway

## Disadvantages

- Doubles the number of running processes; CPU and especially memory overhead per instance is real (tens to hundreds of MB each)
- Adds two extra network hops per call — usually a few milliseconds, which matters for chatty internal traffic
- Startup and shutdown ordering bugs are subtle and show up as rare 5xx during deploys
- Debugging gets harder: is the 503 from the app, its sidecar, or the peer's sidecar?
- Configuration moves to a control plane that is itself a system to operate and understand
- Resource requests must be tuned twice, and the sidecar competes with the app for the pod's limits

## When to use

- A polyglot fleet needs consistent networking, security or telemetry behaviour
- You want to change cross-cutting policy without redeploying dozens of services
- Legacy services must be brought under a common platform contract
- Running on [Kubernetes](/technology/kubernetes) or another platform where co-scheduled containers are cheap to express

## When not to use

- A handful of services in one language — a shared library is cheaper and faster
- Latency budgets are tight and internal calls are frequent; extra hops per call add up
- Resource-constrained environments (edge devices, small nodes) where per-pod memory doubles
- The concern is not actually cross-cutting; a sidecar holding business logic is a distributed monolith with extra steps
- Your platform cannot guarantee co-location and lifecycle coupling — then it is just another service

## Real-world

Service meshes are the best-known sidecar deployment: a proxy on every pod
handling mTLS, retries and traffic shifting for
[Canary Releases](/pattern/canary-release). Log and metric agents
([Prometheus](/technology/prometheus) exporters, OpenTelemetry collectors) are
the other everyday case. In the [Microservices](/architecture/microservices)
architecture the sidecar is where per-service TLS and telemetry live, so each
service ships only its own domain code — and the honest counterweight is that
teams running fewer than a dozen services usually find a shared library gives
them 80% of the benefit for a fraction of the operational cost.
