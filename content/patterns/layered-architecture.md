---
id: layered-architecture
name: Layered Architecture
tagline: Stack presentation, business and data layers so each only calls the one below
category: application
tags: [Application Architecture, Separation of Concerns, Monolith]
difficulty: 2
prerequisites: [programming-fundamentals, backend, database]
learningPath:
  - programming-fundamentals
  - backend
  - mvc
  - layered-architecture
  - clean-architecture
  - hexagonal-architecture
related:
  - { to: backend, rel: SOLVES }
  - { to: mvc, rel: RELATED_TO }
  - { to: clean-architecture, rel: ALTERNATIVE_TO }
  - { to: hexagonal-architecture, rel: ALTERNATIVE_TO }
  - { to: modular-monolith, rel: RELATED_TO }
  - { to: database, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

A growing backend has HTTP parsing, business rules and SQL scattered through the
same functions. A schema change forces edits in dozens of request handlers; a new
rule about discounts has to be copied into every endpoint that touches prices.
Nobody can say where a given responsibility lives, so reviews are slow and the
same bug is fixed in three places. Testing means spinning up the web server and
the database together.

## Solution

Organise code into horizontal **layers**, each with one responsibility, and allow
calls only **downward** to the layer directly beneath:

```steps
title: Layers — calls flow top to bottom only
Presentation [http] | controllers, request/response mapping, auth checks
Business (Service) | use cases, rules, transaction boundaries [transaction]
Persistence (Repository) | queries, mapping rows ↔ objects
Database [database] | PostgreSQL, MySQL, a document store …
```

The presentation layer never issues SQL; the persistence layer never knows about
HTTP. Each layer exposes an interface that the one above depends on, so a layer
can be replaced or tested in isolation with the layer below faked.

## How it works

```sequence
title: A request crossing the layers
participants: Client [http], Controller, OrderService, OrderRepository, DB [postgresql]
Client -> Controller: POST /orders
Controller -> OrderService: placeOrder(cmd)
OrderService -> OrderRepository: findCustomer(id)
OrderRepository -> DB: SELECT …
DB --> OrderRepository: row
OrderRepository --> OrderService: Customer
OrderService -> OrderRepository: save(order)
OrderRepository -> DB: INSERT … (tx)
OrderService --> Controller: OrderPlaced
Controller --> Client: 201 Created
```

Two variants matter in practice:

- **Strict** layering — a layer may call only the layer directly below. Cleanest, but
  simple reads pass through empty "delegation" methods.
- **Relaxed** layering — a layer may skip layers (controller → repository for a
  plain lookup). Less boilerplate, more temptation to bypass the rules.

```ts
// business layer: no HTTP, no SQL
class OrderService {
  constructor(private orders: OrderRepository, private customers: CustomerRepository) {}

  async placeOrder(cmd: PlaceOrder): Promise<Order> {
    const customer = await this.customers.findById(cmd.customerId);
    if (!customer.canOrder()) throw new DomainError("customer blocked");
    const order = Order.from(cmd, customer);
    await this.orders.save(order);          // transaction owned here
    return order;
  }
}
```

Dependencies still point **downward** toward the database: the service imports the
repository, and the repository is typically an ORM concern. That is the key
difference from [Hexagonal](/pattern/hexagonal-architecture) and
[Clean Architecture](/pattern/clean-architecture), which invert that arrow.

## Advantages

- Simple mental model; every developer already knows "controller, service, repository"
- Clear place for each responsibility, so reviews and onboarding are faster
- Business logic can be unit-tested with a fake repository
- Supported by framework conventions and folder templates out of the box
- Works well for CRUD-heavy applications where the data model drives the design

## Disadvantages

- The domain still depends on the persistence layer — swapping databases or ORMs ripples upward
- "Pass-through" services and anaemic domain models are common; logic slides into controllers or SQL
- Layers are technical, not functional: a feature touches every layer, so one change spans four folders
- Nothing stops a layer being bypassed in relaxed mode; discipline decays without tooling
- Vertical scaling of a team is hard — everyone edits the same service layer

## When to use

- Small-to-medium backends where the database schema closely mirrors the domain
- Teams that value convention and speed over strict decoupling
- Applications with a single delivery mechanism (HTTP) and a single database
- As the internal structure of each module in a [Modular Monolith](/pattern/modular-monolith)

## When not to use

- Rich domains with many invariants — the business layer needs to own the model; look at [Clean Architecture](/pattern/clean-architecture)
- Multiple drivers (HTTP, queue consumers, CLI) that must share the same core — [Hexagonal Architecture](/pattern/hexagonal-architecture) fits better
- When the database is likely to change or you want the domain testable without any ORM
- Large teams working on unrelated features — prefer feature/module slicing over technical layers

## Real-world

Layered architecture is the shape most web backends settle into once
[MVC](/pattern/mvc) controllers get too fat: controllers, a service layer that
owns transactions, and repositories over PostgreSQL or MySQL. The
[Simple Web App](/architecture/simple-web-app) architecture is a single layered
service. Many systems that later move to [microservices](/architecture/microservices)
first split the monolith along module boundaries while keeping the layers inside
each module.
