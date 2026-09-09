---
id: database-per-service
name: Database per Service
tagline: Each service owns its data store; others reach it only through the service's API
category: data
tags: [Data, Microservices, Data Ownership, Distributed System]
difficulty: 4
prerequisites: [database, transaction, distributed-system]
learningPath:
  - database
  - transaction
  - distributed-system
  - modular-monolith
  - database-per-service
  - saga
  - eventual-consistency
related:
  - { to: distributed-system, rel: SOLVES }
  - { to: saga, rel: USED_WITH }
  - { to: outbox, rel: USED_WITH }
  - { to: cqrs, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: modular-monolith, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: mongodb, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

Several services share one database. It looked pragmatic: one place to back up,
JOINs across everything, one transaction for cross-team operations. Then the
orders team renames a column and the shipping service breaks at 3 a.m. Nobody can
migrate a table without a meeting of five teams. A heavy report from analytics
locks rows the checkout path needs. The database has become the integration
layer, and its schema is a public API that every service depends on but nobody
owns.

Services that share a database are not independently deployable, whatever the
architecture diagram says.

## Solution

Give each service exclusive ownership of its data. The schema is private; the
**only** way another service reads or changes that data is through the owning
service's API or the events it publishes.

```sequence
title: Cross-service data access goes through APIs and events
participants: Checkout [backend], Orders DB [postgresql], Inventory [backend], Inventory DB [mongodb], Kafka [kafka]
Checkout -> Orders DB: INSERT order (own schema)
Checkout -> Inventory: POST /reservations (API, not a JOIN)
Inventory -> Inventory DB: decrement stock
Inventory --> Checkout: reserved
Checkout -> Kafka: OrderPlaced (via outbox)
Kafka --> Inventory: OrderPlaced → own read model updated
```

## How it works

```steps
title: Degrees of separation
Private tables in a shared server [postgresql] | one instance, separate schemas and credentials; cheapest, weakest isolation
Separate database per service | independent schema migrations and backups; still shared hardware
Separate server / cluster per service | independent scaling, failure domain and tuning
Different engine per service [mongodb] | choose the store that fits each workload (polyglot persistence)
```

Whatever the degree, the rules are the same:

- **No cross-service SQL.** Credentials for a service's database exist only in
  that service.
- **Data other services need arrives as events.** A service keeps a local copy of
  what it needs (a read model), updated from events, and accepts that the copy is
  [eventually consistent](/concept/eventual-consistency).
- **Cross-service workflows are sagas.** There is no distributed
  [transaction](/concept/transaction); a multi-step operation is a
  [Saga](/pattern/saga) with compensating actions, with events published through
  an [Outbox](/pattern/outbox) so they are never lost.
- **Reports and joins** move to a dedicated analytics store fed by events or
  change data capture — never to a query across production databases.

```sql
-- Anti-pattern: shipping service reading the orders schema directly
SELECT o.id, o.address FROM orders.orders o WHERE o.status = 'PAID';

-- Pattern: shipping keeps its own copy, filled from OrderPaid events
CREATE TABLE shipping.shipments (
  order_id   uuid PRIMARY KEY,
  address    jsonb NOT NULL,        -- copied from the event
  status     text  NOT NULL
);
```

The [Modular Monolith](/pattern/modular-monolith) applies the same ownership rule
inside one process and one database instance — a schema per module, no
cross-schema joins — which is why it is a low-risk rehearsal for this pattern.

## Advantages

- Services deploy and migrate independently; a schema change is a local decision
- Each service picks the storage engine and indexes that fit its access pattern
- Failure and load isolation — an analytics query cannot lock the checkout path
- Clear data ownership ends "who owns this table?" debates
- Enforces the service boundary; you cannot cheat with a JOIN

## Disadvantages

- No cross-service ACID: consistency is eventual and workflows need sagas and compensation
- Queries spanning services require duplicated read models or a separate reporting store
- Data is duplicated, and every copy is a place where it can be stale or wrong
- Many databases to provision, back up, monitor, patch and pay for
- Getting boundaries wrong is expensive — moving data between services means migrations and dual writes

## When to use

- Genuinely independent services with distinct teams and release cadences
- Services with different storage needs (search index, document store, relational ledger)
- Regulatory separation of sensitive data (payment card data, identity) from everything else
- When shared-database coupling is already causing broken deploys and migration gridlock

## When not to use

- A small team running a handful of services — the operational cost outweighs the isolation
- Domains where most operations need strong consistency across the boundaries you would draw
- Uncertain boundaries — start with a [Modular Monolith](/pattern/modular-monolith) and one database, split when the seams are proven
- Reporting-heavy products where every screen is a cross-entity join and no event pipeline exists yet

## Real-world

Database per Service is what makes the [microservices](/architecture/microservices)
architecture actually decoupled: each service on the diagram has its own store,
and the [e-commerce](/architecture/e-commerce) system keeps a separate orders
database from the catalogue so checkout writes never compete with browsing
reads. The cost shows up immediately as [Saga](/pattern/saga) and
[Outbox](/pattern/outbox) machinery — which is why teams without a clear need
should keep one database a while longer.
