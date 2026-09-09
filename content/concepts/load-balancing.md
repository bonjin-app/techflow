---
id: load-balancing
name: Load Balancing
tagline: Spread incoming requests across many servers so no single one becomes the bottleneck
category: networking
tags: [Networking, Scalability, Infrastructure]
difficulty: 2
prerequisites: [http, backend]
learningPath:
  - http
  - backend
  - load-balancing
  - session
  - kubernetes
  - distributed-system
related:
  - { to: http, rel: REQUIRES }
  - { to: backend, rel: REQUIRES }
  - { to: session, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: websocket, rel: RELATED_TO }
  - { to: chat-system, rel: USED_IN }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A load balancer sits in front of a pool of identical servers and decides which one
handles each incoming connection or request. It gives you horizontal scaling (add
servers to add capacity), availability (unhealthy servers are removed from rotation)
and a single stable address for clients. The catch: your servers must be
**stateless** or share state elsewhere, because the next request may land anywhere.

## Why it matters

One server has a ceiling — CPU, memory, connection count. Vertical scaling (a bigger
machine) buys time but ends at the largest instance you can afford and leaves a
single point of failure. Horizontal scaling behind a load balancer is how nearly
every web [Backend](/concept/backend) grows past a single box, and it is the first
step in the journey from a [Simple Web App](/architecture/simple-web-app) to a
distributed system.

The load balancer is also the natural place for cross-cutting concerns: TLS
termination, health checks, request logging and coarse
[Rate Limiting](/concept/rate-limiting).

## Visual

```sequence
title: Round-robin with a health check
participants: Client, LB, API-1 [backend], API-2 [backend], API-3 [backend]
Client -> LB: GET /orders
LB -> API-1: GET /orders
API-1 --> LB: 200 OK
LB --> Client: 200 OK
Client -> LB: GET /orders
LB -> API-2: GET /orders
API-2 --> LB: 200 OK
LB --> Client: 200 OK
LB -> API-3: GET /health
API-3 --> LB: timeout ❌ (removed from pool)
Client -> LB: GET /orders
LB -> API-1: GET /orders (API-3 skipped)
API-1 --> LB: 200 OK
LB --> Client: 200 OK
```

## How it works

**Layer 4 vs layer 7.** An L4 balancer works on TCP/UDP: it forwards packets based on
IP and port, is very fast and understands nothing about [HTTP](/concept/http). An L7
balancer terminates the connection, reads the HTTP request and can route on path,
host header or cookie (`/api` to one pool, `/static` to another), rewrite headers,
and retry a failed request on another server.

**Distribution algorithms.**

- *Round robin* — each server in turn. Simple; assumes requests cost about the same.
- *Weighted round robin* — bigger servers receive proportionally more.
- *Least connections* — send to the server with the fewest in-flight requests; adapts
  to uneven request cost.
- *Least response time* — prefer the server currently answering fastest.
- *IP hash / consistent hashing* — the same client (or the same key) always reaches
  the same server. Useful for cache locality; degrades when servers join or leave
  unless consistent hashing is used.
- *Random with two choices* — pick two at random, take the less loaded one; performs
  surprisingly close to least-connections with far less coordination.

**Health checks.** The balancer probes each server (`GET /health` every few seconds,
or passively by observing failures) and stops sending traffic to those that fail.
This is what turns "many servers" into "high availability".

**Session affinity (sticky sessions).** If servers keep per-user state in memory, the
balancer must pin each user to one server via a cookie. It works but undermines the
model: that server's failure loses those users' state, and load becomes uneven. The
usual fix is to move state into a shared [Session](/concept/session) store such as
[Redis](/technology/redis) and let every request go anywhere.

**Where it lives.** Hardware appliances, software (NGINX, HAProxy, Envoy), cloud
services (managed L4/L7 balancers), and inside orchestrators —
[Kubernetes](/technology/kubernetes) `Service` objects balance across pods, and an
Ingress balances HTTP from outside. DNS round robin is the crudest form: multiple A
records, no health checks, client-side caching.

## Deep Dive

**The balancer itself must not be the single point of failure.** Production setups
run at least two balancers with a floating IP or anycast address, or rely on the
cloud provider's regionally redundant service. A [CDN](/concept/cdn) in front adds
another global layer that routes users to the nearest healthy region.

**Long-lived connections behave differently.** [WebSocket](/technology/websocket) and
[SSE](/technology/sse) connections stay open for minutes or hours, so per-connection
balancing at accept time can leave one server holding thousands of sockets while a
freshly added one holds none. Least-connections helps at connect time; rebalancing
already-open connections requires the application to cooperate (drain and reconnect).
A [Chat System](/architecture/chat-system) pairs this with
[Pub/Sub](/concept/pub-sub) so any server can deliver to any user.

**Health checks lie in both directions.** A shallow check (`200` from `/health`) can
pass while the database behind the server is down; a deep check that touches every
dependency can mark the whole pool unhealthy during a partial outage and take the
site down entirely. Check what the server *itself* controls and let
[Circuit Breaker](/pattern/circuit-breaker) logic handle downstream failures.

**Retries amplify load.** An L7 balancer that retries failed requests on another
server is convenient, but under overload it doubles the work exactly when capacity
is scarce. Limit retries to idempotent methods (see [Idempotency](/concept/idempotency))
and cap the retry budget.

**Uneven costs.** Round robin assumes homogeneous requests. When one endpoint is 100×
more expensive than another, least-connections or separate pools per workload keep a
handful of heavy requests from starving the rest.

**Connection draining.** Removing a server for deploy should stop new requests while
letting in-flight ones finish. Without draining, every deploy produces a burst of
errors.

**Global balancing.** Across regions, DNS-based (GeoDNS, latency-based routing) or
anycast routing sends users to the nearest region; within a region, the L4/L7 layers
above take over. Failing over a region is where load balancing meets
[Replication](/concept/replication) — the data has to be there too.
