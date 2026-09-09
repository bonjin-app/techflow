---
id: modular-monolith-vs-microservices
name: Modular Monolith vs Microservices
tagline: Hard module boundaries inside one deployable, or the same boundaries as network calls
category: decision
tags: [Architecture, Microservices, Monolith, Deployment, Decision]
difficulty: 4
subjects: [modular-monolith, microservices]
related:
  - { to: database-per-service, rel: RELATED_TO }
  - { to: event-driven-architecture, rel: RELATED_TO }
  - { to: saga, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: layered-architecture, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Both draw the same picture: a system split into business modules — orders, payments,
catalogue — that talk through explicit interfaces. A [modular monolith](/pattern/modular-monolith)
enforces those boundaries with code structure (packages, visibility rules, one schema per
module) and ships everything as a single process backed by one database.
[Microservices](/architecture/microservices) turn each boundary into a network boundary:
separate deployables, separate databases, separate on-call. Microservices buy independent
deployment and scaling for many teams at the cost of distributed-systems problems
appearing everywhere. Most products should start as a modular monolith and extract
services only where a specific module's scale, release cadence or team structure demands
it; the module boundaries are what make that extraction possible later.

## Comparison

```compare
Feature                  | Modular Monolith [modular-monolith]                    | Microservices [microservices]
Deployment unit          | One artefact, one release                              | One per service; dozens of pipelines
Module communication     | In-process method calls, compile-time checked          | HTTP / gRPC / messages over the network
Data ownership           | One database, one schema (or schema-per-module)        | Database per service, no shared tables
Transactions             | Local ACID across modules if you allow it              | Sagas, outbox, eventual consistency
Failure modes            | A crash takes everything down; no partial failure      | Partial failure, timeouts, retries, circuit breakers
Scaling                  | Scale the whole process; hot module drags the rest     | Scale each service to its own load profile
Team autonomy            | Shared codebase, shared release train                  | Teams deploy independently on their own schedule
Tech stack               | One language/runtime                                   | Polyglot possible (and eventually inevitable)
Refactoring a boundary   | Move code, run the tests, done                         | Coordinate API versions across deployments
Operational cost         | Low: one thing to monitor, log and debug               | High: tracing, service discovery, gateways, meshes
Boundary enforcement     | Convention + tooling; easy to erode silently           | Physically enforced by the network
```

## Decision

```decision
? Do you have several teams that need to deploy independently and are blocked by a shared release?
  YES -> ? Do those teams also need different scaling profiles or runtimes?
    YES -> Microservices [microservices]
    NO -> ? Can a modular monolith with independent module ownership and CI gates unblock them?
      YES -> Modular Monolith [modular-monolith]
      NO -> Microservices [microservices]
  NO -> ? Is one module's load or resource profile wildly different from the rest (video encoding, ML inference)?
    YES -> Modular Monolith [modular-monolith] with that module extracted as a service
    NO -> ? Are the domain boundaries still shifting as you learn the business?
      YES -> Modular Monolith [modular-monolith]
      NO -> Modular Monolith [modular-monolith]
```

## When Modular Monolith

- A product in the first years of its life, when domain boundaries are still being
  discovered — moving a class between modules is a refactor, moving it between services
  is a project.
- One to a handful of teams that can share a release pipeline without blocking each other.
- Workflows that span modules and want a real database [transaction](/concept/transaction)
  instead of a [saga](/pattern/saga).
- Limited operations capacity: no platform team to own tracing, service discovery,
  gateways and per-service dashboards.
- You want a path to services later: strict module APIs, no cross-module table access,
  and module-owned schemas make extraction a mechanical step.

## When Microservices

- Many teams whose release cadence, on-call and roadmap must be decoupled; the release
  train of a monolith has become the bottleneck.
- Modules with fundamentally different runtime needs — a GPU-bound inference service, a
  memory-hungry search indexer, a latency-critical checkout path.
- Regulatory or security isolation: payment card handling in its own boundary with its own
  audit scope.
- Different parts of the system genuinely need different technology (JVM for one, Python
  for ML, Go for a proxy) and a shared runtime would compromise them all.
- The organisation already runs the platform pieces — [API gateway](/concept/api-gateway),
  service discovery, [observability](/concept/observability), container orchestration
  with [Kubernetes](/technology/kubernetes) — so the marginal cost of one more service is low.

## Deep Dive

**Where the boundary lives.** In a modular monolith a boundary is a *public API* of a
module: a small interface package that other modules may depend on, and an internal
package they may not. Enforcement comes from the language (Java modules, Go internal
packages, TypeScript project references) and from build-time rules (ArchUnit, dependency
linting). Because nothing physically stops a developer from importing an internal class
under deadline pressure, the boundary erodes unless it is tested in CI. In microservices
the boundary is the network: the only way to reach another service's data is its API. The
boundary cannot erode — but it also cannot be crossed cheaply when it turns out to be in
the wrong place.

**Data.** The deepest difference is data ownership. A monolith usually has one database,
and the temptation is a single schema where the orders module joins directly onto the
customers table. A *modular* monolith resists this: each module owns its tables (often a
schema per module) and other modules go through its API. Do this and you already have the
hardest property of microservices — [database per service](/pattern/database-per-service) —
without the network. Skip it and the monolith is just a big ball of mud with folders.

**Consistency.** Inside one process with one database, "create order and reserve stock"
is one [ACID](/concept/acid) transaction. Across services it is two databases and a
network hop between them, so it becomes a saga with compensating actions, an
[outbox](/pattern/outbox) to publish events reliably, and idempotent handlers for retries.
Every such workflow is a design task and a source of subtle bugs. Count how many
cross-module transactions you have before you split; each one is a saga you will write.

**Failure.** A monolith fails as a unit: a memory leak in reporting takes down checkout.
Microservices fail partially: reporting can be down while checkout works — provided
checkout does not call reporting synchronously. In practice partial failure introduces
[timeouts](/pattern/timeout), [retries](/pattern/retry), [circuit breakers](/pattern/circuit-breaker)
and [bulkheads](/pattern/bulkhead) into code that previously made a method call. The
monolith equivalent, isolating the leaky module in its own process or thread pool, is far
less work but far less flexible.

**Deployment and scale.** The monolith deploys as one; a hot module means scaling every
copy of everything, which wastes memory but is operationally trivial. Services scale
independently and deploy independently, which is the whole point — and also why the
number of things to build, version, monitor and secure grows linearly with service count.
Teams commonly underestimate that a service is not just code: it is a pipeline, a
dashboard, alert rules, an API contract and an on-call rotation.

**The migration path.** The reason to prefer a modular monolith first is not that
microservices are wrong; it is that boundaries drawn before the domain is understood are
usually wrong, and moving them across a network is expensive. A monolith with real module
boundaries lets you extract the one module that needs it — often the one with the
different scaling profile — behind the same interface it already had, and leave the rest
alone. The reverse migration, merging badly-split services, is far more painful.

## Related

- [Modular Monolith](/pattern/modular-monolith) — how to enforce boundaries inside one process
- [Microservices](/architecture/microservices) — a full reference architecture with gateway and events
- [Database per Service](/pattern/database-per-service) — the data rule both approaches should follow
- [Saga](/pattern/saga) and [Outbox](/pattern/outbox) — what cross-module transactions become after a split
- [Layered Architecture](/pattern/layered-architecture) — the internal structure of each module or service
