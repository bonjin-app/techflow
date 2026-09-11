---
id: domain-driven-design
name: Domain-Driven Design
tagline: Let the business's own language and boundaries decide the shape of the code
category: architecture
tags: [Application Architecture, Domain Model, Modelling, Boundaries]
difficulty: 4
prerequisites: [programming-fundamentals, backend, layered-architecture]
learningPath:
  - programming-fundamentals
  - backend
  - layered-architecture
  - domain-driven-design
  - modular-monolith
  - microservices
related:
  - { to: clean-architecture, rel: USED_WITH }
  - { to: hexagonal-architecture, rel: USED_WITH }
  - { to: modular-monolith, rel: USED_WITH }
  - { to: microservices, rel: RELATED_TO }
  - { to: event-driven-architecture, rel: USED_WITH }
  - { to: anti-corruption-layer, rel: RELATED_TO }
  - { to: database-per-service, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

A system grows and nobody can say what anything means. "Order" is a shopping basket in the
checkout code, a fulfilment record in the warehouse code, and a revenue line in the finance
export — one class, three meanings, so every change breaks one of the three. Business rules
live in controllers, in database triggers and in a spreadsheet someone maintains. Developers
and domain experts hold separate vocabularies and translate between them in every meeting,
losing something each time.

The usual reaction is a technical reorganisation: more layers, a shared `common` module, a
canonical data model for the whole company. That makes it worse, because it forces the three
meanings of "order" into one class that must satisfy everyone and therefore serves nobody.
The real problem is not structure, it is that nobody has decided where one meaning ends and
the next begins.

## Solution

Domain-driven design says the model is the product of a conversation with domain experts,
expressed in *their* language, and that a model is only valid inside a boundary where that
language is consistent. Those boundaries — **bounded contexts** — are the primary
architectural decision. Inside one, terms have exactly one meaning and the model is kept
rigorously consistent. Between them, nothing is shared implicitly: they exchange messages,
and each translates the other's terms at its own edge.

```steps
title: Arriving at contexts instead of a canonical model
Talk to the experts, not to the schema | write down the words they use and where they disagree
Notice where one word means two things | "order" in checkout vs fulfilment vs finance
Draw a boundary at the disagreement | each becomes a bounded context with its own model
Define the language inside each | a ubiquitous language used in code, tests and conversation
Model behaviour, not just data | the context owns the rules that protect its invariants
Pick aggregates | the smallest unit that must change together and stays consistent
Give each aggregate one root | all changes go through it; nothing reaches inside
Make context boundaries explicit | published events or an API, with a translation layer at each edge
Map the relationships | who depends on whom, and who is obliged to keep a contract stable
Let the boundaries guide deployment | one module per context first; separate services only if needed
```

## How it works

**Ubiquitous language.** The words in the code are the words the experts use, with the same
meanings. If the business says "policy lapses", the code says `lapse()`, not
`setStatus(3)`. The test is a conversation: a domain expert should recognise their own
vocabulary when a developer reads a method name aloud. Where they would not, the model is
drifting away from the domain and the next requirement will be translated wrongly.

**Bounded contexts.** A context is the scope within which the language holds. It owns its
model and its data, and it does not share a database with another context — that is what
makes it a boundary rather than a naming convention. Two contexts may both have a `Customer`
with different fields and different rules, and that duplication is the point: each is correct
for its own purpose.

**Aggregates and invariants.** An aggregate is a cluster of objects that must stay consistent
as a unit — an `Order` with its lines, where the rule "total equals the sum of lines" must
never be observably false. One object is the **aggregate root**, all changes go through it,
and one transaction changes one aggregate. Consistency between aggregates is achieved
afterwards, with events, which is the same reasoning that leads to
[Saga](/pattern/saga) across services.

**Entities, value objects and domain services.** Entities have identity that persists
(`Customer 42`). Value objects are defined entirely by their values and are immutable
(`Money`, `Address`, `DateRange`) — making them a type rather than a pair of primitives
removes a whole class of bug. A domain service holds a rule that belongs to no single entity.

**Domain events.** "OrderPlaced", "PaymentCaptured", "PolicyLapsed" — facts in the
business's language, published by the context that owns the decision. They become the
integration mechanism between contexts and the natural fit for
[Event-Driven Architecture](/pattern/event-driven-architecture) and
[Outbox](/pattern/outbox).

**Context mapping and translation.** The relationships between contexts are explicit: who
publishes, who consumes, who must remain compatible. At each boundary an
[Anti-Corruption Layer](/pattern/anti-corruption-layer) translates the other side's model
into yours, so a legacy system or a vendor API cannot leak its vocabulary into your domain.

**Layering to keep the domain clean.** The domain model must not depend on the database, the
web framework or the message broker; those depend on it. That is the dependency rule of
[Clean Architecture](/pattern/clean-architecture) and
[Hexagonal Architecture](/pattern/hexagonal-architecture) — in practice DDD supplies the
model and those patterns supply the wiring.

## Advantages

- Business rules live in one place, in the language of the people who own them
- Boundaries are drawn where meanings actually differ, so changes stay local
- No canonical model to negotiate: each context keeps the model that fits its job
- Invariants are enforced by aggregates rather than hoped for across services
- Conversations with domain experts get shorter, because there is one vocabulary
- The context map is a credible basis for team ownership and, later, for service boundaries
- Domain events give you integration and an audit trail of business facts for free

## Disadvantages

- Expensive: it requires sustained access to domain experts, which many teams do not have
- Heavy for simple domains — CRUD over a database gains nothing from an aggregate
- The tactical patterns are easy to cargo-cult; entities and repositories without a real
  model is ceremony, not design
- Deliberate duplication across contexts looks like waste to reviewers and to management
- Getting boundaries wrong is costly, and you rarely know until the second year
- Aggregate design constrains transactions, pushing you into eventual consistency
- The vocabulary (aggregate, ubiquitous language, anti-corruption layer) can obscure simple
  ideas and turn design discussion into terminology argument

## When to use

- The domain is genuinely complex: insurance, logistics, payments, healthcare, trading
- Business rules, not integrations or scale, are the hard part of the system
- The same words already mean different things in different parts of the product
- Domain experts are available and engaged, and the model can be built with them
- You are deciding service or module boundaries and want a principled basis for them
- A long-lived system where the cost of a wrong boundary will be paid for years

## When not to use

- Don't use DDD for a CRUD application — forms over data need forms over data
- When there is no access to domain experts; without them you are inventing a model
- For a prototype whose main question is whether anyone wants the product
- In a technically-hard but domain-simple system (a cache, a proxy, an ingest pipeline)
- When the team is small and the domain is one they already understand completely
- As a justification for [microservices](/architecture/microservices) — get the boundaries right
  in a [modular monolith](/pattern/modular-monolith) first, where they are cheap to move

## Real-world

The pattern's most durable contribution is boundary-finding. In
[E-commerce](/architecture/e-commerce), "order" separates cleanly into a checkout context
(basket, pricing, promotions), a payment context (authorisation, capture, refund — see
[Payment System](/architecture/payment-system)), a fulfilment context (pick, pack, ship) and
a finance context (recognition, invoicing). Each keeps its own model and they exchange
events: `OrderPlaced`, `PaymentCaptured`, `ShipmentDispatched`. Nobody has to agree on one
order table, which is why a promotion change does not ripple into the warehouse.

In practice most teams get the value from the strategic half — ubiquitous language, bounded
contexts, a context map, domain events — and apply the tactical half selectively, only in the
contexts where the rules are genuinely intricate. Starting as modules inside a
[modular monolith](/pattern/modular-monolith) keeps the boundaries adjustable while you are
still learning where they belong, and promotes them to
[services with their own databases](/pattern/database-per-service) only where scale or team
autonomy demands it. The failure mode to avoid is the inverse: distributed services drawn
around technical layers, each needing three others to answer one question.
