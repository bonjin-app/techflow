---
id: mysql
name: MySQL
tagline: Widely deployed relational database with the InnoDB engine and simple, fast replication
category: database
tags: [Database, Relational, SQL, OLTP]
difficulty: 2
usedFor: [database, sql, transaction, replication]
prerequisites: [database, sql, transaction, acid]
learningPath:
  - programming-fundamentals
  - database
  - sql
  - transaction
  - acid
  - mysql
  - replication
  - sharding
related:
  - { to: postgresql, rel: ALTERNATIVE_TO }
  - { to: mysql-vs-postgresql, rel: RELATED_TO }
  - { to: acid, rel: RELATED_TO }
  - { to: replication, rel: RELATED_TO }
  - { to: deadlock, rel: RELATED_TO }
  - { to: redis, rel: USED_WITH }
  - { to: e-commerce, rel: USED_IN }
  - { to: payment-system, rel: USED_IN }
  - { to: authentication-system, rel: USED_IN }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "MySQL 8.4 LTS / 9.x Innovation", confidence: high }
---

## TL;DR

MySQL is an open-source relational database that stores rows in tables, enforces a
schema, and gives you [ACID](/concept/acid) transactions through its default storage
engine, InnoDB. It has been the system of record behind a huge share of web applications
for two decades, so every hosting provider, ORM and ops team knows it. Its strengths are
straightforward OLTP workloads, predictable primary-key lookups and easy asynchronous
[replication](/concept/replication); its weaknesses show in advanced SQL features and
complex analytical queries, where [PostgreSQL](/technology/postgresql) is usually
stronger.

## Practical

A typical MySQL deployment is one primary that takes writes and one or more replicas
that serve reads and stand by for failover, usually as a managed cloud service
(Amazon RDS/Aurora MySQL, Cloud SQL, Azure Database for MySQL) or a compatible fork
(MariaDB, Percona Server).

- Use InnoDB for everything; choose a compact, monotonically increasing primary key
  (auto-increment or a time-ordered id) because InnoDB clusters rows by primary key.
- Set `utf8mb4` as the character set; design indexes for the queries you actually run
  and check them with `EXPLAIN`.
- Keep transactions short; the default isolation level `REPEATABLE READ` plus gap
  locks is a common source of [deadlocks](/concept/deadlock) on insert-heavy tables.
- Route reads to replicas only where slightly stale data is acceptable; replication is
  asynchronous or semi-synchronous unless you run Group Replication/InnoDB Cluster.
- Back up with logical dumps for small data and physical snapshots plus binary logs for
  point-in-time recovery on anything large.

```sql
-- Idempotent order capture with a unique key and a short transaction
CREATE TABLE orders (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id   BIGINT UNSIGNED NOT NULL,
  client_token  CHAR(36)        NOT NULL,          -- idempotency key
  total_minor   INT UNSIGNED    NOT NULL,
  status        ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_client_token (client_token),
  KEY ix_customer_created (customer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

START TRANSACTION;
INSERT INTO orders (customer_id, client_token, total_minor) VALUES (42, ?, 1250)
  ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);   -- retry-safe
UPDATE inventory SET qty = qty - 1 WHERE sku = ? AND qty > 0;
COMMIT;
```

Most applications also put [Redis](/technology/redis) in front for caching hot rows and
sessions, so the database sees mostly writes and cache misses.

## Deep Dive

**InnoDB storage.** Tables are clustered indexes: the row data lives in the leaf pages
of the primary-key B+tree, and every secondary index stores the primary key as its
pointer. A wide or random primary key (UUIDv4) therefore bloats every index and
fragments inserts. Undo logs implement MVCC so readers do not block writers; the redo
log and doublewrite buffer provide crash recovery.

**Locking and isolation.** Row locks are taken on index records, so a query that cannot
use an index locks far more than you expect. `REPEATABLE READ` adds gap and next-key
locks to prevent phantoms, which is where most surprising deadlocks and lock-wait
timeouts come from. Many high-write systems switch to `READ COMMITTED`. See
[Transaction](/concept/transaction) and [Race Condition](/concept/race-condition).

**Replication.** The primary writes a binary log; replicas pull and apply it. Row-based
logging with GTIDs makes failover and replica rebuilds tractable. Replication is
asynchronous by default — a failover can lose the last committed transactions — and
replica lag is a first-class concern for read routing. Group Replication offers
single-primary consensus at the cost of write latency.

**Query optimiser and SQL surface.** MySQL added window functions, CTEs, JSON functions
and invisible/functional indexes in 8.x, and 9.x adds vector types and JavaScript
stored programs in the commercial edition. It still lacks some features other databases
consider basic — richer index types, transactional DDL, deferred constraints — and its
optimiser can pick poor plans for complex joins or subqueries.

