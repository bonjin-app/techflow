---
id: kafka-vs-rabbitmq
name: Kafka vs RabbitMQ
tagline: Durable replayable event log versus a smart routing broker with per-message acks
category: decision
tags: [Messaging, Event-driven, Distributed System, Decision]
difficulty: 4
subjects: [kafka, rabbitmq]
related:
  - { to: message-queue, rel: RELATED_TO }
  - { to: pub-sub, rel: RELATED_TO }
  - { to: event-driven-architecture, rel: RELATED_TO }
  - { to: dead-letter-queue, rel: RELATED_TO }
  - { to: outbox, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Both move messages between services asynchronously, but they are built on different
ideas. [Kafka](/technology/kafka) is an append-only, partitioned log: producers write
records, the broker keeps them for a configured retention, and any number of consumer
groups read at their own offset — including re-reading from the past.
[RabbitMQ](/technology/rabbitmq) is a classic message broker: producers publish to
exchanges, the broker routes each message into queues by rules, and consumers acknowledge
messages individually so they can be deleted. Kafka wins when events are shared, replayed
or arrive in very large volume; RabbitMQ wins when you need flexible routing, task queues,
priorities, delays and simple per-message retry. Many systems run both.

## Comparison

```compare
Feature                | Kafka                                              | RabbitMQ
Core model             | Partitioned, replicated append-only log             | Exchanges route messages into queues
Message lifetime       | Retained for time/size regardless of consumption     | Deleted once acknowledged
Consumers              | Pull; each group tracks its own offset               | Push to subscribers with prefetch
Replay                 | Reset offset and re-read history                      | Not possible once acked (streams plugin aside)
Ordering               | Strict within a partition                             | Per queue with a single consumer
Routing                | By topic and partition key only                       | Topic wildcards, headers, direct, fan-out
Per-message features   | None: no priorities, no TTL per message, no delay     | Priorities, TTL, dead-lettering, delayed delivery
Throughput             | Millions of messages per second per cluster           | Tens to hundreds of thousands per node
Latency                | Milliseconds; batching favours throughput            | Sub-millisecond to low milliseconds
Protocols              | Kafka binary protocol                                 | AMQP 0-9-1, MQTT, STOMP
Operational weight     | Cluster, partitions, rebalancing, retention tuning     | Simpler single node; clustering has sharp edges
```

## Decision

```decision
? Will several independent services consume the same events, or do you need to replay history?
  YES -> Kafka [kafka]
  NO -> ? Is per-message routing (wildcards, headers), priority or delayed delivery central to the design?
    YES -> RabbitMQ [rabbitmq]
    NO -> ? Do you expect sustained volume above roughly 100k messages per second or retention measured in days?
      YES -> Kafka [kafka]
      NO -> ? Is it a work queue where each job is handled once and retried or dead-lettered on failure?
        YES -> RabbitMQ [rabbitmq]
        NO -> ? Does the team already operate a Kafka cluster?
          YES -> Kafka [kafka]
          NO -> RabbitMQ [rabbitmq]
```

## When Kafka

- Event streaming: one "order placed" event feeds billing, inventory, analytics and search independently.
- You need to replay — rebuild a read model after a bug, backfill a new consumer, or audit what happened.
- Volume is high and steady; batching and sequential disk I/O keep cost per message low.
- Ordering per key matters (all events for one customer in sequence) — partition by that key.
- You are building [Event-Driven Architecture](/pattern/event-driven-architecture) or [CQRS](/pattern/cqrs) read models.
- See the [Chat System](/architecture/chat-system) where Kafka is the durable copy behind fast Pub/Sub.

## When RabbitMQ

- Task and job queues: send email, resize image, run a report — each handled by exactly one worker.
- Routing rules live in the broker: `orders.eu.*` to one queue, `orders.#` to an audit queue.
- Per-message needs: priorities, delayed retry, TTL, [Dead-Letter Queues](/pattern/dead-letter-queue) out of the box.
- Request/reply or RPC-style messaging between services with low latency.
- Modest volume where a single well-understood node is easier to run than a cluster.
- Many protocols and lightweight clients (IoT devices over MQTT, browsers over STOMP).

## Deep Dive

**Storage and delivery.** Kafka writes every record to a partition's segment files and
serves consumers by streaming bytes from disk (page cache) with zero-copy transfer. The
broker does not track who has read what; each consumer group commits its offset. That is
why consuming is cheap for the broker, why history is available to replay, and why a
slow consumer never slows a fast one. RabbitMQ keeps messages in queues (memory first,
paged to disk), pushes them to consumers within a prefetch window and deletes them on
`ack`. Unacked messages are redelivered; the broker does real work per message and per
consumer.

**Ordering and parallelism.** In Kafka, parallelism equals partitions: a group can have at
most one active consumer per partition, and order is guaranteed only inside a partition.
Choose the partition key deliberately (user id, order id) — a poor key produces hot
partitions. RabbitMQ scales consumers on a queue freely, but as soon as two consumers read
one queue, order is lost; you need the consistent-hash exchange or single active consumer
to get it back.

**Failure handling.** RabbitMQ has first-class semantics for a message that could not be
processed: `nack` with requeue, per-queue TTL, dead-letter exchanges, delayed
redelivery. In Kafka the log is immutable — a consumer that fails must skip, block the
partition, or write the record to a separate retry topic and manage its own back-off
(see [Retry](/pattern/retry)). Both need [idempotent](/concept/idempotency) consumers
because redelivery is inevitable.

**Delivery guarantees.** Both provide at-least-once by default. Kafka adds idempotent
producers and transactions that make exactly-once possible *within* Kafka (consume →
process → produce). Neither gives you exactly-once with respect to an external database;
that is what the [Outbox](/pattern/outbox) pattern is for.

**Operations.** Kafka is a distributed system: replication factor, in-sync replicas,
partition rebalancing, retention and compaction policies, and (historically) ZooKeeper.
Managed offerings remove much of this but not the modelling decisions. RabbitMQ runs
comfortably as one node for years; clustering and quorum queues are solid but network
partitions must be planned for. RabbitMQ Streams narrows the gap for log-style
retention, and Kafka's ecosystem (Connect, Streams) adds capabilities RabbitMQ lacks —
evaluate the surrounding tooling, not only the broker.

## Related

- [Message Queue](/concept/message-queue) — the concept both implement, differently
- [Pub/Sub](/concept/pub-sub) — fan-out semantics
- [Outbox](/pattern/outbox) and [Dead-Letter Queue](/pattern/dead-letter-queue) — reliability patterns around either broker
- [Notification System](/architecture/notification-system) — a broker-centred architecture
