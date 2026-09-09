---
id: rabbitmq
name: RabbitMQ
tagline: Message broker with flexible routing, per-message acknowledgements and work queues
category: messaging
tags: [Messaging, Message Queue, AMQP, Distributed System]
difficulty: 3
usedFor: [message-queue, pub-sub]
prerequisites: [http, backend, message-queue]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - message-queue
  - pub-sub
  - rabbitmq
  - dead-letter-queue
  - retry
  - kafka
related:
  - { to: redis, rel: ALTERNATIVE_TO }
  - { to: dead-letter-queue, rel: IMPLEMENTS }
  - { to: event-driven-architecture, rel: IMPLEMENTS }
  - { to: retry, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: notification-system, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "RabbitMQ 4.x", confidence: high }
---

## TL;DR

RabbitMQ is a traditional message broker: producers publish to an *exchange*, the
exchange routes each message to zero or more *queues* by routing key or headers, and
consumers take messages from queues and acknowledge them one by one. A message is
removed once acknowledged. This makes RabbitMQ a natural fit for background jobs,
work distribution and request/reply between services — problems where routing,
retries and per-message delivery matter more than replaying history.

## Practical

Most teams meet RabbitMQ as the thing that makes slow work asynchronous: send the
email, resize the image, generate the invoice — later, on a worker, with retries.

What you actually build:

- **Work queues.** Many worker processes consume the same queue; the broker hands each
  message to exactly one of them and redelivers if the worker dies before acking.
- **Publish/subscribe with a `fanout` or `topic` exchange** — one event, several
  queues (email, SMS, audit), each with its own consumers. See [Pub/Sub](/concept/pub-sub).
- **Routing by key** — `order.created.eu` reaches queues bound to `order.*.eu` and
  `order.created.#`.
- **Retries with delay** — reject to a *dead-letter exchange*, or use a per-message
  TTL on a wait queue that dead-letters back to the work queue after N seconds. See
  [Retry](/pattern/retry) and [Dead Letter Queue](/pattern/dead-letter-queue).
- **Prefetch (QoS)** to limit how many unacked messages one consumer holds, so a slow
  worker does not hoard work.
- **Publisher confirms** so the producer knows the broker has persisted the message.

```ts
// Node.js with amqplib — a durable work queue with manual acks
const ch = await conn.createChannel();
await ch.assertExchange("orders", "topic", { durable: true });
await ch.assertQueue("email-worker", {
  durable: true,
  arguments: { "x-queue-type": "quorum", "x-dead-letter-exchange": "orders.dlx" },
});
await ch.bindQueue("email-worker", "orders", "order.created.*");
await ch.prefetch(10);

ch.consume("email-worker", async (msg) => {
  try {
    await sendConfirmationEmail(JSON.parse(msg!.content.toString()));
    ch.ack(msg!);                       // done — broker deletes it
  } catch (e) {
    ch.nack(msg!, false, false);        // no requeue => goes to the DLX
  }
});
```

Operationally you run three or more nodes, use *quorum queues* for anything that
matters, watch queue depth and unacked counts in the management UI, and set queue
length limits so a dead consumer cannot fill the disk.

## Deep Dive

**Exchanges decouple routing from storage.** Producers never address a queue. `direct`
routes on an exact key, `topic` on wildcard patterns, `fanout` to every bound queue,
`headers` on attribute matching. Bindings can be changed at runtime, so adding a new
consumer is a configuration change, not a producer deployment.

**Delivery guarantees.** By default at-least-once: a message is redelivered if the
consumer's channel closes before it acks, so handlers must be idempotent. See
[Idempotency](/concept/idempotency). Turning on auto-ack gives at-most-once. Publisher
confirms plus persistent messages plus quorum queues give durability on the way in.

**Quorum queues.** Replicated with Raft across nodes; a queue stays available while a
majority of its members is up, and a confirmed publish is on a majority before the
producer hears about it. Classic mirrored queues were removed in 4.0; classic queues
still exist but are single-node and should be limited to transient data.

**Streams.** Since 3.9 RabbitMQ also offers an append-only log type with offset-based,
non-destructive reads and replay — a subset of what [Kafka](/technology/kafka) does,
useful when you already run RabbitMQ and need one or two replayable topics.

