---
id: api-gateway
name: API Gateway
tagline: A single entry point that authenticates, rate-limits and routes requests to many services
category: architecture
tags: [Architecture, Microservices, Networking]
difficulty: 3
prerequisites: [http, backend, rest, load-balancing]
learningPath:
  - http
  - backend
  - rest
  - load-balancing
  - authentication
  - rate-limiting
  - api-gateway
  - microservices
related:
  - { to: http, rel: REQUIRES }
  - { to: nginx, rel: RELATED_TO }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: authentication, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: tls, rel: RELATED_TO }
  - { to: graphql, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

An API gateway is a reverse proxy that sits between clients and backend services and
applies cross-cutting policy in one place: [TLS](/concept/tls) termination,
[Authentication](/concept/authentication), [Rate Limiting](/concept/rate-limiting),
routing by path or header, request/response transformation, caching and telemetry.
Clients see one host and one API; behind it the system can be one service or fifty.
Implementations range from [nginx](/technology/nginx) configurations to dedicated
products (Kong, Envoy-based gateways, cloud API gateways).

## Why it matters

Without a gateway, every service in a [Microservices](/architecture/microservices)
system must independently terminate TLS, validate tokens, enforce quotas, emit
metrics and stay reachable on its own public address — and every client must know the
topology. Each of those is a place to make the same mistake many times. A gateway
moves them to one component that security, platform and API teams can own.

It is also the point of control for evolution: rename a path, version an API, split a
service in two, or run a canary — all invisible to clients. The risk is symmetric: a
gateway is on the critical path of every request, so it must be highly available and
must resist becoming a monolith of business logic.

## Visual

```sequence
title: One client request through the gateway
participants: Client, Gateway [nginx], Auth, Orders, Users
Client -> Gateway: GET /api/orders/42 (Bearer token)
Gateway -> Gateway: TLS terminated, rate limit checked (user key)
Gateway -> Auth: validate token (cached JWKS)
Auth --> Gateway: OK, user=17, scope=orders:read
Gateway -> Orders: GET /orders/42 (X-User-Id 17, trace id)
Orders --> Gateway: order JSON
Gateway -> Users: GET /users/17 (for display name)
Users --> Gateway: user JSON
Gateway --> Client: 200 OK, merged response, cache headers
```

The client made one call. The gateway performed authentication, rate limiting, two
routed calls and a response merge, and attached a trace id so the whole path is
observable.

## How it works

- **Routing** — match on host, path prefix, method or header and forward to an
  upstream service. Path rewriting lets `/api/v2/orders` reach the `orders` service's
  `/orders`. Weighted routing enables canaries and blue/green.
- **Edge security** — terminate TLS with a single certificate set, validate JWTs or
  API keys, reject malformed requests, enforce CORS, and apply a web application
  firewall. Downstream services receive a verified identity header instead of raw
  credentials.
- **Rate limiting and quotas** — per client, per user, per route, typically with a
  token bucket backed by [Redis](/technology/redis) so limits hold across gateway
  replicas. Protects services from abuse and from a single misbehaving tenant.
- **Load balancing and resilience** — spread requests over service instances, health
  check them, apply per-route [Timeout](/pattern/timeout)s, retries for idempotent
  methods, and a [Circuit Breaker](/pattern/circuit-breaker) so one failing service
  does not stall the rest.
- **Transformation and aggregation** — translate protocols (REST in, gRPC out),
  reshape payloads, or compose several backend calls into one response for
  bandwidth-sensitive mobile clients.
- **Caching** — serve repeated `GET`s from an edge cache with proper `Cache-Control`
  handling, sparing services and cutting latency.
- **Observability** — uniform access logs, latency metrics per route and trace
  context propagation for every request, without touching service code.

## Deep Dive

**Gateway, load balancer, reverse proxy, mesh.** A [Load Balancing](/concept/load-balancing)
tier distributes traffic; a reverse proxy forwards and can rewrite; an API gateway
adds API-aware policy (auth, quotas, versioning, developer portal). A service mesh
handles *east–west* traffic between services with sidecars; the gateway handles
*north–south* traffic from outside. In practice one product (nginx, Envoy) often plays
several roles, and many teams begin with a plain reverse proxy and grow it into a
gateway as needs appear.

**Smart endpoints, dumb pipes.** The classic anti-pattern is letting business logic
migrate into the gateway — validation rules, orchestration, data enrichment — until
every feature requires a gateway change and the gateway team becomes the bottleneck.
Keep it to cross-cutting concerns; put composition that depends on domain knowledge
into a dedicated service.

**Backend-for-frontend.** When web, mobile and partner clients need different shapes
of the same data, one gateway with three personalities becomes tangled. A BFF per
client type — often a thin service behind the shared gateway — keeps client-specific
aggregation out of the central component. [GraphQL](/technology/graphql) is another
answer to the aggregation problem: one schema, client-chosen shape, resolvers that call
the services.

**Availability of the gateway itself.** It is a single point of failure by design, so
run several replicas across zones behind a network load balancer, keep configuration
in version control with staged rollouts, and make the gateway stateless — shared state
(rate-limit counters, sessions) lives in Redis or is accepted as approximate.

**Latency.** A well-tuned gateway adds a millisecond or two, but token validation
against a remote identity provider, synchronous logging or large-payload
transformation can add far more. Cache public keys, validate JWTs locally, log
asynchronously, and measure the gateway's own overhead as a first-class metric.

**Authentication placement.** Let the gateway authenticate (who is calling) and pass a
trusted identity downstream; keep *authorisation* (may they do this) in the services,
which know the domain rules. Sign or use mTLS on the internal hop so services can
trust the identity header only when it comes from the gateway.

**Versioning and deprecation.** Route `/v1` and `/v2` to different deployments,
measure who still calls `/v1` from gateway logs, and retire it with data instead of
guesses.

## Related

- [nginx](/technology/nginx) — the most common starting point for a gateway
- [Rate Limiting](/concept/rate-limiting) and [Authentication](/concept/authentication) — the two policies every gateway ends up enforcing
- [Microservices](/architecture/microservices) — where the gateway earns its place
