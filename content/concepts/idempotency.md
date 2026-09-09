---
id: idempotency
name: Idempotency
tagline: Doing the same operation twice has the same effect as doing it once
category: fundamentals
tags: [Reliability, API Design, Fundamentals]
difficulty: 3
prerequisites: [http, backend, database, rest]
learningPath:
  - http
  - rest
  - backend
  - idempotency
  - retry
  - message-queue
related:
  - { to: http, rel: REQUIRES }
  - { to: rest, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: race-condition, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: outbox, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

An operation is idempotent when applying it once or many times leaves the system in
the same state. `SET x = 5` is idempotent; `x = x + 1` is not. In networked systems
idempotency is what makes **retries safe**: a client that never received a response
can simply send the request again without fear of charging a card twice or creating
two orders. It is usually achieved by giving each logical operation a unique key and
remembering the outcome.

## Why it matters

Networks fail in an ambiguous way. When a request times out, the client cannot know
whether the server never saw it, processed it and lost the reply, or is still
working. The only robust client behaviour is to [Retry](/pattern/retry) — and a
retry of a non-idempotent operation is a duplicate side effect.

The same ambiguity appears everywhere a message crosses a boundary: a
[Message Queue](/concept/message-queue) that guarantees at-least-once delivery will
occasionally deliver twice; a webhook provider re-sends when your endpoint is slow;
a user double-clicks "Pay". Without idempotency, every one of these becomes a
[Race Condition](/concept/race-condition) between the original and the duplicate.

## Visual

```sequence
title: Retried payment with an idempotency key
participants: Client, API [backend], Redis [redis], DB [postgresql]
Client -> API: POST /payments  Idempotency-Key: 7f3a…  amount 50
API -> Redis: SET idem:7f3a… "processing" NX EX 86400
Redis --> API: OK (first time)
API -> DB: INSERT payment (50)
DB --> API: id 9001
API -> Redis: SET idem:7f3a… {201, id 9001}
API --> Client: (response lost — timeout)
Client -> API: POST /payments  Idempotency-Key: 7f3a…  amount 50  (retry)
API -> Redis: SET idem:7f3a… "processing" NX
Redis --> API: nil (key exists)
API -> Redis: GET idem:7f3a…
Redis --> API: {201, id 9001}
API --> Client: 201 Created  id 9001  (same result, no second charge)
```

## How it works

**Naturally idempotent operations.** Some operations need no extra machinery:

- HTTP `GET`, `HEAD`, `PUT` and `DELETE` are defined as idempotent in
  [HTTP](/concept/http); `POST` is not. A well-designed [REST](/concept/rest) API
  uses `PUT /orders/{id}` with a client-generated id where possible.
- Absolute writes (`status = 'shipped'`) rather than relative ones (`count += 1`).
- Upserts keyed by a natural identifier (`INSERT … ON CONFLICT DO UPDATE`).

**Idempotency keys.** For operations that are inherently non-idempotent (create an
order, charge a card, send an email), the client generates a unique key per logical
attempt and sends it with every retry. The server:

1. Atomically reserves the key (`SET NX` in Redis, or an `INSERT` into a table with
   a `UNIQUE` constraint). If the reservation fails, the key was seen before.
2. Performs the operation once.
3. Stores the response under the key.
4. On a duplicate, returns the stored response instead of re-executing.

Storing the *response* (not just a "done" flag) matters: the retrying client needs
the same status code and body it would have received the first time.

**Deduplication in consumers.** Queue consumers apply the same idea with the message
id: keep a table of processed ids and skip repeats. With the
[Outbox](/pattern/outbox) pattern, the outbox row id doubles as the dedup key.

**Scoping.** Keys are scoped per client (per API key or user) so two tenants cannot
collide, and they expire after a window — typically 24 hours — because a retry from
last week is not a retry, it is a new request.

## Deep Dive

**Reserve-then-execute, not execute-then-record.** If you perform the operation and
record the key afterwards, a crash between the two steps leaves the operation done
and the key unrecorded — the retry executes again. Reserving the key first in the
*same* [Transaction](/concept/transaction) as the side effect, or before it with a
"processing" state, closes that gap.

**In-flight duplicates.** A retry can arrive while the first attempt is still
running (the sequence above's `"processing"` state). Return `409 Conflict` or wait
briefly and poll; do not start a second execution. A short TTL on the processing
marker lets the system recover if the first attempt crashed.

**Same key, different payload.** If a client reuses a key with different parameters,
reject with `422` rather than silently returning the old result. Storing a hash of
the request body alongside the key catches this.

**External side effects.** Charging a card through a payment provider is itself a
network call that can time out. Pass *your* idempotency key downstream so the
provider deduplicates too; most payment APIs support this. Without it, your server
can be idempotent while still double-charging.

**Storage choice.** [Redis](/technology/redis) is fast and has native TTLs, but if it
loses data (restart without persistence, failover) a duplicate can slip through. For
money-moving operations put the key table in the primary database
([PostgreSQL](/technology/postgresql)), inside the business transaction, and accept
the extra write.

**Idempotent is not the same as safe or pure.** `DELETE /users/1` is idempotent (the
second call changes nothing) but is certainly not side-effect free. Idempotency is
about repeated application, not about having no effect.

**Where it shows up.** Checkout and payment in [E-commerce](/architecture/e-commerce),
push delivery in a [Notification System](/architecture/notification-system), and any
service consuming from [Kafka](/technology/kafka) or [RabbitMQ](/technology/rabbitmq)
with at-least-once semantics.

## Related

- [Retry](/pattern/retry) — the reason you need it
- [Race Condition](/concept/race-condition) — what duplicates cause without it
- [Outbox](/pattern/outbox) — reliable publishing that pairs with consumer dedup
