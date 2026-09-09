---
id: kafka
name: Apache Kafka
tagline: Distributed, partitioned commit log for high-throughput, replayable event streams
category: messaging
tags: [Messaging, Event Streaming, Distributed System, Log]
difficulty: 4
usedFor: [message-queue, pub-sub, eventual-consistency, replication]
prerequisites: [backend, distributed-system, message-queue, pub-sub]
learningPath:
  - programming-fundamentals
  - backend
  - database
  - message-queue
  - pub-sub
  - distributed-system
  - kafka
  - event-driven-architecture
  - outbox
related:
  - { to: rabbitmq, rel: ALTERNATIVE_TO }
  - { to: event-driven-architecture, rel: IMPLEMENTS }
  - { to: outbox, rel: RELATED_TO }
  - { to: dead-letter-queue, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: chat-system, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
  - { to: notification-system, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "Apache Kafka 4.x", confidence: high }
---

## TL;DR

Kafka is an append-only log split into partitions and replicated across brokers.
Producers write records to a topic; any number of consumer groups read the same
records independently, at their own pace, and can rewind. Unlike a traditional queue,
messages are not deleted when read — they expire by retention policy. That makes Kafka
the backbone for event-driven systems, change-data-capture, log aggregation and stream
processing where throughput and replayability matter more than per-message routing.

## Practical

Teams usually adopt Kafka when several services need to react to the same business
events — "order placed", "payment captured", "message sent" — without the producer
knowing who listens.

What you actually build:

- **Topics per event type or aggregate** (`orders`, `payments`), keyed by the entity id
  so all events for one order land in the same partition, in order.
- **Consumer groups per service.** Each service gets every event once; partitions are
  shared among that service's instances for parallelism.
- **Idempotent consumers.** Kafka delivers at-least-once by default; handlers must
  tolerate duplicates. See [Idempotency](/concept/idempotency).
- **The Outbox pattern** to publish events atomically with database writes, usually
  via Debezium/Kafka Connect reading the DB log. See [Outbox](/pattern/outbox).
- **Retry and dead-letter topics** for poison messages so one bad record does not block
  a partition. See [Dead Letter Queue](/pattern/dead-letter-queue).
- **Schema Registry** (Avro/Protobuf/JSON Schema) so producers and consumers can evolve
  independently.

```bash
# Create a topic with 12 partitions, replicated 3× (KRaft cluster, no ZooKeeper)
kafka-topics.sh --bootstrap-server broker:9092 --create \
  --topic orders --partitions 12 --replication-factor 3 \
  --config retention.ms=604800000 --config min.insync.replicas=2

# Produce keyed records: same key => same partition => ordered
kafka-console-producer.sh --bootstrap-server broker:9092 --topic orders \
  --property parse.key=true --property key.separator=:
# order-42:{"type":"OrderPlaced","total":59.9}

# Consume as a group; offsets are committed per group
kafka-console-consumer.sh --bootstrap-server broker:9092 --topic orders \
  --group billing --from-beginning
```

Producer settings that matter: `acks=all` plus `enable.idempotence=true` (the default)
for no-loss, no-duplicate writes to the log; `linger.ms` and batching for throughput.

## Deep Dive

**Partitions are the unit of everything.** Ordering, parallelism, replication and
consumer assignment all happen per partition. Choosing the key decides ordering;
choosing the partition count decides the maximum consumer parallelism — and it is
painful to change later because re-partitioning breaks key→partition mapping.

**Offsets, not acks.** Each consumer group stores an offset per partition. Reading does
not remove data; committing an offset just records "I have processed up to here".
Commit after processing for at-least-once; commit before for at-most-once; use
transactions (`read_process_write`) for exactly-once *between Kafka topics*. Exactly-once
into an external database still needs idempotent writes on your side.

**Replication and ISR.** Each partition has a leader and followers. A write is
acknowledged when all *in-sync replicas* have it (`acks=all`); `min.insync.replicas`
bounds how many replicas may lag before writes are refused. Unclean leader election is
disabled by default, trading availability for no data loss.

**Retention and compaction.** Time/size retention drops old segments. Log compaction
keeps the latest record per key instead, turning a topic into a changelog you can
rebuild a table from — the foundation of Kafka Streams state stores and CDC topics.

**KRaft.** Since 4.0 Kafka runs its own Raft-based metadata quorum; ZooKeeper is gone.
Cluster metadata is itself a replicated log, which simplified operations and raised
partition-count limits. 4.x also made the new consumer rebalance protocol (KIP-848)
the default, removing stop-the-world rebalances, and introduced *share groups*
(queue-style cooperative consumption with per-record acks) as a preview feature.

**Consumers pull.** Brokers do not push; clients fetch in batches. This gives natural
back-pressure — a slow consumer simply lags — and lag (`consumer_lag`) is the metric
to alert on. A consumer that dies mid-batch triggers a rebalance and its partitions
move to a peer.

**Storage and throughput.** Sequential disk writes, zero-copy transfers and page cache
usage are why a modest broker sustains hundreds of MB/s. Tiered storage offloads old
segments to object storage so retention is bounded by cost, not local disk.

## Why

When several services need to know about the same event, the naive approach is for
the producer to call each of them. Every new consumer means a code change in the
producer, every slow consumer slows the request, and a consumer that is down means
lost information.

```sequence
title: Without an event log — the producer must know and wait for every consumer
participants: Order svc [backend], Billing, Inventory, Analytics
Order svc -> Billing: POST /charge
Billing --> Order svc: 200 (120 ms)
Order svc -> Inventory: POST /reserve
Inventory --> Order svc: 200 (80 ms)
Order svc -> Analytics: POST /event
Analytics --> Order svc: 503 ❌ event lost, request slow
```

With Kafka the producer appends one record and returns. Each consumer group reads at
its own speed; a service that was down catches up from its last offset, and a brand-new
consumer can replay history it never saw.

```sequence
title: With Kafka — publish once, consume independently, replay later
participants: Order svc [backend], Kafka [kafka], Billing, Inventory, Analytics
Order svc -> Kafka: append OrderPlaced (key order-42)
Kafka --> Order svc: ack (acks=all, 5 ms)
Kafka --> Billing: poll → OrderPlaced
Kafka --> Inventory: poll → OrderPlaced
Analytics -> Kafka: back online, poll from offset 1 203
Kafka --> Analytics: OrderPlaced (+ everything missed)
```

The same properties — durable, ordered, replayable — are why Kafka is also used for
change-data-capture, metrics/log pipelines and as the transport in
[Event-Driven Architecture](/pattern/event-driven-architecture).

## Advantages

- Very high throughput with sequential disk I/O and batching; scales horizontally by adding partitions and brokers
- Durable, replicated log that consumers can replay — new services can read history
- Many independent consumer groups read the same data without the producer knowing
- Strong ordering guarantees per key/partition
- Pull-based consumption gives natural back-pressure and simple lag monitoring
- Rich ecosystem: Kafka Connect (CDC, sinks), Kafka Streams, Schema Registry, tiered storage

## Trade-offs

- Operationally heavy: brokers, partitions, ISR, retention and rebalances all need understanding and monitoring
- Partition count is hard to change; ordering is only per partition, not global
- No per-message routing, priority or delayed delivery — that is broker-side logic Kafka does not offer
- At-least-once by default; consumers must be idempotent and handle duplicates
- End-to-end latency is typically milliseconds to tens of milliseconds — fine for events, not for RPC
- A single slow or poison record blocks its partition until handled

## When to use

- Several services must react to the same events, now or in the future
- Replayability matters: rebuilding read models, backfilling a new consumer, auditing
- High-volume streams — clickstreams, logs, metrics, IoT, CDC from databases
- Stream processing (windowed aggregations, joins) with Kafka Streams or Flink
- Decoupling producers from consumers in a [Microservices](/architecture/microservices) system

## When not to use

- Simple task queues with per-message acks, retries and priorities — [RabbitMQ](/technology/rabbitmq) is a better fit
- Request/response between two services — use HTTP/gRPC; a log adds latency and complexity
- Low volume (a few messages per second) where a database table or Redis Streams would do
- You need strict global ordering across all messages
- The team cannot operate a distributed system and no managed Kafka is available

## Real-world

Kafka is the durable spine in the [Chat System](/architecture/chat-system), where
every sent message becomes an event for persistence, notification and analytics
consumers. In [E-commerce](/architecture/e-commerce) order events fan out to billing,
inventory and search indexing; the [Notification System](/architecture/notification-system)
consumes them to decide what to push. Whenever a [Microservices](/architecture/microservices)
diagram shows a horizontal bus, it is usually this.
