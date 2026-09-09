---
id: clean-architecture
name: Clean Architecture
tagline: Put the domain at the centre and make every dependency point inward toward it
category: application
tags: [Application Architecture, Domain Model, Dependency Inversion]
difficulty: 4
prerequisites: [programming-fundamentals, backend, layered-architecture]
learningPath:
  - programming-fundamentals
  - backend
  - mvc
  - layered-architecture
  - hexagonal-architecture
  - clean-architecture
related:
  - { to: backend, rel: SOLVES }
  - { to: hexagonal-architecture, rel: ALTERNATIVE_TO }
  - { to: layered-architecture, rel: ALTERNATIVE_TO }
  - { to: mvc, rel: RELATED_TO }
  - { to: modular-monolith, rel: USED_WITH }
  - { to: typescript, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: payment-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

In a conventional [layered](/pattern/layered-architecture) backend the business
rules import the ORM, the ORM imports the database driver, and the web framework
sits on top of everything. The most valuable code — *how the business works* — is
the code most tightly bound to the most replaceable parts. Upgrading the
framework breaks domain tests; the domain cannot be exercised without a database;
a second interface (a queue consumer, a CLI) has to duplicate the wiring. Over
years the rules become impossible to find because they are spread across
controllers, ORM hooks and SQL.

## Solution

Arrange the code in concentric rings and enforce one rule: **source-code
dependencies point inward only**. Inner rings know nothing about outer rings.

```steps
title: Rings — outer depends on inner, never the reverse
Frameworks & Drivers | web framework, ORM, message broker clients, UI [http]
Interface Adapters | controllers, presenters, repository implementations
Use Cases | application-specific workflows; orchestrate entities; define ports
Entities | enterprise rules and domain objects; zero external imports
```

Anything the domain needs from the outside world — persistence, a payment
provider, the clock — is expressed as an **interface defined in the inner ring**
and implemented in an outer ring. The direction of *control* still goes outward
(a use case calls the repository), but the direction of *dependency* is inverted.

## How it works

```sequence
title: Request crossing the rings and back
participants: Controller [http], PlaceOrder (use case), OrderRepo (port), PgOrderRepo [postgresql]
Controller -> PlaceOrder: execute(input)
PlaceOrder -> OrderRepo: save(order)
OrderRepo --> PgOrderRepo: dispatch to implementation
PgOrderRepo --> PlaceOrder: OK
PlaceOrder --> Controller: output DTO
Controller --> Controller: presenter maps DTO → JSON
```

- **Entities** hold rules that would exist even without the software (an order
  cannot ship before payment).
- **Use cases** are one class per action (`PlaceOrder`, `RefundPayment`). They take
  plain input, coordinate entities, call ports and return plain output.
- **Ports** are interfaces owned by the use-case ring: `OrderRepository`,
  `PaymentGateway`, `Clock`.
- **Adapters** implement ports with real technology and translate between the
  outside format and the inner model.
- **Composition root** (main) wires adapters into use cases at startup.

```ts
// use-case ring — imports nothing from frameworks
export interface PaymentGateway { charge(amount: Money, key: string): Promise<ChargeResult>; }
export interface OrderRepository { save(o: Order): Promise<void>; }

export class PlaceOrder {
  constructor(private orders: OrderRepository, private payments: PaymentGateway) {}
  async execute(input: PlaceOrderInput): Promise<PlaceOrderOutput> {
    const order = Order.create(input.items);            // entity enforces rules
    const charge = await this.payments.charge(order.total, input.idempotencyKey);
    if (!charge.ok) return { status: "declined" };
    order.markPaid(charge.id);
    await this.orders.save(order);
    return { status: "placed", orderId: order.id };
  }
}
```

Data crossing a boundary is always a simple structure, never an ORM entity or a
framework request object — that is what keeps the inner rings compilable on their
own.

## Advantages

- Business rules are testable in milliseconds with in-memory adapters and no database
- Frameworks, databases and providers become replaceable details behind ports
- Multiple entry points (HTTP, queue consumer, scheduler) share the same use cases
- Use cases document the system: the folder listing *is* the feature list
- Long-lived systems survive several framework and infrastructure generations

## Disadvantages

- Significant ceremony: interfaces, DTOs and mappers for every boundary, even for CRUD
- Mapping between ORM models and entities duplicates fields and costs performance
- Teams new to it over-abstract, producing "Clean" folders with no real domain inside
- Transactions and queries that span aggregates are awkward when the domain cannot see the database
- Slower to start than an [MVC](/pattern/mvc) skeleton; payoff arrives only when the domain is complex

## When to use

- Domains with many rules and invariants that must be correct — payments, insurance, logistics
- Systems expected to live for years across framework and database changes
- Several delivery mechanisms over one core, or a need to run the core in tests and simulations
- Teams large enough that clear boundaries reduce coordination cost

## When not to use

- CRUD applications where the schema is the domain — [Layered Architecture](/pattern/layered-architecture) delivers the same value with a fraction of the code
- Prototypes and short-lived services; the abstraction cost is never repaid
- Reporting and analytics services whose whole job is querying the database
- Teams without the discipline to keep frameworks out of the inner rings — a half-applied version is worse than none

## Real-world

Clean Architecture is common in backends where the rules matter more than the
framework: the core of a [payment system](/architecture/payment-system) can run
against an in-memory ledger and a fake provider in tests, then be wired to
PostgreSQL and the real gateway in production. It is closely related to
[Hexagonal Architecture](/pattern/hexagonal-architecture) — both invert
dependencies; Clean adds explicit use-case and entity rings — and it pairs
naturally with a [Modular Monolith](/pattern/modular-monolith), where each module
has its own rings.
