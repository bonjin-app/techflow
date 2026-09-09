---
id: database
name: Database
tagline: Durable, queryable storage that survives restarts and serves many clients
category: data
tags: [Data, Fundamentals, Storage]
difficulty: 1
prerequisites: [programming-fundamentals, backend]
learningPath:
  - programming-fundamentals
  - backend
  - database
  - sql
  - transaction
  - acid
  - replication
  - sharding
related:
  - { to: sql, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: acid, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: mongodb, rel: RELATED_TO }
  - { to: replication, rel: RELATED_TO }
  - { to: sharding, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A database is a program whose whole job is to store data safely on disk, let many
clients read and write it concurrently, and answer questions about it quickly. It
gives the [Backend](/concept/backend) three things application code cannot easily
build itself: **durability** (a committed write survives a crash), **concurrency
control** (simultaneous writers do not corrupt each other) and **indexes** (finding
one row in a billion without scanning them all). Relational databases such as
[PostgreSQL](/technology/postgresql) speak [SQL](/concept/sql); document stores such
as [MongoDB](/technology/mongodb) trade some guarantees for a more flexible model.

## Why it matters

The database is the system of record: when caches are cold, queues are empty and
servers have been replaced, what is in the database *is* the state of the business.
It is also usually the slowest, hardest-to-scale component, because it must
coordinate writes on shared disk while everything else can be copied freely. Most
scaling techniques — [Cache](/concept/cache), read [Replication](/concept/replication),
[Sharding](/concept/sharding), queues — exist to keep load off the database or to
spread it. Understanding what a database actually does on a write explains why those
techniques are needed.

```steps
title: What a database gives you
Storage engine | pages on disk, organised for fast lookup
Write-ahead log | every change is logged before it is applied
Buffer pool | hot pages kept in memory
Indexes | B-tree (range, equality), hash, full-text
Query planner | turns a declarative query into an execution plan
Transactions [transaction] | ACID guarantees across multiple statements
Replication [replication] | copies for failover and read scaling
```

## Visual

```sequence
title: What happens on one committed write
participants: App [backend], Executor, WAL, Buffer pool, Disk
App -> Executor: UPDATE accounts SET balance = balance - 50 WHERE id = 1
Executor -> Buffer pool: find page for row id=1 (load from disk on miss)
Executor -> WAL: append record "page 17: balance 100 → 50"
WAL -> Disk: fsync (durable)
Disk --> WAL: ok
Executor -> Buffer pool: modify page in memory (now dirty)
Executor --> App: COMMIT ok
Buffer pool -> Disk: checkpoint — write dirty pages later, in bulk
```

## How it works

**Storage.** Data lives in fixed-size pages (commonly 8 KB) on disk. Rows are packed
into pages; a table is a file of pages. Reading a row means reading its page, so
locality — which rows share a page — affects performance.

**Indexes.** A B-tree index is a sorted structure that maps a column value to the
page holding the row. Lookups and range scans become `O(log N)` page reads instead
of a full scan. Every index speeds up reads on its columns and slows down every
write, because the index must be maintained too. "Add an index" is the single most
common performance fix; "too many indexes" is the most common write-path problem.

**Write-ahead log (WAL).** Before a page is changed, the change is appended to a
sequential log and flushed to disk. Sequential appends are cheap; random page writes
are expensive and can be deferred. After a crash the database replays the log to
rebuild pages that were modified but not yet written. This is how a database offers
durability without fsyncing every page on every write — see [ACID](/concept/acid).

**Buffer pool.** Recently used pages are kept in RAM. A working set that fits in the
buffer pool is served at memory speed; one that does not causes disk reads on every
query. Sizing the buffer pool and keeping the hot set small is most of "database
tuning".

**Query execution.** A declarative query is parsed, planned (which index, which join
order) and executed. The planner relies on statistics about data distribution; stale
statistics produce bad plans, which appear as sudden slowness with no code change.

**Concurrency.** Multiple sessions run at once. Locks and multi-version concurrency
control (MVCC) let readers proceed without blocking writers while
[Transactions](/concept/transaction) keep each session's view consistent.

## Deep Dive

**Relational vs document.** Relational databases normalise data into tables joined
at query time, enforce schemas and constraints, and provide strong transactions.
Document databases store nested JSON-like documents, favour denormalised
read-optimised shapes and scale horizontally more readily. Neither is "better";
see [PostgreSQL vs MongoDB](/compare/postgresql-vs-mongodb) for when each fits.

**Scaling reads and writes.** Reads scale with replicas; each replica lags the
primary slightly, so read-your-own-write anomalies appear
([Eventual Consistency](/concept/eventual-consistency)). Writes scale only by
sharding — splitting rows across independent databases — which gives up cross-shard
transactions and joins. Both are large steps; a cache and better queries go
surprisingly far before they are needed.

**Failure modes.**

- *Connection exhaustion* — every application instance opens a pool; ten instances ×
  50 connections overwhelm a database that handles 200. Use a pooler and small pools.
- *Lock contention* — long transactions holding row locks stall others and can
  produce a [Deadlock](/concept/deadlock).
- *Replication lag* — a user writes on the primary and reads a stale replica.
- *Unbounded growth* — tables without retention grow until backups, vacuum and
  index rebuilds no longer fit in the maintenance window.

**Backups are not optional.** Replication protects against hardware failure, not
against `DELETE` without a `WHERE`. Point-in-time recovery from WAL archives is the
standard answer; test the restore, not the backup.
