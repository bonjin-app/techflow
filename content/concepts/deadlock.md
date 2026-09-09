---
id: deadlock
name: Deadlock
tagline: Two or more holders each wait for a lock the other holds, so none can ever proceed
category: fundamentals
tags: [Concurrency, Fundamentals, Correctness]
difficulty: 4
prerequisites: [programming-fundamentals, race-condition, transaction]
learningPath:
  - programming-fundamentals
  - race-condition
  - transaction
  - acid
  - deadlock
  - distributed-lock
related:
  - { to: race-condition, rel: REQUIRES }
  - { to: transaction, rel: RELATED_TO }
  - { to: acid, rel: RELATED_TO }
  - { to: distributed-lock, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A deadlock is a cycle of waiting: A holds lock 1 and wants lock 2; B holds lock 2 and
wants lock 1. Neither can release what it holds until it gets what it wants, so both
wait forever. It happens in threads sharing a mutex, in database
[Transactions](/concept/transaction) locking rows, and between services holding
[Distributed Locks](/concept/distributed-lock). Databases detect the cycle and abort one
participant; in application code you usually have to prevent it by design.

## Why it matters

Locks are the standard cure for a [Race Condition](/concept/race-condition), and every
lock introduces the possibility of deadlock. In a database, a deadlock surfaces as a
transaction that fails with an error under load but never in tests, because it needs two
specific requests to interleave. In application code it looks worse: a thread pool that
quietly fills with stuck workers until the service stops responding, with no error at
all. An [E-commerce](/architecture/e-commerce) checkout that updates inventory, order
and account rows in varying orders is the textbook production case.

## Visual

```timeline
title: Two transactions lock the same rows in opposite order
Transaction A                       | Transaction B
BEGIN                               |
UPDATE accounts SET … WHERE id=1    |
  (holds row-lock on 1)             |
                                    | BEGIN
                                    | UPDATE accounts SET … WHERE id=2
                                    |   (holds row-lock on 2)
UPDATE accounts SET … WHERE id=2    |
  waits for B's lock on 2 …         |
                                    | UPDATE accounts SET … WHERE id=1
                                    |   waits for A's lock on 1 … ❌ cycle
DB detects cycle, aborts one        |
ERROR: deadlock detected → ROLLBACK |
                                    | proceeds, COMMIT
```

## Solutions

**Lock in a consistent order.** The cycle in the timeline exists only because A goes
1→2 and B goes 2→1. If every code path acquires resources in a fixed global order — by
primary key, by table name, by an agreed hierarchy — a cycle cannot form. For a transfer
between two accounts, always lock the lower id first regardless of direction.

**Lock everything up front.** `SELECT … FOR UPDATE` on all rows a transaction will
modify, in one statement with `ORDER BY id`, acquires them in order and before any work
is done. Nothing is acquired incrementally, so there is no window to interleave.

**Hold locks briefly.** Do external calls, computation and validation *before* the
transaction starts; keep the locked region to the writes. Shorter holds shrink the
probability of two transactions overlapping.

**Use timeouts.** Every wait for a lock should be bounded (`lock_timeout` in
[PostgreSQL](/technology/postgresql), `tryLock(timeout)` in code, `PX` on a
[Distributed Lock](/concept/distributed-lock)). A timeout converts a hang into an error
you can handle.

**Retry on deadlock errors.** Databases abort one victim with a specific error code
(`40P01` in PostgreSQL, `1213` in MySQL). Treat it like a transient failure: roll back,
wait with jitter, and rerun the whole transaction from the beginning. This requires the
transaction to be [idempotent](/concept/idempotency) or fully re-executable — see
[Retry](/pattern/retry).

**Reduce locking.** Optimistic concurrency (`UPDATE … WHERE version = 3`, check row
count) takes no lock while a user thinks, only a short one during the write. Atomic
single-statement updates (`UPDATE stock SET qty = qty - 1 WHERE qty > 0`) need no
explicit locking at all.

## Deep Dive

**The four conditions.** Deadlock requires all of: mutual exclusion (a resource has one
holder), hold-and-wait (holding one while requesting another), no preemption (locks
cannot be taken away), and circular wait. Breaking any one prevents it. Ordering breaks
circular wait; acquire-all-up-front breaks hold-and-wait; timeouts and database victim
selection add preemption.

**How databases detect it.** Lock managers keep a waits-for graph; a periodic check (or
a check on every blocked wait, after `deadlock_timeout`) looks for cycles and aborts the
transaction judged cheapest to roll back. Detection is fast but not free — the victim
loses its work and the application sees an error. Prevention in the application is still
worth doing; detection is the safety net.

**Lock escalation and hidden locks.** Foreign keys take share locks on parent rows,
unique indexes lock during inserts, and some engines escalate many row locks into a
table lock. Deadlocks often involve locks nobody wrote explicitly. Reading the engine's
lock-wait report (`pg_locks`, `SHOW ENGINE INNODB STATUS`) shows the actual participants.

**Application-level deadlocks have no detector.** A thread waiting on a mutex, a
connection-pool slot, or a synchronous HTTP call to a service that is itself waiting on
this one will wait indefinitely. Common shapes: two services calling each other
synchronously with small thread pools; holding a database connection while waiting for
another from the same exhausted pool; a callback taking a lock already held by its
caller (self-deadlock with non-reentrant locks). Timeouts and pool sizing are the only
defence; thread dumps are how you diagnose them.

**Distributed deadlocks.** Locks held across services or across shards form cycles
invisible to any single lock manager. Expiry on each lock eventually breaks the cycle,
but only after the [TTL](/concept/ttl) — meaning a stall of that duration. Prefer a
single coordinator or a [Saga](/pattern/saga) with compensations over holding locks
across network boundaries.

**Livelock and starvation** are the neighbours: participants keep retrying and yielding
without progress, or one participant never wins. Randomised backoff addresses the first;
fair queuing addresses the second. A retry loop for deadlock victims without jitter can
turn a rare deadlock into a livelock under load.

**Observability.** Count deadlock errors per endpoint, log both participants' statements
(PostgreSQL's `log_lock_waits` includes them), and treat any recurring pair as a
lock-ordering bug rather than bad luck — it will get worse as traffic grows.
