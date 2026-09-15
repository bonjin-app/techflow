---
id: event-driven-architecture
name: Event-Driven Architecture
tagline: Services publish facts about what happened; others react without being called
category: architecture
tags: [Architecture, Messaging, Distributed System, Asynchronous]
difficulty: 3
prerequisites: [backend, distributed-system, message-queue, pub-sub]
learningPath:
  - backend
  - message-queue
  - pub-sub
  - event-driven-architecture
  - idempotency
  - outbox
  - eventual-consistency
  - kafka
related:
  - { to: distributed-system, rel: SOLVES }
  - { to: pub-sub, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: kafka, rel: USED_WITH }
  - { to: rabbitmq, rel: USED_WITH }
  - { to: outbox, rel: USED_WITH }
  - { to: delivery-semantics, rel: REQUIRES }
  - { to: fan-out, rel: RELATED_TO }
  - { to: notification-system, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## Problem

A checkout service places an order and then has to call inventory, payment, email,
loyalty and analytics — synchronously, in sequence. Each call adds latency, each
dependency's outage becomes a checkout outage, and every new downstream team asks
for one more call in the checkout code. The producer of the information ends up
knowing about, and being coupled to, every consumer. Adding a feature means
changing the busiest service in the system.

## Solution

Turn "call everyone who needs to know" into "record what happened". The producer
publishes an **event** — an immutable fact in the past tense (`OrderPlaced`) — to a
broker and moves on. Consumers subscribe to the events they care about and react
at their own pace. The producer does not know who listens; consumers can be added
or removed without touching it.

```sequence
title: One event, many independent reactions
participants: Checkout [backend], Broker [kafka], Inventory [backend], Email [backend], Analytics [backend]
Checkout -> Broker: OrderPlaced { orderId, lines }
Broker --> Checkout: ack
Broker -> Inventory: OrderPlaced
Inventory -> Inventory: reserve stock
Broker -> Email: OrderPlaced
Email -> Email: send confirmation
Broker -> Analytics: OrderPlaced
Analytics -> Analytics: update daily revenue
```

## How it works

```steps
title: Lifecycle of an event
State changes in the producer [transaction]
Event is recorded with the change [outbox] | avoids "saved but never published"
Broker stores it durably [message-queue]
Each consumer group receives its own copy [pub-sub]
Consumer handles it idempotently [idempotency] | duplicates will happen
Consumer's own state is updated [eventual-consistency]
```

Three styles of event carry different amounts of information:

- **Notification** — just an id (`OrderPlaced { orderId }`); consumers call back to fetch details. Small payload, but the callback re-couples them.
- **Event-carried state transfer** — the event includes the data consumers need, so they keep a local copy and never call the producer. Larger payload, real autonomy.
- **Event sourcing** — the events *are* the producer's storage; current state is replayed from them. Powerful, but a different level of commitment.

The broker matters. A log such as [Kafka](/technology/kafka) keeps events for days
and lets a new consumer replay history; a queue such as
[RabbitMQ](/technology/rabbitmq) routes each message to the right worker and
deletes it once acknowledged. Either way, delivery is at-least-once in practice,
so every handler must tolerate duplicates and out-of-order arrival — see
[Delivery Semantics](/concept/delivery-semantics).

**An event is a fact, not an instruction.** `OrderPlaced` is something that
happened; `ReserveStock` is something you want done. The moment a producer publishes
the second one it has a dependency on the consumer again, just routed through a
broker — the coupling it was trying to remove, now harder to see. Name events in the
past tense and let each consumer decide what the fact means for it. When a producer
genuinely needs a specific thing done by a specific service, that is a command, and
a direct call is more honest than pretending otherwise.

**Schemas evolve, and consumers deploy on their own schedule.** This is the ongoing
cost of the pattern. Adding an optional field is safe; removing one, renaming one or
changing its meaning breaks every consumer you do not control, and you will not find
out at build time. A schema registry with compatibility rules turns that into a
failing publish rather than a silent break, and the discipline is the same as
[API versioning](/pattern/api-versioning): add, deprecate, remove in a later
version — never change in place. The subtler trap is semantic: keeping the field and
altering what it means passes every compatibility check and breaks every consumer.

**Order is guaranteed narrowly, if at all.** A log preserves order within a
partition, so events about one entity stay ordered only if they share a partition
key — usually the entity id. Across entities, and across topics, there is no order
at all, so a consumer that joins two streams must tolerate the child arriving before
the parent. Retries make it worse: a message sent to a retry topic reappears after
messages that came later. Designs that quietly assume global order work in staging
and fail under load.

**Debugging is the real tax.** A synchronous call stack shows you what happened; an
event chain does not, and "the email never arrived" could be the producer, the
broker, one of four consumers, or a filter three hops away. The mitigations are not
optional at any scale: a correlation id propagated through every event, distributed
tracing across the async boundary, and consumer lag as a first-class metric.
Without them the pattern's loose coupling becomes the inability to answer a simple
question — see [Observability](/concept/observability).

```ts
// Consumer: idempotent by design
async function onOrderPlaced(evt: OrderPlaced) {
  const seen = await db.processedEvents.exists(evt.id);
  if (seen) return;                                   // duplicate — ignore
  await db.tx(async (t) => {
    await t.stock.reserve(evt.lines);
    await t.processedEvents.insert({ id: evt.id });   // same transaction
  });
}
```

## Advantages

- Producers and consumers are decoupled in time, availability and deployment
- Adding a consumer requires no change to the producer
- Spikes are absorbed by the broker instead of overloading downstream services
- Natural audit trail; with a log broker, consumers can replay history
- Each consumer scales and fails independently

## Disadvantages

- Eventual consistency: downstream state lags, and users may notice
- Hard to see the whole flow — there is no single call stack to read or trace
- Duplicates, reordering and poison messages must be designed for, not hoped away
- Event schemas become a public contract; changing them breaks unknown consumers
- Requires operating a broker and monitoring consumer lag

## When to use

- One state change genuinely interests several independent parts of the system
- Consumers can tolerate seconds of delay and can be made idempotent
- You need to absorb bursts or keep a producer up while a consumer is down
- Teams own separate services and want to ship without coordinating releases

## When not to use

- The caller needs the result synchronously (price quote, permission check)
- There is exactly one consumer and it will stay that way — a direct call is simpler
- Strong consistency across the participating services is a hard requirement
- The team has no experience with brokers, dead-letter handling and idempotency

## Real-world

Order pipelines, notification fan-out and analytics are the usual entry points.
The [Chat System](/architecture/chat-system) writes every message to Kafka so
history, push notifications and analytics each consume it independently. The
[Notification System](/architecture/notification-system) receives events from any
service and fans them out to channel workers. Publishing safely alongside the
database write is the job of the [Transactional Outbox](/pattern/outbox); handling
messages that keep failing is the job of the
[Dead Letter Queue](/pattern/dead-letter-queue).
