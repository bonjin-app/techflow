---
id: modular-monolith
name: Modular Monolith
tagline: One deployable with strict module boundaries, no network between them
category: application
tags: [Application Architecture, Monolith, Modularity, Microservices]
difficulty: 3
prerequisites: [backend, database, layered-architecture]
learningPath:
  - backend
  - layered-architecture
  - hexagonal-architecture
  - modular-monolith
  - event-driven-architecture
  - database-per-service
related:
  - { to: backend, rel: SOLVES }
  - { to: microservices, rel: ALTERNATIVE_TO }
  - { to: layered-architecture, rel: RELATED_TO }
  - { to: hexagonal-architecture, rel: USED_WITH }
  - { to: database-per-service, rel: RELATED_TO }
  - { to: event-driven-architecture, rel: RELATED_TO }
  - { to: docker, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

A monolith has become a "big ball of mud": any class can call any other, the
`orders` code reads `users` tables directly, and a change in billing breaks
shipping. The obvious remedy — split into [microservices](/architecture/microservices)
— brings network calls, distributed transactions, separate deployments and an
operations burden the team is not ready for. Many teams that jump straight to
services end up with a *distributed* ball of mud: the same tangled dependencies,
now across HTTP.

The real problem is missing **boundaries**, not missing **processes**.

## Solution

Keep a single deployable, but divide it into modules aligned with business
capabilities (Catalog, Orders, Billing, Identity). Each module owns its data and
exposes a small public API; everything else is private and enforced by tooling.

```steps
title: Inside one process — modules talk only through public APIs
Orders module | public API + internal domain, application and persistence layers
Billing module | own tables; called via interface or in-process events
Identity module | owns users and sessions [session]; others receive only ids
Shared kernel | tiny: ids, money type, event bus interface
Single database [postgresql] | one instance, one schema per module, no cross-schema joins
```

Modules communicate through explicit interfaces or in-process domain events —
never by importing another module's internals or querying its tables.

## How it works

```sequence
title: Placing an order across modules, in one process
participants: HTTP [http], Orders, Billing, Event bus, Notifications
HTTP -> Orders: placeOrder(cmd)
Orders -> Billing: BillingApi.authorize(customerId, total)
Billing --> Orders: Authorization
Orders -> Orders: save order (own schema)
Orders -> Event bus: OrderPlaced
Event bus --> Notifications: OrderPlaced
Orders --> HTTP: 201 Created
```

Enforcement is the whole game:

- **Package/namespace visibility** — only `orders.api.*` is public; linters or
  architecture tests fail the build when `billing` imports `orders.internal`.
- **Data ownership** — one schema (or table prefix) per module. Cross-module
  reads go through the owning module's API, not a JOIN. This is
  [Database per Service](/pattern/database-per-service) without the extra servers.
- **Local transactions** — because everything runs in one process against one
  database, a use case that spans modules can still use one
  [transaction](/concept/transaction) when it must, a luxury microservices lose.
- **Events** — modules publish domain events on an in-memory bus; later the same
  events can be published externally through an [outbox](/pattern/outbox).

```ts
// orders/api/index.ts  — the ONLY import path other modules may use
export type { OrderSummary } from "./dto";
export { OrdersApi } from "./orders-api";

// billing/internal/…  — importing this from another module fails the lint rule
```

Extraction later is mechanical: the module's public API becomes a network API,
its schema becomes its own database, and the in-process events become messages.

## Advantages

- One deployment, one process to debug, one log — operational simplicity of a monolith
- In-process calls: no network latency, no partial failures, no distributed tracing needed
- Local ACID transactions remain available across modules when genuinely required
- Clear ownership per module lets several teams work with fewer collisions
- Modules that prove independent can be extracted to services with low risk

## Disadvantages

- Boundaries are only as strong as the tooling; without lint/architecture tests they erode within months
- Whole application scales as one unit — a hot module cannot get more replicas alone
- A single runtime and language for every module; no polyglot choices
- One bad module (memory leak, blocking call) can still take down everything — see [Bulkhead](/pattern/bulkhead)
- Deploys are all-or-nothing; a large team can queue behind one release train

## When to use

- Teams of roughly 3–30 engineers with a domain that has clear capabilities but uncertain boundaries
- Startups and new products, where boundaries will move and a network split would freeze them too early
- Organisations lacking the platform maturity (CI/CD, observability, on-call) that microservices demand
- As a deliberate stepping stone: modularise first, extract only what needs independent scaling

## When not to use

- Modules have wildly different scaling or resource profiles (a video transcoder next to a CRUD API)
- Independent release cadence per team is a hard requirement
- Regulatory isolation demands separate deployables (payment data segregated from the rest)
- The codebase is already small and simple — module ceremony adds nothing to a 5-endpoint app

## Real-world

Many successful [e-commerce](/architecture/e-commerce) backends run as a modular
monolith for years: catalog, cart, orders and billing are separate modules with
separate schemas in one PostgreSQL instance, deployed as one container. When
checkout traffic outgrows the rest, the Orders module is extracted first — its API
and schema were already isolated. See
[Modular Monolith vs Microservices](/compare/modular-monolith-vs-microservices)
for the decision in detail.