**Protocols.** AMQP 0-9-1 is the historical core; 4.0 added native AMQP 1.0, and
plugins provide MQTT (IoT) and STOMP (web). The broker is written in Erlang/OTP,
which is where its connection handling and clustering come from.

**Flow control and memory.** Messages live in memory and are paged to disk under
pressure. A queue that grows unbounded slows the whole node; when the memory or disk
alarm fires, RabbitMQ blocks *all* publishers on that node. Length limits,
per-message TTL and consumer scaling are the levers.

**Ordering.** FIFO per queue with a single consumer. With several consumers, redelivery
and prefetch mean messages can complete out of order — do not rely on global ordering.

## Why

Anything slow, flaky or non-essential that runs inside an HTTP request makes that
request slow and flaky too. Sending an email through a third-party SMTP provider while
the user waits for "Order placed" is the classic example.

```sequence
title: Without a queue — slow side effects run inside the request
participants: Browser, API [backend], Email provider
Browser -> API: POST /orders
API -> API: save order
API -> Email provider: send confirmation
Email provider --> API: timeout after 8 s ❌
API --> Browser: 500 — order saved, user thinks it failed
```

A broker turns the side effect into a message. The API publishes and responds
immediately; a worker consumes, retries on failure, and dead-letters the message if it
keeps failing so a human can look.

```sequence
title: With RabbitMQ — publish, respond, let a worker retry
participants: Browser, API [backend], RabbitMQ [rabbitmq], Worker, Email provider
Browser -> API: POST /orders
API -> API: save order
API -> RabbitMQ: publish order.created (confirm)
RabbitMQ --> API: confirmed
API --> Browser: 201 Created (30 ms)
RabbitMQ -> Worker: deliver order.created
Worker -> Email provider: send confirmation
Email provider --> Worker: timeout
Worker -> RabbitMQ: nack → retry queue (TTL 30 s)
RabbitMQ -> Worker: redeliver after 30 s
Worker -> Email provider: send confirmation
Email provider --> Worker: 250 OK
Worker -> RabbitMQ: ack
```

The same building blocks — exchanges, bindings, acks — scale from one background job
to the messaging layer of an [Event-Driven Architecture](/pattern/event-driven-architecture).

## Advantages

- Flexible routing (direct, topic, fanout, headers) configured on the broker, not in producers
- Per-message acknowledgements, redelivery, prefetch and dead-lettering built in
- Quorum queues give replicated, majority-committed durability
- Low latency for individual messages — well suited to jobs and RPC-style patterns
- Multi-protocol (AMQP 0-9-1, AMQP 1.0, MQTT, STOMP) with clients for every language
- Excellent management UI and good defaults; easy to run a single node locally

## Trade-offs

- Messages are deleted when acked — no replay for new consumers (except with streams)
- Throughput per queue is lower than a partitioned log; very high volumes need careful design
- Deep queues hurt performance and can trigger memory alarms that block all publishers
- No ordering guarantee once several consumers share a queue
- Clustering across data centres is awkward; federation and shovel add complexity
- Erlang runtime and AMQP concepts (exchanges, bindings, vhosts) are a learning curve

## When to use

- Background jobs and work distribution with retries, priorities and dead-letter handling
- Fan-out of events to a handful of known consumers with different routing needs
- Request/reply or RPC between services where a broker's delivery guarantees help
- Moderate volume (thousands to low hundreds of thousands of messages per second)
- Teams that want a broker they can run with a small footprint and inspect through a UI

## When not to use

- You need to replay history or let many independent consumer groups read the same stream — [Kafka](/technology/kafka)
- Sustained very high throughput with long retention (logs, clickstreams, CDC)
- Strict global ordering across parallel consumers
- The job is trivial and you already run Redis — a Redis list or stream may be enough
- Synchronous request/response where an HTTP call is simpler and latency-critical

## Real-world

RabbitMQ is the typical job broker in a [Notification System](/architecture/notification-system):
the API publishes "send notification", workers per channel (push, email, SMS) consume,
retry with back-off and dead-letter failures. In [Microservices](/architecture/microservices)
and [E-commerce](/architecture/e-commerce) systems it carries commands and events between
services when per-message routing matters more than replay. For the log-versus-broker
decision see [Kafka](/technology/kafka).
