---
id: layered-vs-hexagonal-vs-clean-architecture
name: Layered vs Hexagonal vs Clean Architecture
tagline: Stack the code by responsibility, fence the core behind ports, or ring it and point inward
category: decision
tags: [Application Architecture, Dependency Inversion, Separation of Concerns, Decision]
difficulty: 3
subjects: [layered-architecture, hexagonal-architecture, clean-architecture]
related:
  - { to: domain-driven-design, rel: RELATED_TO }
  - { to: mvc, rel: RELATED_TO }
  - { to: modular-monolith, rel: RELATED_TO }
  - { to: testing, rel: RELATED_TO }
  - { to: backend, rel: RELATED_TO }
  - { to: modular-monolith-vs-microservices, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-24, confidence: high }
---

## TL;DR

All three answer one question: **which code is allowed to know about which**. They are
less three rival designs than three positions on one line.

[Layered Architecture](/pattern/layered-architecture) stacks presentation, business and
persistence, and lets each call only downward — so the business layer depends on the
persistence layer beneath it. [Hexagonal Architecture](/pattern/hexagonal-architecture)
flips that one arrow: the core defines the interfaces it needs, and the database, the HTTP
handler and the queue consumer are all adapters outside it, depending on the core.
[Clean Architecture](/pattern/clean-architecture) keeps Hexagonal's boundary and adds
structure inside it — entities at the centre, one use case per action around them.

The step from Layered to either of the others is the one that matters: whether the
business rules import the database, or the database implements an interface the business
rules own. Hexagonal and Clean agree on that and differ mostly in how much they prescribe
inside the fence.

## Comparison

```compare
Dimension                | Layered [layered-architecture]            | Hexagonal [hexagonal-architecture]          | Clean [clean-architecture]
Shape                    | Horizontal layers, top to bottom           | A core with ports, adapters around it        | Concentric rings, entities at the centre
Business rules depend on | The persistence layer below them           | Nothing; ports they define themselves         | Nothing; ports the use-case ring defines
Database is              | The bottom layer                           | One driven adapter among several              | An outer-ring detail
Several entry points     | Each controller wires its own path in      | Each is a driving adapter on the same port    | Each is an adapter calling the same use case
Testing the rules        | Fake the layer below, or use a database     | In-memory adapters, no database               | In-memory adapters, no database
Prescribes inside core   | Service and repository, loosely            | Nothing beyond ports                          | Entities, use cases, boundaries, presenters
Ceremony                 | Least                                      | An interface per outside dependency           | Most — input and output models per use case
Typical failure          | Anaemic entities, ORM types leaking upward | Ports shaped like the adapter behind them     | Mapping layers with nothing to protect
```

## Decision

```decision
? Is the application mostly reading and writing records, with few rules of its own?
  YES -> ? Will it be driven from more than one entry point — HTTP, a queue, a scheduler?
    YES -> Hexagonal [hexagonal-architecture]
    NO -> Layered [layered-architecture]
  NO -> ? Do the business rules need testing in milliseconds without a database?
    YES -> ? Is the domain large enough that use cases need their own structure?
      YES -> Clean [clean-architecture]
      NO -> Hexagonal [hexagonal-architecture]
    NO -> Layered [layered-architecture]
```

## When Layered

- The application is mostly CRUD: forms in, rows out, validation and a few rules. The
  persistence layer *is* most of the logic, and hiding it behind interfaces buys nothing.
- There is one way in — an HTTP API or a server-rendered site — and no plan for a second.
- The team is small or new to the codebase, and a structure every framework tutorial
  already uses is worth more than a purer one people have to learn.
- You keep the two rules that make it hold: transactions start in the business layer, and
  ORM entities do not cross into controllers or responses.

## When Hexagonal

- The same operation is triggered from several places — a REST endpoint, a Kafka consumer,
  a nightly job — and each should be a thin adapter onto one core.
- Outside dependencies are likely to change or multiply: a second payment provider, a
  store you might replace, an external API you want to fake in tests.
- You want the core testable with in-memory adapters, but not a prescribed internal
  structure; a few services and a domain model inside the boundary are enough.
- Ports can be named in the core's language — `ReserveStock`, `StockRepository` — rather
  than mirroring whatever the adapter behind them happens to expose.

## When Clean

- The domain is rich and long-lived — payments, insurance, logistics — where the rules
  will outlast the framework, the ORM and probably the team that chose them.
- There are many distinct actions, and one class per use case with explicit input and
  output keeps each readable and testable on its own.
- The team is prepared to maintain the mapping between rings, and has agreed where it is
  worth it, so every endpoint does not grow three DTOs for a field rename.
- It is paired with [Domain-Driven Design](/pattern/domain-driven-design), which supplies
  what Clean Architecture leaves open: what the entities in the middle should actually be.

## Deep Dive

**The difference is one arrow.** In Layered, `OrderService` imports `OrderRepository`, a
class in the persistence layer that imports the ORM. In Hexagonal and Clean,
`OrderRepository` is an interface in the core, and `PgOrderRepository` in the outer layer
implements it. Control still flows from the service to the database; only the source-code
dependency has turned around. Everything else each pattern says follows from that — and a
Layered codebase that defines its repository interfaces in the business layer is already
most of the way to Hexagonal.

**Hexagonal and Clean are compatible, not competing.** Hexagonal fixes the boundary and
says nothing about the inside; Clean describes the inside. A common arrangement is ports
and adapters at the edge with entities and use cases within. Arguing which one a codebase
"is" rarely changes a line of code.

**The cost is mapping, and it compounds.** A request becomes a command, the command
produces an entity, the entity becomes a row and, on the way back, an output model and
then JSON. In a rules-heavy domain each translation protects something. In a CRUD service
every layer holds the same fields under a different name, and a new column means editing
five files. The honest test is whether the inner types would look different from the
database schema; if not, the rings are ceremony.

**None of them is a deployment decision.** All three describe code inside one process.
They pair well with a [modular monolith](/pattern/modular-monolith) — each module with its
own core and adapters — and they neither require nor imply splitting into services. What
they do make easier is splitting later, because a module whose core depends on nothing can
have its adapters swapped for network calls.
