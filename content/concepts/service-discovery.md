---
id: service-discovery
name: Service Discovery
tagline: Finding a healthy instance of a service whose addresses change every deploy
category: infrastructure
tags: [Microservices, Networking, Infrastructure, Reliability]
difficulty: 3
prerequisites: [dns, load-balancing, microservices]
learningPath:
  - dns
  - load-balancing
  - microservices
  - service-discovery
  - health-check
  - service-mesh
related:
  - { to: load-balancing, rel: RELATED_TO }
  - { to: health-check, rel: REQUIRES }
  - { to: dns, rel: RELATED_TO }
  - { to: kubernetes, rel: USED_WITH }
  - { to: service-mesh, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: consensus, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

In a static world you configure the address of the thing you call. In a world of containers,
autoscaling and rolling deploys, that address changes several times a day and there are
between three and thirty of them at any moment. Service discovery is the registry that
answers "where is `orders` right now, and which instances are healthy?". Almost nobody builds
one: [Kubernetes](/technology/kubernetes) gives you a stable DNS name in front of a set of
pods whose membership is maintained by health checks, and that covers the majority of cases.
What you do need to understand is the staleness window — the seconds between an instance
dying and every caller knowing — because that window is where your failed requests live.

## Why it matters

Hardcoded addresses fail in a specific, recognisable way: a deploy finishes, and one service
keeps sending traffic to instances that no longer exist. Connection refused, or worse,
connection accepted by whatever now owns the IP.

The problem is not solved by a load balancer alone, because something has to keep the load
balancer's target list correct. And it is not solved by DNS alone, because DNS was designed
for records that change rarely: clients and libraries cache aggressively, often ignoring TTL,
so an address change propagates on a schedule nobody controls. The JVM's historical habit of
caching DNS forever is the classic version of this bug.

What you actually need is three things working together: a registry that knows which
instances exist, a health signal that removes the ones that are broken, and a client or
proxy that re-reads the list often enough to matter. Get any one wrong and you have a system
that routes traffic to the dead.

## Visual

```sequence
title: An instance dies, and the seconds before everyone knows
participants: Instance, Registry [consensus], Checker [health-check], Caller, LB [load-balancing]
Instance -> Registry: register orders-7 at 10.0.3.14:8080
Checker -> Instance: GET /healthz every 2s
Instance --> Checker: 200 OK
Caller -> Registry: who is orders? (cached for 5s)
Registry --> Caller: [orders-5, orders-7, orders-9]
Instance -> Instance: process dies
Checker -> Instance: no response — 1 of 3 strikes
Checker -> Instance: no response — 3 strikes, mark unhealthy
Registry -> LB: remove orders-7 from the pool
Caller -> Instance: still calling orders-7 from its cached list — this is the window
Caller -> Registry: refresh → orders-7 is gone; the caller needed a retry to survive it
```

## Solutions

**Use the platform's discovery rather than building one.** On Kubernetes a Service gives you
a stable DNS name and a virtual IP; the endpoint list is maintained from readiness probes,
and kube-proxy or the CNI spreads connections across it. Cloud load balancers do the
equivalent with target groups and health checks. A bespoke registry is a distributed system
you now operate, with its own consensus and failure modes — see
[Consensus](/concept/consensus) for what that costs.

**Make readiness mean ready.** The registry is only as good as the health signal behind it,
and the most common mistake is a probe that returns 200 as soon as the process starts, before
the connection pool is warm or the caches are loaded. Distinguish liveness (restart me) from
readiness (send me traffic), and make readiness check the dependencies the instance needs to
actually serve. [Health Check](/pattern/health-check) covers the shapes.

**Drain before you stop.** Removal from the registry is not instantaneous, so a pod that
exits the moment it receives SIGTERM will drop in-flight requests and receive new ones for a
few seconds afterwards. The correct shutdown is: fail readiness, keep serving, wait longer
than the propagation window, then close. That is [Graceful Shutdown](/concept/graceful-shutdown),
and it is the other half of discovery working.

**Assume the list is stale and retry.** No propagation is instant, so a caller will
occasionally reach an instance that has gone. The design answer is not a faster registry, it
is a caller that retries an idempotent request against a different instance —
[Retry](/pattern/retry) with backoff, plus a [Circuit Breaker](/pattern/circuit-breaker) so
a genuinely dead dependency does not consume every thread.

**Choose where the load-balancing decision is made.** *Server-side*: callers hit one address
and a proxy picks the instance — simple, one more hop, one more thing to scale.
*Client-side*: the caller holds the instance list and picks itself — one less hop and better
locality, but now every client in every language needs that logic. *Sidecar*: a proxy per
pod gives client-side behaviour without client libraries, which is the trade a
[Service Mesh](/concept/service-mesh) makes.

**If you use DNS, control the caching.** Short TTLs, clients that honour them, and no
process-lifetime caching. Where possible prefer an endpoints API over DNS for
fast-changing sets — DNS is a fine name resolver and a poor membership protocol.

## Deep Dive

**The staleness window is a budget you set.** Detection (how many failed probes at what
interval) plus propagation (registry to caller) plus client cache TTL is the time during
which traffic goes to a dead instance. Tighten it and you get faster failure removal and more
false positives from a slow GC pause or a brief network blip — which evict healthy instances
and can cascade. Loosen it and failures last longer. Pick the numbers deliberately; the
defaults were chosen for someone else's traffic.

**Self-registration versus third-party registration.** An instance can register itself on
start and deregister on stop — simple, and it fails exactly when the instance crashes, which
is when you need it most, so it needs a lease that expires. Or a platform controller watches
what is actually running and maintains the registry, which is how Kubernetes works and why it
does not depend on the application behaving well while dying.

**Leases beat deregistration.** A registration with a TTL that the instance must renew
handles crashes for free: stop renewing and you disappear. This is why registries are built
on lease stores like etcd, and why a network partition between an instance and the registry
looks identical to death — the instance vanishes from the list while still serving anyone
holding its address.

**Discovery is not authorisation.** Being findable is not being allowed. A registry that
lists every service to every caller is convenient and is also a map for anything that gets
inside. Network policy, mutual TLS between services and per-service authorisation are
separate layers — see [Networking & VPC](/concept/cloud-networking) and
[RBAC](/concept/rbac).

**Cross-cluster and cross-region make it a real problem again.** Within one cluster the
platform handles it. Across clusters, regions or a hybrid estate, you are federating
registries, deciding whether a caller prefers a local instance, and handling the case where
the remote registry is unreachable. Prefer locality with an explicit failover rather than one
global pool, or a regional outage becomes a global latency event.

**Know what happens when the registry is down.** The good answer is that callers keep using
their last known list and the system degrades slowly. The bad answer is that lookups fail and
every service stops calling every other service at once. Check which one you have before you
find out — the registry is infrastructure that everything depends on, and it should fail
static, not closed.
