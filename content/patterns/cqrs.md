---
id: cqrs
name: CQRS
tagline: Separate the model that handles writes from the models that serve reads
category: architecture
tags: [Architecture, Data, Scalability, Distributed System]
difficulty: 4
prerequisites: [database, transaction, message-queue, eventual-consistency]
learningPath:
  - database
  - transaction
  - replication
  - event-driven-architecture
  - outbox
  - cqrs
  - eventual-consistency
related:
  - { to: database, rel: SOLVES }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: replication, rel: RELATED_TO }
  - { to: event-driven-architecture, rel: USED_WITH }
  - { to: outbox, rel: USED_WITH }
  - { to: postgresql, rel: USED_WITH }
  - { to: elasticsearch, rel: USED_WITH }
  - { to: kafka, rel: USED_WITH }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

One data model is asked to do two very different jobs. Writes want normalised
tables, foreign keys and transactions so that an order, its lines and its stock
reservation stay consistent. Reads want the opposite: the order page joins eight
tables, the dashboard aggregates millions of rows, and search needs an inverted
index. Every index that speeds up a read slows down a write; every join that keeps
the write side clean makes the read side slower and harder to cache. Reads usually
outnumber writes by an order of magnitude, yet both compete for the same database
and the same schema.

## Solution

Split the application into a **command side** that validates and applies changes
and a **query side** that answers questions. Commands go to a write model that owns
the source of truth and enforces invariants. Every accepted change is published as
an event; **projectors** consume those events and maintain read models shaped for
the screens that use them — a denormalised table, a search index, a cache entry.
Queries read those views and never touch the write model.

```sequence
title: Command, then projection, then query
participants: Client, Command API [backend], Write DB [postgresql], Bus [kafka], Projector [backend], Read Store [elasticsearch], Query API [backend]
Client -> Command API: POST /orders
Command API -> Write DB: INSERT order + outbox event (one transaction)
Write DB --> Command API: committed
Command API --> Client: 202 Accepted { orderId }
Write DB -> Bus: OrderPlaced (relayed from outbox)
Bus -> Projector: OrderPlaced
Projector -> Read Store: upsert order-summary view
Client -> Query API: GET /orders/42
Query API -> Read Store: fetch view
Read Store --> Query API: document
Query API --> Client: 200 OK
```

## How it works

```steps
title: Two independent paths
Command arrives [http]
Validate against the write model [transaction] | invariants live only here
Persist the change and its event atomically [outbox]
Publish the event [message-queue]
Projector updates one or more read models [eventual-consistency] | milliseconds to seconds later
Query returns a pre-shaped view | no joins or aggregation at request time
```

The write model stays normalised and small. Read models can be many — one per
screen if needed — and each is **disposable**: because it is derived from events,
it can be dropped and rebuilt by replaying the stream after a bug or a schema
change. The two sides scale independently: add read replicas or a search cluster
without touching the transactional database.

CQRS comes in degrees. The lightest form is separate read and write code paths
against the same database (views, or a read replica via
[replication](/concept/replication)). The full form uses separate stores fed by
events, which is where the eventual consistency shows up. Event sourcing —
storing the events *as* the write model — is a separate decision that is often
combined with CQRS but is not required by it.

```ts
// Projector: keeps a flat "order summary" view up to date
async function onOrderPlaced(evt: OrderPlaced) {
  await readStore.upsert("order-summary", evt.orderId, {
    orderId: evt.orderId,
    customerName: evt.customer.name,      // denormalised on purpose
    itemCount: evt.lines.length,
    total: evt.lines.reduce((s, l) => s + l.price * l.qty, 0),
    status: "PLACED",
    version: evt.version,                 // reject out-of-order events
  });
}
```

## Advantages

- Read and write sides scale, deploy and evolve independently
- Read models match the UI exactly — no N+1 queries, no request-time joins
- The write model stays simple and strongly consistent
- Read stores can use the best tool for each view: search index, cache, columnar store
- Read models can be rebuilt from events after bugs or schema changes

## Disadvantages

- Reads are eventually consistent — a user may not see their own write immediately
- Two models, projectors and a message bus: much more code and infrastructure
- Every projector must be idempotent and handle out-of-order or duplicate events
- Debugging spans several stores and an asynchronous hop
- Easy to over-apply; a CRUD service gains nothing from the split

## When to use

- Read and write workloads differ sharply in shape or volume
- Several views of the same data (search, dashboards, feeds) are hard to serve from one schema
- You already publish domain events and want to derive views from them
- The write model has complex invariants that a reporting schema would pollute

## When not to use

- Simple CRUD where one schema serves both reads and writes fine
- Users must always read their own writes with no delay and no UI workarounds
- The team cannot operate a message bus and projectors reliably
- A read replica or [Cache Aside](/pattern/cache-aside) already removes the read bottleneck

## Real-world

CQRS shows up in order management, banking ledgers and any product with a busy
search page: the write side lives in [PostgreSQL](/technology/postgresql),
events flow through [Kafka](/technology/kafka), and projectors maintain a
denormalised view in [Elasticsearch](/technology/elasticsearch) or Redis. In the
[Microservices](/architecture/microservices) architecture each service owns its
write store and publishes events that other services turn into their own local
read models instead of querying across service boundaries.
