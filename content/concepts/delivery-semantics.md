---
id: delivery-semantics
name: Delivery Semantics
tagline: At most once, at least once, exactly once — and why only two of the three are real
category: distributed
tags: [Distributed System, Messaging, Reliability, Idempotency]
difficulty: 3
prerequisites: [message-queue, distributed-system, idempotency]
learningPath:
  - message-queue
  - distributed-system
  - delivery-semantics
  - idempotency
  - outbox
  - dead-letter-queue
related:
  - { to: idempotency, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: rabbitmq, rel: RELATED_TO }
  - { to: outbox, rel: SOLVES }
  - { to: dead-letter-queue, rel: RELATED_TO }
  - { to: distributed-system, rel: REQUIRES }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

Between any two processes there are three things a message can promise. **At most once**:
send and forget, so a lost message is lost. **At least once**: retry until acknowledged, so
a message can arrive twice. **Exactly once** is what everyone wants and nobody delivers as
an end-to-end network property — the sender cannot tell a lost message from a lost
acknowledgement, so it must either give up or retry, and those are the first two options.
What is sold as exactly-once is at-least-once delivery plus deduplication at the receiver,
or a transaction that spans the read and the write inside one system. Both are real and
useful; neither is magic, and both need you to do something.

## Why it matters

Almost every messaging bug is a team that assumed one semantic and got another.

A payment worker processes the same `order.placed` event twice after a broker rebalance and
the customer is charged twice. An email service sends a welcome message three times because
the consumer crashed after sending and before acknowledging. A metrics pipeline undercounts
because someone chose at-most-once for throughput and never told the dashboard's readers. A
team enables their broker's "exactly once" setting, assumes the problem is solved, and
discovers it only covers the path inside the broker — the moment their consumer calls a
payment API, the guarantee stops.

The useful framing is that **the guarantee ends where the system ends**. Two hops means two
guarantees, and the weakest one wins. Nothing your broker does can make a third-party HTTP
call happen exactly once.

## Visual

```sequence
title: The ambiguity that makes exactly-once impossible on the wire
participants: Producer, Network, Broker [kafka], Consumer, API [rest]
Producer -> Broker: publish order.placed
Broker -> Broker: written to the log
Broker --> Network: ack
Network --> Producer: ack lost in transit
Producer -> Producer: no ack — was it written, or not?
Producer -> Broker: publish again (at least once) → duplicate in the log
Broker -> Consumer: deliver
Consumer -> API: POST /charge
API --> Consumer: 200, then the consumer crashes before committing its offset
Broker -> Consumer: redeliver after restart → the same charge, a second time
```

## Solutions

**Choose at-least-once and make the receiver idempotent.** This is the default that works.
The producer retries until acknowledged; the consumer commits its offset only after the work
is durably done; the work itself is safe to repeat because it is keyed. That key is the whole
mechanism — see [Idempotency](/concept/idempotency). Without it, at-least-once is just
duplicates.

**Deduplicate on a business key, not on a delivery id.** A broker's message id changes when
the producer retries, so it identifies the delivery, not the event. Key on something the
event is about — an order id plus an event type, a payment intent, a client-generated
request id — and store the keys you have processed with a retention window longer than your
worst retry.

**Commit in the right order.** Do the work, then acknowledge. Acknowledge first and a crash
loses the message (at-most-once by accident). This ordering is why "at-least-once" is the
natural consequence of doing the safe thing.

**Make the write and the publish one transaction.** The common data-loss path is a service
that commits to its database and then fails to publish, or publishes and then fails to
commit. The [Outbox](/pattern/outbox) pattern writes the event into the same transaction as
the state change and relays it afterwards, which turns two unreliable steps into one.

**Use transactional messaging where it genuinely applies.** [Kafka](/technology/kafka)'s
idempotent producer removes duplicates caused by producer retries, and its transactions make
a consume-transform-produce loop atomic *within Kafka*. That is a real and valuable
guarantee for stream processing. It does not extend to a database write or an HTTP call
unless you add idempotency there too.

**Pick at-most-once deliberately, if ever.** High-volume telemetry where a dropped sample is
invisible and a duplicate would distort a rate is the honest case. Say so in writing, because
the next person will assume otherwise.

**Give up eventually, somewhere visible.** At-least-once with unlimited retries turns a
poison message into an infinite loop. Cap attempts and route the failure to a
[dead letter queue](/pattern/dead-letter-queue) that a human actually reads.

## Deep Dive

**Why exactly-once is not available on the network.** This is the Two Generals problem in
working clothes: the sender cannot distinguish "the message never arrived" from "the message
arrived and the acknowledgement was lost". Any protocol that resolves the ambiguity must
either accept loss or accept duplication. Adding a third acknowledgement moves the ambiguity
rather than removing it. So the only place "exactly once" can be manufactured is at a point
where one party can *remember* what it already did — which is deduplication, which is
at-least-once plus state.

**Effectively-once is the honest name.** At-least-once delivery, plus a receiver that
recognises repeats, produces exactly-once *effects* — which is what anyone actually wanted.
Saying it that way keeps the mechanism visible: somebody is storing keys, that store has a
retention window, and outside the window a duplicate gets through.

**Ordering is a separate guarantee, and people conflate them.** A queue may deliver each
message at least once and still reorder them. Kafka guarantees order within a partition
only, so a key that must be processed in order has to land in one partition — which is why
partitioning by entity id matters more than it first appears. Retries break order too: a
failed message sent to a retry topic arrives after messages that came later. If your handler
depends on order, say so and design for it.

**Duplicates arrive in bursts, not one at a time.** A consumer rebalance, a broker failover
or a redeployment can redeliver everything since the last committed offset — thousands of
messages, not one. Deduplication that does a database round trip per message will fall over
exactly when it is needed. A bounded in-memory cache in front of a durable key store handles
the burst.

**The guarantee ends at your process boundary.** A consumer that reads with exactly-once
semantics inside Kafka and then calls a payment provider has at-least-once semantics against
that provider. The fix is the same one the provider will suggest: an idempotency key on the
call. Draw the boundary on the diagram and label which hop carries which guarantee — most
arguments about this are two people describing different hops.

**Idempotency has a shelf life.** Deduplication state is not free: keys per event, for a
retention period, replicated. A window of hours is cheap and covers retries; a window of
months is a database. Choose it from your actual retry and replay behaviour — and remember
that a deliberate replay of last week's topic is a duplicate storm outside every window you
chose.
