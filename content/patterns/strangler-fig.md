---
id: strangler-fig
name: Strangler Fig
tagline: Replace a legacy system route by route behind a facade instead of rewriting it
category: application
tags: [Architecture, Migration, Legacy]
difficulty: 3
prerequisites: [http, rest, api-gateway]
learningPath:
  - http
  - rest
  - api-gateway
  - modular-monolith
  - strangler-fig
  - microservices
related:
  - { to: availability, rel: SOLVES }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: modular-monolith, rel: RELATED_TO }
  - { to: nginx, rel: USED_WITH }
  - { to: feature-flag, rel: USED_WITH }
  - { to: blue-green-deployment, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

You have a system that works, earns money and nobody wants to touch. It is ten
years old, its framework is unsupported, its tests are thin and its business
rules exist only in the code. Every feature takes weeks because everything is
coupled to everything.

The obvious answer — "let's rewrite it and switch over" — is the one that fails
most reliably. A big-bang rewrite has to reach feature parity with a decade of
undocumented edge cases before it delivers a single euro of value. Meanwhile the
old system keeps changing, so the target moves. Teams split, the two codebases
drift, and the cutover becomes a single terrifying night on which everything must
work at once. If it does not, there is no way back except a full rollback of a
migration that took a year.

## Solution

Put a **facade** in front of the legacy system — a proxy, an
[API gateway](/concept/api-gateway) or a reverse proxy — so that clients no
longer address the legacy application directly. Then move functionality out one
slice at a time. Each slice gets a new implementation; the facade routes that
route (or that user segment) to the new service and everything else to the
legacy system. Repeat until nothing is left behind the facade, then delete it or
keep it as the gateway.

The name comes from the strangler fig, which grows around a host tree and
eventually stands on its own when the host rots away.

```steps
title: Migrating one slice at a time
Put a proxy in front of the legacy app [nginx] | no behaviour change yet, but now traffic is routable
Pick the smallest valuable slice | e.g. GET /products — read-only, well understood
Build it as a new service [backend]
Route a fraction of that slice's traffic to the new service [canary-release] | compare responses, watch errors
Move 100% of the slice, keep the legacy code path dormant
Delete the legacy code for that slice | the slice is now truly gone
Repeat until the facade fronts only new services
```

```sequence
title: One route already migrated
participants: Client [http], Proxy [nginx], New Service [backend], Legacy [backend], DB [postgresql]
Client -> Proxy: GET /products/42
Proxy -> New Service: /products/42 (migrated)
New Service -> DB: SELECT …
DB --> New Service: row
New Service --> Proxy: 200 OK
Proxy --> Client: 200 OK
Client -> Proxy: POST /orders
Proxy -> Legacy: /orders (not migrated yet)
Legacy --> Proxy: 201 Created
Proxy --> Client: 201 Created
```

## How it works

Three mechanics do most of the work.

**Routing.** The facade needs rules expressive enough to split by path, method,
header or user id, so you can migrate `GET /products` before `POST /products`, or
migrate internal users before customers.

```text
# nginx: /products is migrated, everything else stays legacy
location /products { proxy_pass http://catalog-service; }
location /        { proxy_pass http://legacy-app; }
```

**Data.** This is the hard part. Two systems now touch the same rows. Options,
roughly in order of preference: the new service owns the table and the legacy
system reads it through an API; the legacy database stays the source of truth and
the new service reads it directly (ugly but pragmatic); or both write and you
synchronise with change data capture or an [Outbox](/pattern/outbox). Dual write
without a single owner per table is how strangler migrations turn into
[race conditions](/concept/race-condition).

**Verification.** Before cutting over, run the new implementation in *shadow
mode*: send it a copy of real traffic, compare its response with the legacy one,
log differences, discard its output. This finds the undocumented edge cases that
would otherwise surface as customer incidents.

## Advantages

- Value ships continuously — the first slice is in production in weeks, not after a year
- Risk is bounded per slice; a bad migration affects one route, and rollback is a routing change
- The legacy system keeps running and keeps being maintained, so no feature freeze is needed
- Forces you to discover real boundaries by migrating them, instead of guessing them upfront
- The facade doubles as a place for cross-cutting concerns: auth, [rate limiting](/concept/rate-limiting), metrics

## Disadvantages

- Two systems live side by side for a long time — more deployment targets, more on-call surface
- Shared data is genuinely hard; synchronisation adds lag, drift and reconciliation jobs
- The facade is a new single point of failure and a latency hop on every request
- Migrations stall: once the painful 20% is left, the incentive to finish disappears and you own a hybrid forever
- Cross-cutting legacy concerns (a shared session table, a stored-procedure-heavy schema) resist slicing
- Total effort is higher than an ideal rewrite; you pay for the coexistence machinery

## When to use

- A large system must keep running while it is modernised
- The system can be split by route, domain or user segment
- You need to show progress and reduce risk incrementally, with rollback at every step
- Moving from a monolith towards a [modular monolith](/pattern/modular-monolith) or [microservices](/architecture/microservices)

## When not to use

- The system is small enough to rewrite in a few weeks — the facade costs more than the rewrite
- You cannot intercept traffic (a thick desktop client with hard-coded logic, a batch-only system)
- Data cannot be partitioned by owner and every slice would need bidirectional sync
- Nobody will fund the last 20%; a half-strangled system is worse than either endpoint
- The requirement is a genuinely different product, not the same behaviour with new internals

## Real-world

Almost every "we moved from a monolith to services" story is a strangler fig,
whether or not it is called that: an [nginx](/technology/nginx) or gateway layer
appears first, then read endpoints move, then writes, then the schema is split
per service ([Database per Service](/pattern/database-per-service)). It pairs
naturally with [Feature Flag](/pattern/feature-flag) for per-user routing and
with [Canary Release](/pattern/canary-release) for cutting over a slice a few
percent at a time.
