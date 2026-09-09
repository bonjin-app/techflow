---
id: acid
name: ACID
tagline: Atomicity, Consistency, Isolation, Durability — what a transaction promises
category: data
tags: [Data, Consistency, Fundamentals]
difficulty: 3
prerequisites: [database, transaction]
learningPath:
  - database
  - sql
  - transaction
  - acid
  - cap-theorem
  - eventual-consistency
related:
  - { to: transaction, rel: REQUIRES }
  - { to: postgresql, rel: RELATED_TO }
  - { to: mongodb, rel: RELATED_TO }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: race-condition, rel: RELATED_TO }
  - { to: deadlock, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

ACID names the four guarantees a [Transaction](/concept/transaction) gives:
**Atomicity** (all or nothing), **Consistency** (constraints always hold),
**Isolation** (concurrent transactions do not see each other's half-done work) and
**Durability** (a committed change survives a crash). Relational databases such as
[PostgreSQL](/technology/postgresql) provide all four inside a single node. The
moment data is spread across nodes or services, some of these become expensive or
impossible, which is where [CAP Theorem](/concept/cap-theorem) and
[Eventual Consistency](/concept/eventual-consistency) enter.

## Why it matters

ACID is the reason application code can be simple. You write "subtract here, add
there, commit" and do not handle the crash between the two statements, the other
request touching the same row, or the disk losing the write. Each letter maps to a
class of bug that returns the moment you leave a single ACID database: partial
updates (A), violated invariants (C), lost updates and phantom reads (I), and
acknowledged-but-lost writes (D). Knowing exactly what you are given makes it clear
what you must rebuild yourself in caches, queues and distributed systems.

## Visual

```steps
title: The four guarantees and their mechanisms
Atomicity | undo via WAL / rollback — a failed transaction leaves no trace
Consistency | constraints, foreign keys, triggers checked before COMMIT
Isolation | locks + MVCC snapshots decide what concurrent sessions may see
Durability | WAL fsync before COMMIT returns; replication for machine loss
```

```timeline
title: Isolation prevents this lost update
Transaction A                       | Transaction B
BEGIN                               |
SELECT qty FROM stock → 1           |
                                    | BEGIN
                                    | SELECT qty FROM stock → 1
UPDATE stock SET qty = 0            |
                                    | UPDATE stock … (blocks on A's row lock)
COMMIT                              |
                                    | re-check WHERE qty > 0 → 0 rows ✔ (with a guard)
                                    | or overwrite to 0 again ❌ (naive read-then-write)
```

## How it works

**Atomicity** is implemented with the write-ahead log. Every change is logged before
it is applied; `ROLLBACK` or crash recovery uses the log to undo uncommitted changes
and redo committed ones. From the outside a transaction either happened entirely or
never started.

**Consistency** in ACID means the database moves from one valid state to another as
defined by its constraints — `NOT NULL`, `UNIQUE`, `FOREIGN KEY`, `CHECK`. It does
*not* mean "the application's business rules are correct"; a transaction that
transfers money to the wrong account is perfectly consistent. Declare every invariant
you can as a constraint so the database enforces it under concurrency.

**Isolation** is the negotiable letter. Full serializability is expensive, so
databases offer levels that permit specific anomalies:

- *Dirty read* — seeing uncommitted data. Prevented by every level PostgreSQL offers.
- *Non-repeatable read* — the same row changes between two reads in one transaction.
  Allowed under Read Committed.
- *Phantom read* — a repeated query returns new rows. Allowed under Read Committed.
- *Lost update / write skew* — two transactions read, then both write based on stale
  reads. Prevented only by explicit locks, `qty > 0`-style guards, or Serializable.

The mechanisms are row locks (writers block writers) and MVCC snapshots (readers
never block). See [Race Condition](/concept/race-condition) for what happens when
isolation is assumed but not actually configured.

**Durability** means `COMMIT` does not return until the WAL record is on stable
storage. Checkpoints later write the actual data pages. Machine-level durability
(disk dies) requires [Replication](/concept/replication); synchronous replication
extends the durability promise to a second machine at the cost of write latency.

## Deep Dive

**ACID is per database.** Two [Microservices](/architecture/microservices) with two
databases have no shared atomicity or isolation. Cross-service workflows use
[Saga](/pattern/saga) (compensating transactions) and [Outbox](/pattern/outbox)
(atomic write + event), and accept that intermediate states are visible. This is the
practical meaning of BASE — basically available, soft state, eventually consistent.

**Isolation level is a performance dial.** Read Committed handles most web workloads;
Serializable removes whole classes of bugs but aborts transactions under contention,
so every transaction needs a retry loop. Choose per transaction, not per database,
where the engine allows.

**Durability has a price.** An fsync per commit caps write throughput at what the
storage can sync per second. Group commit amortises this; asynchronous commit trades
the last few hundred milliseconds of writes for speed. Cloud disks and
[Kubernetes](/technology/kubernetes) volumes can also lie about fsync — durability is
only as good as the storage under the database.

**Document databases.** [MongoDB](/technology/mongodb) has offered multi-document
transactions since 4.0, but single-document atomicity remains the fast path and the
modelling advice ("embed what changes together") follows from that. See
[PostgreSQL vs MongoDB](/compare/postgresql-vs-mongodb).

**Common misreadings.**

- Believing the default isolation level prevents lost updates — it usually does not.
- Treating a cache as if it were part of the transaction — [Cache](/concept/cache)
  writes are not rolled back.
- Assuming a replica read reflects a just-committed write — with asynchronous
  replication it may not.

**Deadlocks** are a side effect of isolation via locks: two transactions waiting on
each other's rows. The database aborts one; see [Deadlock](/concept/deadlock).
