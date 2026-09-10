---
id: service-mesh
name: Service Mesh
tagline: Move retries, mTLS and routing out of services into a managed proxy layer
category: architecture
tags: [Architecture, Networking, Kubernetes, Observability]
difficulty: 4
prerequisites: [microservices, load-balancing, tls, observability]
learningPath:
  - microservices
  - kubernetes
  - sidecar
  - observability
  - service-mesh
related:
  - { to: kubernetes, rel: USED_WITH }
  - { to: sidecar, rel: IMPLEMENTS }
  - { to: observability, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: tls, rel: REQUIRES }
  - { to: canary-release, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

A service mesh is an infrastructure layer that takes over service-to-service networking. A
proxy runs next to every workload — as a [Sidecar](/pattern/sidecar) container or, in newer
designs, a per-node agent — and a control plane configures all of them: mutual TLS,
retries, timeouts, outlier ejection, traffic splitting and uniform telemetry. The
application keeps calling `http://orders`; the mesh decides what actually happens to that
call. The value is consistency across languages; the cost is a second, sizeable
distributed system to operate.

## Why it matters

In a [Microservices](/architecture/microservices) estate, every service needs the same
handful of behaviours: encrypt in transit, retry idempotent failures, time out, stop
hammering a dead replica, and emit comparable metrics and traces. Implementing that in a
library means N implementations across N languages and a coordinated upgrade every time a
default changes — the "library fleet upgrade" problem. Moving it into a proxy makes the
behaviour identical for a Go service and a Python one, and lets you change a timeout
without redeploying anyone's code.

## Visual

```steps
title: One request through two sidecars
1. Caller resolves orders | plain HTTP to orders.svc, no mesh awareness in the code
2. Iptables/eBPF redirect | traffic is transparently captured by the local sidecar
3. Outbound sidecar decides | policy from the control plane, pick endpoint, apply timeout and retry budget
4. mTLS handshake | client cert identity spiffe://cluster/ns/shop/sa/checkout, verified both ways
5. Load balance | least-request across healthy endpoints, outlier ejection removes bad pods
6. Inbound sidecar of orders | verify peer identity, check authorization policy, rate limit
7. Local hop to the app | localhost call, the orders process sees a normal request
8. Response and telemetry | both proxies record latency, code, retries and trace spans
9. Control plane loop | it never touches the request, it only pushes config and collects stats
```

## How it works

**Data plane.** The proxies (commonly Envoy) do the work: service discovery from the
control plane, connection pooling, HTTP/1.1, [HTTP/2](/concept/http2) and gRPC awareness,
header-based routing, weighted splitting, fault injection, and per-endpoint health.
Interception is transparent — iptables rules or eBPF hooks — so no application change is
needed.

**Control plane.** It watches the platform's service registry ([Kubernetes](/technology/kubernetes)
Services and Endpoints), turns declarative policy into proxy configuration, and
distributes it over a streaming API. It also runs the certificate authority that issues
short-lived workload identities, which is the mesh's most durable benefit: mTLS everywhere,
with rotation, without asking application teams to manage certificates. See
[Secrets Management](/concept/secrets-management).

**Traffic management.** Because routing is a config object, a
[Canary Release](/pattern/canary-release) becomes "send 5% of requests with a weight",
independent of replica counts. Mirroring copies live traffic to a new version and discards
the responses. Header-based routing lets a request carry its own routing decision through
the whole call chain.

**Resilience.** [Timeout](/pattern/timeout), [Retry](/pattern/retry),
[Circuit Breaker](/pattern/circuit-breaker) and [Bulkhead](/pattern/bulkhead) equivalents
are all proxy features. Note that mesh "circuit breaking" is usually connection-pool limits
plus outlier ejection, which is not identical to a state-machine breaker in the caller —
it protects the target more than it protects the caller's threads.

**Observability.** Uniform RED metrics (rate, errors, duration) for every hop, without
instrumenting anyone's code, plus a full topology graph. Traces still need application
cooperation: proxies can start a span, but only the application can propagate the context
across its internal work, so [OpenTelemetry](/technology/opentelemetry) headers must be
forwarded by the service itself.

## Deep Dive

**The cost is real.** Two extra proxy hops add latency — typically low single-digit
milliseconds per hop, which matters when a page is 20 calls deep. Each sidecar consumes
memory and CPU per pod, so a 500-pod cluster runs 500 proxies. And the control plane is a
critical dependency: a bad config push can break every service at once, which is a failure
mode services with libraries do not have. Sidecarless and per-node designs (ambient mode,
eBPF-based meshes) exist to cut the per-pod overhead, trading it for weaker isolation
between workloads sharing an agent.

**Retries are the classic footgun.** Mesh-level retries are invisible to application
authors, so a retry at every layer multiplies: three hops with three attempts each is 27
requests to the innermost service, exactly when it is already struggling. Configure retry
budgets (a cap on the retried fraction of traffic), retry only idempotent methods, and pair
them with [Idempotency](/concept/idempotency) keys.

**Startup and shutdown ordering.** If the app starts before its sidecar, its first calls
fail; if the sidecar exits before the app, the last calls fail. Every mesh has mechanisms
for this, and every mesh deployment eventually debugs it — it is closely tied to
[Graceful Shutdown](/concept/graceful-shutdown).

**Debuggability.** A request now traverses two processes you did not write. Symptoms become
indirect: a 503 with a mesh-specific flag, a TLS failure from a mismatched policy, a
mysterious 5-second latency from an inherited default. Teams need to learn the proxy's
admin interface and stats, and that learning curve is the most commonly under-estimated
cost.

**When it is worth it.** Many services, several languages, a hard requirement for
encryption in transit or per-service authorization, and a platform team that can own the
mesh. When one team runs three Go services, a shared library or the platform's built-in
load balancing is simpler and faster. A [Modular Monolith](/pattern/modular-monolith) has
no service-to-service network to manage at all.

**Not an API gateway.** An [API Gateway](/concept/api-gateway) faces untrusted clients and
handles authentication, quotas and public contracts (north-south); a mesh governs internal
traffic between trusted-but-verified workloads (east-west). They overlap in implementation
and are frequently the same proxy binary, but the policies and owners differ. Running one
does not remove the need for the other.

**Zero trust, incrementally.** The pragmatic adoption path is mTLS in permissive mode
first, then observability, then authorization policies, then traffic management. Turning on
strict mTLS everywhere on day one is how meshes get abandoned.
