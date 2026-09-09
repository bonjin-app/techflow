---
id: outbox
name: Transactional Outbox
tagline: Write the event into the same database transaction as the data, then publish it
category: messaging
tags: [Messaging, Consistency, Distributed System]
difficulty: 3
prerequisites: [database, transaction, message-queue]
learningPath:
  - database
  - transaction
  - acid
  - message-queue
  - outbox
  - idempotency
  - saga
related:
  - { to: transaction, rel: SOLVES }
  - { to: message-queue, rel: RELATED_TO }
  - { to: idempotency, rel: REQUIRES }
  - { to: postgresql, rel: USED_WITH }
  - { to: kafka, rel: USED_WITH }
  - { to: rabbitmq, rel: USED_WITH }
  - { to: event-driven-architecture, rel: RELATED_TO }
  - { to: saga, rel: USED_WITH }
  - { to: e-commerce, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

A service must do two things when an order is placed: commit the order row to its
database and publish an `OrderPlaced` event to a [message queue](/concept/message-queue)
so other services react. These are two different systems and there is no
[transaction](/concept/transaction) that spans both.

Whichever order you choose, a crash in between breaks the system. Commit first,
then publish: if the process dies after the commit, the order exists but no event is
ever sent — downstream never hears about it. Publish first, then commit: the event
goes out, the commit fails, and consumers act on an order that does not exist. This
"dual write" problem is the most common source of silent data inconsistency between
services.

## Solution

Write the event into an **outbox table** in the *same* database, inside the *same*
transaction as the business data. The commit is atomic: either both the order and
its event exist, or neither does. A separate relay process then reads unpublished
rows from the outbox, publishes them to the broker, and marks them as sent. If the
relay crashes, it simply resumes from the unsent rows.

```sequence
title: Order placed — one transaction, then relay
participants: Order Service [backend], DB [postgresql], Relay [backend], Broker [kafka]
Order Service -> DB: BEGIN
Order Service -> DB: INSERT INTO orders …
Order Service -> DB: INSERT INTO outbox (type, payload)
Order Service -> DB: COMMIT
DB --> Order Service: OK
Relay -> DB: SELECT * FROM outbox WHERE published_at IS NULL
DB --> Relay: rows
Relay -> Broker: publish OrderPlaced
Broker --> Relay: ack
Relay -> DB: UPDATE outbox SET published_at = now()
```

## How it works

```steps
title: Outbox lifecycle
Business write and outbox insert in one transaction [transaction]
Commit — both rows are now durable [acid]
Relay polls the outbox or tails the database log (CDC) [postgresql]
Relay publishes each row to the broker [message-queue]
Broker acknowledges
Relay marks the row published (or deletes it)
Consumers de-duplicate by event id [idempotency]
```

Two relay strategies are common. **Polling** is simple: a loop selects unpublished
rows every few hundred milliseconds. **Change data capture (CDC)** tails the
database's replication log and streams outbox inserts to the broker with lower
latency and no polling load; it needs extra infrastructure.

```sql
CREATE TABLE outbox (
  id            uuid PRIMARY KEY,
  aggregate_id  text NOT NULL,
  type          text NOT NULL,
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);

BEGIN;
INSERT INTO orders (id, customer_id, total) VALUES ('o-1', 'c-9', 42.00);
INSERT INTO outbox (id, aggregate_id, type, payload)
  VALUES (gen_random_uuid(), 'o-1', 'OrderPlaced', '{"orderId":"o-1","total":42}');
COMMIT;
```

The relay gives **at-least-once** delivery: if it publishes and then crashes before
marking the row, the row is published again on restart. Consumers must therefore be
[idempotent](/concept/idempotency) — usually by storing processed event ids. Ordering
per aggregate is preserved if the relay publishes rows in insertion order and uses
the aggregate id as the partition key.

## Advantages

- Eliminates the dual-write problem with tools you already have — a table and a transaction
- Events are never lost: they are as durable as the business data
- No distributed transaction or two-phase commit
- The outbox doubles as an audit log of what was emitted
- Works with any broker and any relational (or document) database that supports transactions

## Disadvantages

- At-least-once delivery — every consumer must handle duplicates
- Extra latency between commit and publish (polling interval or CDC lag)
- The outbox table grows and must be pruned; polling adds constant read load
- CDC relays add operational complexity (connectors, log retention, schema evolution)
- Events reflect the state at commit time; consumers reading the source later may see newer data

## When to use

- A service both updates its database and must publish an event about that change
- Losing or duplicating a "fact" between services is unacceptable (orders, payments, inventory)
- You are building an [Event-Driven Architecture](/pattern/event-driven-architecture) or a [Saga](/pattern/saga) and need reliable event emission
- The database supports transactions and you control the schema

## When not to use

- The event is purely informational and losing a few is fine (metrics, click tracking) — publish directly
- The database has no transactions across the business table and the outbox
- Sub-millisecond publish latency is required
- A single service owns both the data and every consumer — a local call may be simpler

## Real-world

The outbox is the standard answer to "how do I publish an event reliably" in
[microservices](/architecture/microservices) built on
[PostgreSQL](/technology/postgresql) and [Kafka](/technology/kafka). In the
[E-commerce](/architecture/e-commerce) architecture the checkout writes the order and
an `OrderPlaced` outbox row in one transaction; a relay publishes it so inventory,
payment and notification services all react to an order that definitely exists.
