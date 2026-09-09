---
id: message-queue
name: Message Queue
tagline: Buffer work between producers and consumers so they run at their own pace
category: messaging
tags: [Messaging, Asynchronous, Decoupling]
difficulty: 3
prerequisites: [backend, distributed-system]
learningPath:
  - backend
  - distributed-system
  - message-queue
  - idempotency
  - rabbitmq
  - kafka
  - dead-letter-queue
related:
  - { to: rabbitmq, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: pub-sub, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: dead-letter-queue, rel: RELATED_TO }
  - { to: outbox, rel: RELATED_TO }
  - { to: distributed-system, rel: REQUIRES }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A message queue is a durable buffer: producers append messages, consumers take them off
and acknowledge when done. The producer gets an immediate "accepted" and moves on; the
work happens later, on another process, possibly on another machine. Each message is
handled by **one** consumer from a group, which makes queues the standard tool for
background jobs — unlike [Pub/Sub](/concept/pub-sub), where every subscriber receives
every message.

## Why it matters

Synchronous request handling ties response time to the slowest step. Sending a
confirmation email, resizing an image, or calling a partner API does not need to finish
before the user sees "order placed". Queuing that work cuts latency, absorbs traffic
spikes (the queue grows instead of the servers falling over), and lets consumers be
scaled and restarted independently of producers. A
[Notification System](/architecture/notification-system) is essentially a set of queues
between event sources and delivery workers.

## Visual

```sequence
title: Producer, queue and competing consumers
participants: API [backend], Queue [rabbitmq], Worker 1, Worker 2
API -> Queue: enqueue resize(image 17)
Queue --> API: accepted
API -> Queue: enqueue resize(image 18)
Queue --> API: accepted
Queue -> Worker 1: deliver resize(17)
Queue -> Worker 2: deliver resize(18)
Worker 1 --> Queue: ACK 17
Worker 2 --> Worker 2: crashes before ACK ❌
Queue -> Worker 1: redeliver resize(18) after visibility timeout
Worker 1 --> Queue: ACK 18
```

## How it works

1. **Enqueue.** The producer serialises a message (usually JSON or a binary schema) and
   writes it to a named queue on the broker — [RabbitMQ](/technology/rabbitmq), a cloud
   queue service, [Kafka](/technology/kafka) used as a work queue, or
   [Redis](/technology/redis) lists and streams.
2. **Persist.** A durable queue writes the message to disk (and to replicas) before
   acknowledging the producer, so a broker restart does not lose it.
3. **Deliver.** The broker hands each message to one available consumer. Several
   consumers on the same queue are *competing consumers*: adding workers increases
   throughput.
4. **Acknowledge.** The consumer processes the message and sends an ACK; the broker then
   deletes it. If the consumer dies first, the message becomes visible again and is
   redelivered — this is where at-least-once delivery comes from.
5. **Handle failure.** After N failed attempts the broker moves the message to a
   [Dead Letter Queue](/pattern/dead-letter-queue) for inspection rather than retrying
   forever.

**Queue vs log.** A classic queue (RabbitMQ, SQS) deletes messages once acknowledged and
tracks per-message state. A log ([Kafka](/technology/kafka)) retains messages for a
period and tracks a per-consumer-group *offset*; consumers can replay history and many
independent groups can read the same stream. Logs are better for event streams and
analytics; queues are simpler for task distribution with per-message retries. See
[Kafka vs RabbitMQ](/compare/kafka-vs-rabbitmq).

## Deep Dive

**At-least-once means duplicates.** A consumer that finishes work and crashes before
acknowledging will receive the message again. Consumers must be
[idempotent](/concept/idempotency): record the message id in the same
[Transaction](/concept/transaction) as the side effect, or use natural idempotency such
as an upsert. "Exactly once" in vendor documentation refers to the broker's internal
guarantees, not to your database or your email provider.

**Ordering.** A single queue with one consumer is ordered. Add consumers and messages
are processed concurrently, so order is lost. Where order matters per entity, partition
by a key (Kafka partitions, RabbitMQ consistent-hash exchange, SQS FIFO message groups)
so all messages for one order or one user go to one consumer.

**Backpressure and lag.** Queue depth is the health metric. A growing queue means
consumers cannot keep up; consumption lag in seconds translates directly to how late
users get their email. Alert on age of the oldest message, not just count, and scale
consumers on that signal.

**Poison messages.** A malformed message that crashes every consumer will be redelivered
endlessly, blocking the queue for everyone behind it. Cap retries and dead-letter.

**Producer reliability.** Writing to the database and then enqueuing is two operations
that can be split by a crash. The [Outbox](/pattern/outbox) pattern writes the message
into a database table inside the same transaction and relays it to the queue
separately, guaranteeing that a committed change always produces its message.

**Prefetch and fairness.** Consumers usually fetch several messages at once for
throughput. A prefetch of 100 on one slow worker starves idle workers. Tune prefetch to
the work's duration — small for long tasks, larger for quick ones.

**Trade-offs.** Queues add a component to run, monitor and secure; make the flow of a
request harder to trace; and turn immediate errors into delayed ones the user never
sees. They are the wrong tool when the caller needs the result now, when work must be
strictly serial across all messages, or when the volume is so small that a database
table polled every few seconds is simpler and already durable.
