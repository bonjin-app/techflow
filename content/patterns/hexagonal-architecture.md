---
id: hexagonal-architecture
name: Hexagonal Architecture
tagline: Isolate the application core behind ports so adapters for HTTP, queues or DBs plug in
category: application
tags: [Application Architecture, Ports and Adapters, Dependency Inversion]
difficulty: 3
prerequisites: [programming-fundamentals, backend, layered-architecture]
learningPath:
  - programming-fundamentals
  - backend
  - layered-architecture
  - hexagonal-architecture
  - clean-architecture
  - modular-monolith
related:
  - { to: backend, rel: SOLVES }
  - { to: clean-architecture, rel: ALTERNATIVE_TO }
  - { to: layered-architecture, rel: ALTERNATIVE_TO }
  - { to: mvc, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: rest, rel: RELATED_TO }
  - { to: grpc, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

The same business operation — "reserve stock" — must be triggered from a REST
endpoint, a Kafka consumer and a nightly job. In a [layered](/pattern/layered-architecture)
codebase the logic lives in a service that imports the ORM, so each entry point
reimplements the request parsing and the tests need a database. When the team
wants to switch the stock store or add a gRPC interface, the change touches the
core. Technology decisions leak into the middle of the application and make it
hard to test and hard to change.

## Solution

Draw a boundary around the application core. Everything the outside world does
*to* the core, and everything the core needs *from* the outside world, goes
through **ports** — interfaces owned by the core. **Adapters** implement those
ports with concrete technology on the outside.

```steps
title: Ports and adapters — dependencies point at the core
Driving adapters [http] | REST controller, gRPC handler, Kafka consumer, CLI
Driving ports (inbound) | ReserveStock, CancelReservation — use-case interfaces
Application core | domain model and services; imports no framework
Driven ports (outbound) | StockRepository, EventPublisher, Clock
Driven adapters [postgresql] | PostgreSQL repo, Kafka publisher, system clock, in-memory fakes
```

Driving (primary) adapters *call* the core through inbound ports; driven
(secondary) adapters are *called by* the core through outbound ports. Both
sides depend on the core; the core depends on neither.

## How it works

```sequence
title: Two drivers, one core, two driven adapters
participants: REST adapter [rest], Kafka consumer [kafka], Core (ReserveStock), StockRepo adapter [postgresql], Event adapter [message-queue]
REST adapter -> Core (ReserveStock): reserve(sku, qty)
Core (ReserveStock) -> StockRepo adapter: load(sku)
StockRepo adapter --> Core (ReserveStock): Stock
Core (ReserveStock) -> StockRepo adapter: save(stock)
Core (ReserveStock) -> Event adapter: publish(StockReserved)
Core (ReserveStock) --> REST adapter: Reservation
Kafka consumer -> Core (ReserveStock): reserve(sku, qty)
Core (ReserveStock) --> Kafka consumer: Reservation
```

The "hexagon" is only a drawing convention: each side represents one kind of
conversation with the outside. Key rules:

- Ports are defined **inside** the core, in the core's language (domain types, not
  HTTP or SQL types).
- Adapters translate: JSON ↔ command object, row ↔ entity, domain event ↔ broker message.
- The composition root chooses adapters — real ones in production, in-memory ones in tests.

```ts
// core: port definitions and a service that only knows ports
export interface StockRepository { load(sku: string): Promise<Stock>; save(s: Stock): Promise<void>; }
export interface EventPublisher { publish(e: DomainEvent): Promise<void>; }

export class ReserveStock {
  constructor(private repo: StockRepository, private events: EventPublisher) {}
  async reserve(sku: string, qty: number) {
    const stock = await this.repo.load(sku);
    const reservation = stock.reserve(qty);       // throws if insufficient
    await this.repo.save(stock);
    await this.events.publish(reservation.event());
    return reservation;
  }
}

// driven adapter, outside the core
export class PgStockRepository implements StockRepository { /* SQL here */ }
```

Compared with [Clean Architecture](/pattern/clean-architecture), Hexagonal does not
prescribe rings inside the core — it only fixes the boundary and the direction
of dependencies. Many teams use Hexagonal for the outer boundary and Clean's
use-case/entity split inside.

## Advantages

- Core is testable with fakes — fast, deterministic tests without containers
- New entry points (gRPC, queue, scheduler) are new adapters, not new logic
- Swapping infrastructure (database, broker, provider) is confined to an adapter
- Explicit ports make integration points visible and reviewable
- Same-shaped code across services eases moving between them in a [microservices](/architecture/microservices) estate

## Disadvantages

- Every external dependency needs an interface plus at least one adapter — real boilerplate
- Adapters must map types both ways; the mapping code is dull and error-prone
- Over-generic ports ("Repository<T>") hide the domain instead of expressing it
- Database-heavy features (reports, bulk updates) fight the abstraction; the port ends up leaking SQL
- Little benefit for pure CRUD, where the "core" is a pass-through

## When to use

- One core reached by several drivers — HTTP, events, batch, CLI
- The infrastructure is expected to change or is not yet decided
- You want fast, database-free tests for the business logic
- Services in an event-driven or [microservices](/architecture/microservices) system that consume and publish messages as well as serve requests

## When not to use

- Small CRUD services with a single HTTP interface — [Layered Architecture](/pattern/layered-architecture) is enough
- Throwaway prototypes or internal tools with a short life
- Query-centric services where the whole value is in SQL; the port would just wrap the database
- Teams that will not maintain the mapping discipline; leaking framework types through ports destroys the benefit

## Real-world

Hexagonal Architecture shows up wherever one service must accept both
synchronous calls and asynchronous messages: an inventory service in an
[e-commerce](/architecture/e-commerce) or [microservices](/architecture/microservices)
system exposes a REST adapter for the checkout, a Kafka consumer for
`OrderCancelled`, and an outbound adapter for PostgreSQL — all around one core.
It is the outer boundary that [Clean Architecture](/pattern/clean-architecture)
refines, and the natural internal shape of each module in a
[Modular Monolith](/pattern/modular-monolith).
