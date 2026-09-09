---
id: backend
name: Backend
tagline: The server side that receives requests, applies business rules and owns the data
category: fundamentals
tags: [Fundamentals, Backend, Architecture]
difficulty: 1
prerequisites: [programming-fundamentals, http]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - rest
  - database
  - sql
  - cache
  - authentication
  - distributed-system
related:
  - { to: http, rel: REQUIRES }
  - { to: database, rel: RELATED_TO }
  - { to: rest, rel: RELATED_TO }
  - { to: session, rel: RELATED_TO }
  - { to: authentication, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: docker, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

The backend is everything that runs on servers you control: it accepts
[HTTP](/concept/http) requests from browsers, mobile apps and other services,
authenticates the caller, validates input, applies business rules and reads or
writes the [Database](/concept/database). It is the only place where rules can be
enforced — the client can be modified by anyone — so correctness, security and data
integrity live here. A good backend is **stateless per request** and pushes durable
state into databases, caches and queues so it can be scaled by adding copies.

## Why it matters

Frontends are replaceable; the backend owns the data and the invariants. If the
backend lets two users buy the last item, or trusts a price sent by the browser, no
amount of UI polish saves the product. At the same time the backend is where
latency, cost and scaling pressure concentrate: every user action eventually becomes
a request that must be served in tens of milliseconds while the database, network
and third parties misbehave. Understanding the request lifecycle end to end is the
foundation for every other concept on this site — caching, transactions, queues,
locks and distributed systems are all answers to problems that first appear in a
backend.

```steps
title: What a backend is responsible for
Transport [http] | accept connections, parse requests
Routing | map method + path to a handler
Authentication [authentication] | who is calling?
Validation | reject bad input before it touches data
Business logic | the rules that make the product a product
Persistence [database] | transactions, queries, consistency
Integration | queues, external APIs, email, payments
Observability | logs, metrics, traces for every request
```

## Visual

```sequence
title: Lifecycle of one API request
participants: Client, LB [load-balancing], API [backend], Cache [redis], DB [postgresql]
Client -> LB: POST /orders  (Authorization: Bearer …)
LB -> API: route to a healthy instance
API -> API: verify token, validate body
API -> Cache: GET product:42
Cache --> API: HIT (price, stock)
API -> DB: BEGIN; INSERT order; UPDATE stock; COMMIT
DB --> API: ok
API -> Cache: DEL product:42
API --> LB: 201 Created  { id: 9001 }
LB --> Client: 201 Created
```

## How it works

A request passes through layers that most frameworks make explicit as **middleware**:

1. **Edge** — TLS termination, [Load Balancing](/concept/load-balancing) and often
   [Rate Limiting](/concept/rate-limiting) happen before application code runs.
2. **Framework** — parses the request, matches a route, runs middleware
   ([Authentication](/concept/authentication), logging, CORS), then calls a handler.
3. **Handler / service layer** — validates input, applies domain rules, coordinates
   one or more data stores. This is where a [Transaction](/concept/transaction)
   boundary is drawn.
4. **Data access** — [SQL](/concept/sql) or a driver against
   [PostgreSQL](/technology/postgresql), [MongoDB](/technology/mongodb), plus a
   [Cache](/concept/cache) such as [Redis](/technology/redis).
5. **Side effects** — anything that should not block the response (emails, analytics,
   search indexing) is handed to a [Message Queue](/concept/message-queue) and
   processed by a worker.
6. **Response** — a status code the client can act on, plus headers that tell caches
   what they may keep.

**Statelessness.** The process handling request N should not need to be the one that
handles request N+1. User [Session](/concept/session) data goes to Redis or into a
signed token; uploaded files go to object storage; in-process memory is treated as a
disposable cache. This is what allows the [Load Balancer](/concept/load-balancing) to
spread traffic across identical copies packaged as [Docker](/technology/docker)
images and scheduled by [Kubernetes](/technology/kubernetes).

**Shapes.** A [Simple Web App](/architecture/simple-web-app) is one deployable with
one database — the right starting point for almost everything.
[Microservices](/architecture/microservices) split the backend along business
boundaries and pay for team autonomy with network calls, partial failure and
distributed data.

## Deep Dive

**Never trust the client.** Prices, permissions, quantities and user ids in a request
body are suggestions. Recompute or look them up server-side; authorise every object
access, not just the endpoint.

**Concurrency is the default.** Two requests for the same resource routinely overlap.
Read-modify-write in application code produces a [Race Condition](/concept/race-condition);
push the conflict into the database (`UPDATE … WHERE stock > 0`, unique constraints,
transactions) or use a [Distributed Lock](/concept/distributed-lock) when several
processes must coordinate.

**Retries are coming.** Networks drop responses after the server has committed. Any
non-read endpoint should be safe to repeat — see [Idempotency](/concept/idempotency) —
or the client will eventually create duplicates.

**Latency budget.** A typical target is a p99 well under a second. The database is
usually the largest slice; N+1 query patterns, missing indexes and synchronous calls
to third parties are the common culprits. Caching, connection pooling and moving
slow work to a queue are the standard fixes, in that order of cheapness.

**Failure isolation.** A slow dependency can exhaust the thread or connection pool and
take the whole service down. Timeouts on every outbound call, bounded
[Retry](/pattern/retry) and a [Circuit Breaker](/pattern/circuit-breaker) keep one
bad dependency from becoming an outage.

**Observability is part of the job.** Structured logs with a request id, latency and
error-rate metrics per endpoint, and traces across service hops are how you find out
which of the above is actually happening in production.
