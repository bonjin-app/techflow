---
id: pub-sub
name: Pub/Sub
tagline: Publishers emit events to a topic; every subscriber gets a copy, sender unaware of them
category: messaging
tags: [Messaging, Decoupling, Real-time]
difficulty: 3
prerequisites: [programming-fundamentals, backend, distributed-system]
learningPath:
  - backend
  - distributed-system
  - message-queue
  - pub-sub
  - event-driven-architecture
  - kafka
related:
  - { to: redis, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: rabbitmq, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: event-driven-architecture, rel: RELATED_TO }
  - { to: distributed-system, rel: REQUIRES }
  - { to: chat-system, rel: USED_IN }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Publish/subscribe is a messaging model in which a sender (publisher) writes a message to
a named **topic** or **channel** and every current subscriber of that topic receives a
copy. The publisher never addresses a recipient and does not know how many there are —
zero, one or a thousand. That indirection is the whole point: producers and consumers
can be added, removed and scaled independently.

## Why it matters

Direct calls couple the caller to every consumer of an event. When an order is placed,
the checkout code would have to call inventory, email, analytics and fraud detection in
turn — and grow a new call every time a team wants the event. With pub/sub the checkout
service publishes `order.placed` once, and each interested service subscribes. New
consumers appear without touching the producer, a slow consumer no longer slows the
request path, and one event can fan out to many parties in parallel.

It is also the natural fit for real-time delivery: a [Chat System](/architecture/chat-system)
with several servers uses a channel per room so a message received by one server reaches
the users connected to all the others.

## Visual

```sequence
title: Publish and fan-out
participants: Checkout [backend], Broker [redis], Inventory, Email, Analytics
Checkout -> Broker: PUBLISH order.placed {id: 42}
Broker -> Inventory: order.placed {id: 42}
Broker -> Email: order.placed {id: 42}
Broker -> Analytics: order.placed {id: 42}
Broker --> Checkout: 3 subscribers received
Inventory --> Broker: (reserve stock)
Email --> Broker: (send receipt)
```

## How it works

1. **Topics.** A topic (Redis calls it a channel, Kafka a topic, RabbitMQ an exchange
   with bindings) is a named stream. Publishers write to it; subscribers register
   interest in it, often with wildcards such as `order.*`.
2. **Broker.** A middle component receives each message and delivers a copy to every
   subscriber. This is what removes the publisher's knowledge of consumers.
3. **Fan-out.** One message, N deliveries. Compare this with a
   [Message Queue](/concept/message-queue), where one message is consumed by exactly one
   worker in a group.
4. **Delivery semantics.** Systems differ sharply here:
   - *Fire-and-forget* ([Redis](/technology/redis) Pub/Sub): a message is delivered only
     to subscribers connected at that instant. Disconnected clients miss it; nothing is
     stored.
   - *Durable log* ([Kafka](/technology/kafka)): messages are appended to a partitioned
     log and retained for a configured time. Subscribers keep an offset and can replay,
     so a consumer that was down for an hour catches up.
   - *Broker-managed queues per subscriber* ([RabbitMQ](/technology/rabbitmq) topic
     exchanges): each subscriber gets its own queue bound to the exchange, giving
     buffering and acknowledgements per consumer.

The right choice depends on whether a missed message is acceptable. Presence updates
("user is typing") tolerate loss; billing events do not.

## Deep Dive

**Ordering.** Fan-out across a network gives no global order. Kafka guarantees order
within a partition, so events for the same entity should share a partition key (for
example `order_id`). Redis Pub/Sub preserves order per connection but not across a
cluster.

**Backpressure.** A slow subscriber cannot slow a publisher that never waits for it.
In fire-and-forget systems the broker's output buffer to that client grows until the
broker drops the connection; in log-based systems the consumer simply falls behind
(consumer lag), which is measurable and alertable. Design for lag rather than pretending
delivery is instant.

**At-least-once and duplicates.** Durable systems redeliver when an acknowledgement is
lost, so subscribers must be [idempotent](/concept/idempotency) — typically by recording
processed event ids. Exactly-once delivery across arbitrary systems is not achievable;
exactly-once *effect* is achieved by dedup on the consumer side.

**Publishing reliably.** A service that writes to its database and then publishes can
crash between the two steps, losing the event. The [Outbox](/pattern/outbox) pattern
writes the event in the same [Transaction](/concept/transaction) and publishes it from
the outbox table afterwards.

**Schema evolution.** Because consumers are unknown to the producer, a changed message
shape breaks parties nobody remembered. Version events, add fields rather than removing
them, and treat the topic contract as a public API.

**Failure modes to expect:**

- A subscriber with a bug crashes on every message and, with redelivery, poisons its
  own queue — route repeated failures to a [Dead Letter Queue](/pattern/dead-letter-queue).
- Topic explosion: hundreds of fine-grained channels make routing and monitoring
  unmanageable; group by domain and filter on the consumer.
- Hidden coupling: consumers that depend on side effects of other consumers recreate
  the ordering problem pub/sub was meant to remove.

**When not to use it.** When the caller needs the result (a price lookup, a permission
check) a synchronous request is clearer. When a task must be done exactly once by one
worker, a competing-consumer [Message Queue](/concept/message-queue) fits better than
fan-out. Pub/sub is the backbone of an
[Event-Driven Architecture](/pattern/event-driven-architecture), and of a
[Notification System](/architecture/notification-system) where one event triggers push,
email and in-app delivery — the trade for all that decoupling is that the flow of a
single request is now spread across logs from several services.
