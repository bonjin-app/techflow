---
id: postgresql
name: PostgreSQL
tagline: Open-source relational database with strict ACID transactions and a rich SQL dialect
category: database
tags: [Database, SQL, Relational, ACID]
difficulty: 3
usedFor: [database, sql, transaction, acid, replication]
prerequisites: [programming-fundamentals, database, sql, transaction]
learningPath:
  - programming-fundamentals
  - database
  - sql
  - transaction
  - acid
  - postgresql
  - replication
  - sharding
related:
  - { to: mongodb, rel: ALTERNATIVE_TO }
  - { to: elasticsearch, rel: USED_WITH }
  - { to: outbox, rel: RELATED_TO }
  - { to: deadlock, rel: RELATED_TO }
  - { to: cache-aside, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
  - { to: chat-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "PostgreSQL 18.x", confidence: high }
---

## TL;DR

PostgreSQL is a relational database: data lives in tables with a declared schema, you
query it with SQL, and every write happens inside a transaction that either fully
commits or fully rolls back. It is the default "system of record" for most web
backends because it is free, mature, standards-compliant and hard to outgrow. Its
extension system (JSONB, full-text search, PostGIS, pgvector) lets one database cover
jobs that used to need three.

## Practical

In a typical service PostgreSQL holds the data you cannot afford to lose — users,
orders, payments, messages — while faster or more specialised stores sit next to it
([Redis](/technology/redis) for caching, [Elasticsearch](/technology/elasticsearch)
for search, [Kafka](/technology/kafka) for events).

What you actually do day to day:

- **Model with constraints.** Primary keys, foreign keys, `NOT NULL`, `UNIQUE` and
  `CHECK` push invariants into the database so bugs surface as errors, not corrupt
  rows. See [Database](/concept/database) and [SQL](/concept/sql).
- **Wrap multi-step writes in a transaction** so partial failures never leave
  half-finished state. See [Transaction](/concept/transaction) and [ACID](/concept/acid).
- **Index what you filter and join on**, then read `EXPLAIN (ANALYZE, BUFFERS)` to
  confirm the planner uses it.
- **Use JSONB for genuinely variable attributes** instead of one column per option,
  and index the keys you query with GIN.
- **Migrate the schema with versioned files** (Flyway, Prisma Migrate, Alembic …), and
  add columns as nullable first to avoid long table locks.
- **Put a connection pooler (PgBouncer, built-in poolers in managed services) in
  front** — every connection is a backend process and a few hundred is already a lot.

```sql
-- Reserve stock and create an order atomically
BEGIN;
UPDATE products SET stock = stock - 1
  WHERE id = 42 AND stock > 0;          -- 0 rows affected => sold out
INSERT INTO orders (user_id, product_id, status)
  VALUES (7, 42, 'pending');
COMMIT;                                  -- both happen, or neither

CREATE INDEX CONCURRENTLY orders_user_created_idx
  ON orders (user_id, created_at DESC); -- no write lock while building
```

Backups are `pg_basebackup` plus WAL archiving for point-in-time recovery; most teams
let a managed service handle that and only practice restoring.

## Deep Dive

**MVCC instead of read locks.** Every row version carries the transaction ids that
created and deleted it. Readers see a consistent snapshot without blocking writers,
and writers do not block readers. The cost is dead row versions that `VACUUM` must
reclaim; a table with heavy updates and lazy autovacuum bloats and slows down.
Long-running transactions hold back vacuum for the whole cluster.

**Write-ahead log (WAL).** Changes are appended to the WAL before touching data
pages, which is what makes commits durable and crash recovery possible. The same
stream feeds streaming replication and, decoded, logical replication and
change-data-capture tools — the usual bridge to the [Outbox](/pattern/outbox) pattern.

**Isolation levels.** The default `READ COMMITTED` allows non-repeatable reads;
`REPEATABLE READ` gives a snapshot; `SERIALIZABLE` (SSI) detects dangerous
interleavings and aborts one transaction, so your code must retry. Row locks taken
in different orders by concurrent transactions produce a [Deadlock](/concept/deadlock),
which PostgreSQL detects and resolves by killing one side.

**Indexes are plural.** B-tree is the default; GIN for JSONB, arrays and full-text;
GiST/SP-GiST for ranges and geometry; BRIN for huge append-only tables; HNSW via
pgvector for embeddings. Partial and expression indexes keep indexes small and
targeted. Since 18, multicolumn B-tree indexes support skip scans, so a missing
leading column hurts less than it used to.

**One process per connection.** Connections are expensive (memory, context
switches), so high-concurrency services need pooling. Poolers in transaction mode
break session features (prepared statements, `SET`, advisory locks) — know which
mode you run.

**Replication and scale.** Physical streaming replication gives hot standbys for
failover and read scaling; it is asynchronous by default, synchronous per commit if
you ask. Writes still go to one primary. Beyond that you partition large tables
(declarative partitioning) and, eventually, shard across databases — which the core
does not do for you. See [Replication](/concept/replication) and
[Sharding](/concept/sharding).

**Recent releases** added an asynchronous I/O subsystem (18), `uuidv7()` for
time-ordered ids, virtual generated columns, and temporal constraints
(`WITHOUT OVERLAPS`); but the model you learned ten years ago still applies.

## Why

Business operations usually touch several records at once: take payment *and*
decrement stock *and* create the order. Without a transactional store each write
succeeds or fails on its own, and a crash between them leaves data that no code path
ever intended.

```sequence
title: Without transactions — a crash leaves half an order
participants: API [backend], Stock store, Order store
API -> Stock store: stock = stock - 1
Stock store --> API: ok
API -> Order store: insert order
Order store --> API: connection lost ❌
API --> API: stock decremented, no order exists
```

A relational database with ACID transactions turns that sequence into one unit. Either
every statement takes effect at commit, or none of them does, and concurrent
transactions cannot observe the intermediate state.

```sequence
title: With PostgreSQL — all or nothing
participants: API [backend], PostgreSQL [postgresql]
API -> PostgreSQL: BEGIN
API -> PostgreSQL: UPDATE products SET stock = stock - 1
API -> PostgreSQL: INSERT INTO orders …
API -> PostgreSQL: COMMIT
PostgreSQL --> API: committed (WAL fsynced)
API -> PostgreSQL: crash before COMMIT?
PostgreSQL --> API: ROLLBACK — nothing visible ever changed
```

Constraints, joins and a mature query planner are the other half of the argument: the
database enforces the shape of your data and answers ad-hoc questions you did not plan
for when you wrote the schema.

## Advantages

- Full ACID transactions with MVCC — readers and writers rarely block each other
- Expressive SQL: window functions, CTEs, lateral joins, JSONB operators, full-text search
- Constraints and foreign keys keep invalid data out at the source
- Rich index types (B-tree, GIN, GiST, BRIN, HNSW via pgvector) for many access patterns
- Extensions turn one database into a search, geospatial, time-series or vector store
- Permissive licence, huge ecosystem, available as a managed service everywhere

## Trade-offs

- Vertical scaling of writes: one primary, no built-in sharding
- Connections are heavy processes — pooling is mandatory at scale
- VACUUM and bloat require attention on update-heavy tables
- Schema changes on very large tables need care to avoid long locks
- Replicas lag; reading from them means accepting eventual consistency
- Full-text search and JSON are good, not best-in-class — dedicated engines still win on relevance tuning or flexible documents

## When to use

- Data that must be correct and durable: accounts, orders, payments, inventory
- Relationships and joins matter and queries change over time
- A single database that also needs some JSON, search, geo or vector capability
- Small-to-large services — a single well-tuned instance serves most products
- As the source of truth that caches, search indexes and event streams derive from

## When not to use

- Write volume or dataset size exceeds what one primary can hold — you will need
  application-level sharding or a distributed SQL system
- Sub-millisecond, high-QPS key/value access — use [Redis](/technology/redis) or
  [Memcached](/technology/memcached) in front
- Relevance-ranked full-text search over large corpora — [Elasticsearch](/technology/elasticsearch)
- Deeply nested, per-record-varying documents where you never join — [MongoDB](/technology/mongodb) may fit better
- A durable, replayable event log for many consumers — [Kafka](/technology/kafka)

## Real-world

PostgreSQL is usually the box every arrow eventually points at: the
[Simple Web App](/architecture/simple-web-app) has little else, the
[E-commerce](/architecture/e-commerce) system keeps orders and inventory in it with
Redis and a search index alongside, and the [Chat System](/architecture/chat-system)
persists message history there off the hot path. When the data is document-shaped and
rarely joined, weigh it against [MongoDB](/technology/mongodb).
