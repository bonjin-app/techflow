---
id: dead-letter-queue
name: Dead Letter Queue
tagline: Park messages that keep failing in a side queue so the main queue keeps flowing
category: messaging
tags: [Messaging, Reliability, Operations]
difficulty: 2
prerequisites: [message-queue, retry]
learningPath:
  - message-queue
  - retry
  - dead-letter-queue
  - idempotency
  - rabbitmq
related:
  - { to: message-queue, rel: SOLVES }
  - { to: retry, rel: USED_WITH }
  - { to: idempotency, rel: RELATED_TO }
  - { to: rabbitmq, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: event-driven-architecture, rel: RELATED_TO }
  - { to: notification-system, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

A consumer reads a message from a [queue](/concept/message-queue) and fails to
process it. The broker redelivers it. It fails again — the payload is malformed, it
references a record that was deleted, or it triggers a bug. Now the consumer is
stuck: the same message is retried forever, every other message behind it waits, and
the logs fill with the same error. This is a *poison message*. Dropping it silently
loses data and hides the bug; retrying forever blocks the queue. Neither is
acceptable, and someone needs to be able to look at the message later.

## Solution

Give the queue a companion **dead letter queue (DLQ)**. After a message exceeds its
retry budget — or fails in a way that is clearly not transient — the consumer (or
the broker itself) moves it to the DLQ together with metadata: the error, the
attempt count, the original queue and timestamps. The main queue continues
unblocked. The DLQ is monitored, inspected and, once the cause is fixed, its
messages are replayed into the main queue or discarded deliberately.

```sequence
title: Poison message is parked, not retried forever
participants: Broker [rabbitmq], Worker [backend], DLQ [message-queue], Operator
Broker -> Worker: deliver msg #42
Worker --> Broker: NACK (attempt 1, retry in 1s)
Broker -> Worker: redeliver msg #42
Worker --> Broker: NACK (attempt 2, retry in 4s)
Broker -> Worker: redeliver msg #42
Worker --> Broker: NACK (attempt 3 — budget exhausted)
Broker -> DLQ: move msg #42 + reason + attempts
Broker -> Worker: deliver msg #43 (queue keeps flowing)
Operator -> DLQ: inspect, fix, replay or discard
```

## How it works

```steps
title: Dead-lettering
Consumer fails to process a message
Retryable? back off and retry with a cap [retry]
Non-retryable or budget exhausted → publish to DLQ with error metadata
Acknowledge the original so it leaves the main queue
Alert when the DLQ depth is above zero for longer than a threshold
Investigate; fix data or code
Replay to the main queue (idempotent consumers make this safe) [idempotency]
```

Brokers differ in how much they do for you. [RabbitMQ](/technology/rabbitmq) can
dead-letter automatically when a message is rejected, expires or exceeds a queue
length, routing it through a configured dead-letter exchange. [Kafka](/technology/kafka)
has no built-in DLQ: the consumer writes failed records to a separate topic (often
`<topic>.DLT`) and commits the offset so the partition advances. Cloud queues
usually attach a DLQ with a "max receive count".

```ts
async function handle(msg: Message) {
  try {
    await process(msg);
    await msg.ack();
  } catch (err) {
    if (isTransient(err) && msg.attempts < 5) {
      await msg.nack({ requeue: true, delayMs: 1000 * 2 ** msg.attempts });
    } else {
      await dlq.publish({ ...msg, error: String(err), failedAt: new Date() });
      await msg.ack();               // remove from the main queue
    }
  }
}
```

A DLQ is only useful if someone looks at it. Depth and age of the oldest message are
the two alerts that matter; a replay tool (even a script) should exist before the
first incident, not during it.

## Advantages

- One bad message can no longer block a whole queue or partition
- Failed messages are preserved with context for debugging instead of being lost
- Separates "transient, retry" from "broken, needs a human" explicitly
- DLQ depth is a clear, cheap health signal for the pipeline
- Replay after a fix recovers the work without re-sending from the producer

## Disadvantages

- Messages in the DLQ are effectively unprocessed — the business effect is delayed until someone acts
- Ordering breaks: a dead-lettered message is now processed after its successors, if at all
- Without alerting and ownership the DLQ becomes a graveyard that nobody reads
- Replaying requires idempotent consumers or careful de-duplication
- Choosing what is "non-retryable" is application-specific and easy to get wrong

## When to use

- Any asynchronous consumer where a malformed or unprocessable message is possible — in practice, every queue in production
- Throughput of the main queue matters more than strict ordering
- You need an audit trail of failures for compliance or debugging
- Paired with [Retry](/pattern/retry) so only genuinely stuck messages are parked

## When not to use

- Strict per-key ordering is mandatory and skipping a message is worse than stalling — pause the partition and alert instead
- Messages are disposable (metrics, heartbeats) — dropping after N attempts is simpler
- Nobody will own the DLQ; an unmonitored DLQ is just slower data loss
- The failure is systemic (dependency down) — a [Circuit Breaker](/pattern/circuit-breaker) and pausing consumption fit better than dead-lettering everything

## Real-world

Dead letter queues sit beside almost every production queue: order-processing
pipelines, webhook delivery, and email or push workers. In the
[Notification System](/architecture/notification-system) architecture each channel
worker retries its provider a few times with backoff and then dead-letters the
notification, so a single invalid device token or bounced address never holds up
the millions of messages behind it.
