---
id: race-condition
name: Race Condition
tagline: Two operations interleave in an order nobody designed for, and the result is wrong
category: fundamentals
tags: [Concurrency, Fundamentals, Correctness]
difficulty: 3
prerequisites: [programming-fundamentals, backend, database]
learningPath:
  - programming-fundamentals
  - backend
  - database
  - transaction
  - race-condition
  - distributed-lock
  - deadlock
related:
  - { to: programming-fundamentals, rel: REQUIRES }
  - { to: transaction, rel: RELATED_TO }
  - { to: acid, rel: RELATED_TO }
  - { to: distributed-lock, rel: RELATED_TO }
  - { to: deadlock, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A race condition occurs when the correctness of a program depends on the relative
timing of two or more concurrent operations that share state. Each operation is
correct on its own; interleaved, they produce a result no sequential execution
could — a lost update, a double booking, a negative stock count. Races are hard
because they are intermittent: the code works in tests and fails under load.

## Why it matters

Every web backend is concurrent. Two users press "buy" on the last item at the same
moment; two API instances process the same webhook; a retry arrives while the
original request is still running. Any read-modify-write sequence on shared state —
a database row, a [Redis](/technology/redis) key, a file, an in-process map — is a
candidate for a race unless something makes it atomic.

Races cost real money (overselling in [E-commerce](/architecture/e-commerce),
double-charging a card) and real trust (two people assigned the same seat). They
also do not reveal themselves in logs: each step logged its own correct action.

## Visual

```timeline
title: Lost update on stock
Thread A                     | Thread B
read stock = 1               |
                             | read stock = 1
check 1 > 0 → ok             |
                             | check 1 > 0 → ok
write stock = 0              |
                             | write stock = 0 ❌ (two orders, one item)
```

Both threads saw a consistent snapshot; neither saw the other. The check and the
write were not one atomic step.

## Solutions

The fix is always the same in spirit: make the check and the update a single
indivisible step, or detect that someone else got there first.

- **Atomic operations** — let the store do the read-modify-write in one command.
  `UPDATE stock SET qty = qty - 1 WHERE id = 42 AND qty > 0` either affects one row
  or none. In Redis, `INCR`, `DECR`, `SET NX` and Lua scripts are atomic because
  commands execute on a single thread.
- **Pessimistic locking** — take a lock before reading, release after writing. Inside
  a [Transaction](/concept/transaction) this is `SELECT … FOR UPDATE`; other
  transactions block until the first commits. Simple to reason about, but holds
  resources and can lead to [Deadlock](/concept/deadlock).
- **Optimistic locking** — read a version number with the row, write with
  `WHERE version = :seen`. If zero rows are affected, someone else won; the loser
  reloads and retries. No locks held between requests; best when conflicts are rare.
- **Transaction isolation** — [ACID](/concept/acid) isolation levels such as
  `REPEATABLE READ` or `SERIALIZABLE` make the database detect the conflict and abort
  one transaction. [PostgreSQL](/technology/postgresql)'s serializable mode catches
  patterns that row locks miss, at the cost of retry logic in the application.
- **Distributed lock** — when the shared state lives outside one database (a file,
  an external API, a cron job that must run once), a
  [Distributed Lock](/concept/distributed-lock) serialises the critical section
  across processes.
- **Unique constraints** — a database `UNIQUE` index turns "insert if not exists"
  into an atomic operation. Two concurrent inserts of the same key cannot both succeed.
- **Idempotency** — when the race is between an original request and its retry,
  [Idempotency](/concept/idempotency) keys make the duplicate harmless.
- **Single writer** — route all updates for a given key to one consumer, e.g. a
  [Message Queue](/concept/message-queue) partitioned by key. No shared state, no race.

## Deep Dive

**Check-then-act is the classic shape.** "If the username is free, create it." "If
balance ≥ amount, withdraw." Between the check and the act, the world can change.
Any time you see a conditional that reads state and then writes based on it, ask
what happens if two of them run at once.

**Time-of-check to time-of-use (TOCTOU)** is the same bug in file systems and
security: checking a permission, then acting on a path that has since been swapped.

**Isolation levels are not magic.** `READ COMMITTED` — the default in PostgreSQL —
still allows the lost update above: both transactions read 1, both update. You need
row locks, optimistic version checks or a stricter isolation level. Under
`SERIALIZABLE`, one side receives a serialization failure and *must* retry; forgetting
the retry turns a correctness fix into a user-facing error.

**Optimistic vs pessimistic.** Pessimistic locking wins when contention is high (many
writers on the same row) because retries would mostly fail. Optimistic wins when
contention is low and the lock would otherwise be held across a network call or
user think-time.

**Caches add races.** A [Cache Aside](/pattern/cache-aside) read racing a delete can
leave stale data behind — see [Cache Invalidation](/concept/cache-invalidation).
The same interleaving reasoning applies.

**Distributed races are worse.** Two data centres with asynchronous
[Replication](/concept/replication) can both accept a conflicting write and only
discover it later. Resolution then becomes a data-modelling problem (last-writer-wins,
merge functions) rather than a locking one — see
[Eventual Consistency](/concept/eventual-consistency).

**Testing.** Races rarely appear in unit tests. Use concurrency tests that fire N
requests at once and assert on invariants (stock never negative, one row per key),
plus database constraints as the last line of defence. A constraint violation in
production is a bug report; a silently wrong balance is an incident.

## Related

- [Deadlock](/concept/deadlock) — what pessimistic locks can turn into
- [Distributed Lock](/concept/distributed-lock) — serialising across processes
- [Transaction](/concept/transaction) and [ACID](/concept/acid) — the database's tools
- [Idempotency](/concept/idempotency) — taming the retry race
