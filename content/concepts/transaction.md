---
id: transaction
name: Transaction
tagline: A group of database operations that either all take effect or none do
category: data
tags: [Data, Consistency, Concurrency]
difficulty: 3
prerequisites: [database, sql]
learningPath:
  - database
  - sql
  - transaction
  - acid
  - deadlock
  - saga
related:
  - { to: acid, rel: RELATED_TO }
  - { to: database, rel: REQUIRES }
  - { to: sql, rel: REQUIRES }
  - { to: postgresql, rel: RELATED_TO }
  - { to: race-condition, rel: SOLVES }
  - { to: deadlock, rel: RELATED_TO }
  - { to: saga, rel: RELATED_TO }
  - { to: outbox, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A transaction wraps several statements between `BEGIN` and `COMMIT` so the database
treats them as one unit: if anything fails before `COMMIT` — an error, a constraint
violation, a crash — every change is rolled back and other sessions never see a
half-finished state. Transactions are how a [Database](/concept/database) delivers
the [ACID](/concept/acid) guarantees. They are also the primary tool for stopping
concurrent requests from corrupting shared rows, and the reason moving money is easy
inside one database and hard across several.

## Why it matters

Business operations are rarely a single write. Placing an order inserts the order,
decrements stock, records a payment and empties the cart. Without a transaction a
crash between step two and three leaves stock reserved for an order that does not
exist, and a concurrent buyer can decrement the same stock row from 1 to −1. Every
[Backend](/concept/backend) that touches money, inventory or permissions relies on
transactions to make multi-step changes atomic and to serialise conflicting writers.
When you later split data across services, losing this guarantee is the single
biggest source of complexity — see [Saga](/pattern/saga).

## Visual

```sequence
title: Commit path and rollback path
participants: API [backend], DB [postgresql]
API -> DB: BEGIN
API -> DB: UPDATE accounts SET balance = balance - 50 WHERE id = 1 AND balance >= 50
DB --> API: 1 row updated (row locked)
API -> DB: UPDATE accounts SET balance = balance + 50 WHERE id = 2
DB --> API: 1 row updated
API -> DB: COMMIT
DB --> API: ok — both changes visible atomically, WAL fsynced
API -> DB: BEGIN
API -> DB: UPDATE accounts SET balance = balance - 500 WHERE id = 1 AND balance >= 500
DB --> API: 0 rows updated
API -> DB: ROLLBACK
DB --> API: ok — nothing changed, locks released
```

## How it works

**Boundaries.** `BEGIN` starts the unit; `COMMIT` makes every change durable and
visible at once; `ROLLBACK` discards them. `SAVEPOINT` allows partial rollback inside
a transaction. Most drivers use autocommit by default — each statement is its own
transaction — so multi-statement units must be opened explicitly.

**Locks.** Writing a row takes a row-level lock held until the transaction ends. A
second transaction updating the same row blocks until the first commits or rolls
back, then re-evaluates its `WHERE`. This is what turns two concurrent "buy the last
item" requests into one success and one clean failure, and it is why transactions
should be short.

**Snapshots (MVCC).** [PostgreSQL](/technology/postgresql) and most modern engines
keep multiple versions of a row. Readers see a snapshot as of their statement or
transaction start and never block on writers. Old versions are cleaned up later
(vacuum), which is why long-running transactions bloat tables.

**Isolation levels** decide which anomalies a transaction may observe:

- *Read Committed* (PostgreSQL default) — each statement sees data committed before
  it started. Non-repeatable reads are possible.
- *Repeatable Read* — the whole transaction sees one snapshot; concurrent updates to
  the same row cause a serialization error you must retry.
- *Serializable* — the outcome equals some serial order; the database aborts
  transactions that would violate that, so retries are mandatory.

Higher isolation means fewer application-level checks but more aborts under
contention.

**Idiomatic patterns.**

- Push the check into the write: `UPDATE stock SET qty = qty - 1 WHERE id = $1 AND
  qty > 0` and inspect the row count, instead of `SELECT` then `UPDATE`.
- `SELECT … FOR UPDATE` when you must read, compute in code, then write.
- Unique constraints for "only one of these may exist" — cheaper and more reliable
  than a lock.

## Deep Dive

**Transactions do not cross databases.** A transaction protects one database. Once
an order lives in one service and inventory in another, there is no `COMMIT` that
spans both. Options: two-phase commit (rare in web systems; slow and fragile), a
[Saga](/pattern/saga) of local transactions with compensating actions, or restructure
ownership so the invariant lives in one database.

**Publishing events atomically.** "Save the order, then publish to
[Kafka](/technology/kafka)" can commit and then fail to publish. The
[Outbox](/pattern/outbox) pattern writes the event into the same transaction and
relays it afterwards.

**Long transactions are the enemy.** Holding a transaction open across an HTTP call
to a payment provider holds row locks for seconds, blocks other buyers, prevents
vacuum and raises deadlock probability. Do external calls before or after the
transaction, and make the transaction itself milliseconds long.

**Deadlocks.** Transaction A locks row 1 then wants row 2; B locks row 2 then wants
row 1. The database detects the cycle and aborts one; your code must retry. Acquire
locks in a consistent order (for example by primary key) to avoid it. See
[Deadlock](/concept/deadlock).

**Retries and idempotency.** Serialization failures and deadlock aborts are normal,
not bugs — wrap the transaction in a retry loop. Because a client may also retry an
entire request after a timeout, the operation should be [idempotent](/concept/idempotency)
even though each attempt is atomic.

**Durability is a setting.** `COMMIT` returns after the WAL is fsynced by default;
some engines allow relaxing this for throughput at the cost of losing the last few
commits on power loss. Know which mode your database runs in.