**Scaling.** Vertical scaling and read replicas take most applications very far. Beyond
that, [sharding](/concept/sharding) by tenant or user id is done at the application layer
or with Vitess, which adds routing and resharding but removes cross-shard transactions.

## Why

An application keeps facts that must not be lost or half-applied: an order was placed,
stock was decremented, a payment was recorded. Keeping them in files or an in-memory
store means concurrent requests overwrite each other, a crash mid-update leaves the
data inconsistent, and there is no way to ask ad-hoc questions later.

```sequence
title: Before — application manages consistency by hand
participants: Checkout [backend], Files
Checkout -> Files: read inventory.json (qty = 1)
Checkout -> Files: read inventory.json (second request, qty = 1)
Checkout -> Files: write qty = 0 (order A)
Checkout -> Files: write qty = 0 (order B) — oversold ❌
Checkout -> Files: append orders.log … process crashes mid-write
Files --> Checkout: corrupt line, no rollback
```

A relational database with InnoDB makes the two writes serialise on the row lock, keeps
the order and the stock change in one atomic unit, and persists them durably before
acknowledging. The schema and indexes let you query the same data from any angle later.

```sequence
title: After — MySQL transaction serialises the writes and survives crashes
participants: Checkout [backend], MySQL [mysql]
Checkout -> MySQL: BEGIN; UPDATE inventory SET qty=qty-1 WHERE sku=? AND qty>0
MySQL --> Checkout: 1 row (row lock held)
Checkout -> MySQL: INSERT INTO orders … ; COMMIT
MySQL --> Checkout: OK (redo log fsynced)
Checkout -> MySQL: BEGIN; UPDATE inventory … (order B, waits on lock)
MySQL --> Checkout: 0 rows — out of stock, ROLLBACK
Checkout -> MySQL: SELECT … FROM orders WHERE customer_id=? ORDER BY created_at
MySQL --> Checkout: rows via ix_customer_created
```

The reason MySQL specifically became the default is pragmatic: it is fast for the
primary-key lookups and short transactions web apps mostly do, and it is available
everywhere with well-trodden replication and backup practices.

## Advantages

- Excellent performance for OLTP: point lookups, short transactions, high connection counts
- InnoDB gives ACID transactions, MVCC and crash recovery by default
- Simple, well-understood asynchronous replication with GTIDs; read scaling is easy
- Ubiquitous: managed offerings on every cloud, mature drivers and ORMs, huge operational knowledge base
- Compatible ecosystem (MariaDB, Percona, Aurora, Vitess, PlanetScale) offers choices without changing the app
- Low operational learning curve for small teams

## Trade-offs

- Weaker SQL feature set and optimiser than PostgreSQL for complex joins, CTE-heavy queries and analytics
- Gap locking under the default isolation level causes surprising deadlocks and lock waits
- No transactional DDL; schema migrations on large tables need online tooling (gh-ost, pt-online-schema-change) or Instant DDL where supported
- Asynchronous replication can lose writes on failover; synchronous options cost latency
- Licensing is dual (GPL/commercial) under one vendor; some features are enterprise-only
- Clustered primary key design mistakes (random UUIDs) are hard to fix later

## When to use

- Transactional web and mobile backends with a mostly primary-key and simple-join access pattern
- Systems of record for orders, accounts, users and inventory that need ACID guarantees
- Teams and platforms where MySQL-compatible managed services or existing expertise already exist
- Read-heavy workloads that scale well with replicas plus a cache layer
- Multi-tenant SaaS that will later shard by tenant with Vitess or application routing

## When not to use

- Don't use MySQL when you need advanced SQL — rich index types, full-text with ranking, geospatial depth, transactional DDL — choose [PostgreSQL](/technology/postgresql). See [MySQL vs PostgreSQL](/compare/mysql-vs-postgresql)
- For analytical/OLAP queries over billions of rows; use a columnar warehouse
- When the access pattern is a simple key-value lookup at massive scale with no joins — a store like [DynamoDB](/technology/dynamodb) removes the operational ceiling
- For document-shaped, schema-flexible data where [MongoDB](/technology/mongodb) fits the model better
- As a cache, queue or pub/sub bus — those are jobs for [Redis](/technology/redis) or a broker

## Real-world

MySQL is the classic system of record under the [Simple Web App](/architecture/simple-web-app)
and [E-commerce](/architecture/e-commerce) architectures: one primary, a couple of
replicas for reads and reporting, Redis for cache and sessions. In an
[Authentication System](/architecture/authentication-system) it stores users,
credentials and refresh tokens with unique indexes enforcing identity constraints; in a
[Payment System](/architecture/payment-system) it holds orders and ledger entries where
row locks and short transactions prevent double charges, with an
[Outbox](/pattern/outbox) table to publish events reliably. Very large deployments run it
sharded behind Vitess.
