---
id: mysql-vs-postgresql
name: MySQL vs PostgreSQL
tagline: Two mature relational databases with different defaults, extensions and ecosystems
category: decision
tags: [Database, SQL, Relational, Decision]
difficulty: 3
subjects: [mysql, postgresql]
related:
  - { to: sql, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: replication, rel: RELATED_TO }
  - { to: acid, rel: RELATED_TO }
  - { to: database, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

[MySQL](/technology/mysql) and [PostgreSQL](/technology/postgresql) are both open-source
relational databases that speak [SQL](/concept/sql), run [ACID](/concept/acid) transactions
and scale to very large deployments. For a typical web application either one works, and
the deciding factor is usually what your team and hosting platform already know. Where they
differ: PostgreSQL is stricter about the standard, has a richer type system (JSONB, arrays,
ranges, geospatial via PostGIS) and more advanced query features (CTEs, window functions,
partial and expression indexes) that were there earlier and go deeper. MySQL with InnoDB is
simpler to operate for read-heavy workloads, has a long history of easy asynchronous
replication and clustered primary keys that favour primary-key lookups. Neither is "more
scalable"; they scale differently.

## Comparison

```compare
Feature                  | MySQL [mysql]                                            | PostgreSQL [postgresql]
Storage engine           | Pluggable; InnoDB is the default and what most people mean | One engine, heap tables with MVCC
Primary key layout       | Clustered index: rows stored in PK order                 | Heap; every index (PK included) points to a row location
MVCC / vacuum            | Undo logs, purge thread; no VACUUM                       | Dead tuples left in place; autovacuum required
Standards compliance     | Looser (sql_mode matters; silent truncation historically) | Strict; errors instead of coercion
Data types               | Standard set + JSON                                      | JSONB, arrays, ranges, enums, custom types, PostGIS
Indexes                  | B-tree, full-text, spatial; no partial indexes           | B-tree, GIN, GiST, BRIN, hash, partial, expression
Query features           | CTEs and window functions since 8.0                      | Long-standing, plus lateral joins, rich extensions
Replication              | Binlog-based async / semi-sync, group replication         | Streaming WAL replication, logical replication
Connections              | Thread per connection; cheap to hold thousands           | Process per connection; pooler (PgBouncer) at scale
Concurrency model        | Gap locks in REPEATABLE READ can surprise               | Serializable snapshot isolation available
Extensions               | Few                                                     | Many (PostGIS, pgvector, TimescaleDB, pg_partman)
Managed hosting          | Everywhere; also the base of Aurora MySQL, Vitess, PlanetScale | Everywhere; also Aurora PostgreSQL, Supabase, Neon
```

## Decision

```decision
? Does the workload rely on advanced SQL or types (JSONB queries, arrays, geospatial, window-heavy analytics)?
  YES -> PostgreSQL [postgresql]
  NO -> ? Does the team or platform already operate one of them well?
    YES -> Use the one you already run
    NO -> ? Is it read-heavy CRUD by primary key with many cheap connections (e.g. PHP/CMS style)?
      YES -> MySQL [mysql]
      NO -> ? Do you expect to add extensions later (vector search, time series, GIS)?
        YES -> PostgreSQL [postgresql]
        NO -> PostgreSQL [postgresql]
```

## When MySQL

- Read-heavy OLTP dominated by primary-key and simple secondary-index lookups, where the
  clustered layout makes point reads and range scans on the key very efficient.
- Applications that open many short-lived connections (classic PHP, serverless bursts)
  and want to avoid a connection pooler in front.
- An ecosystem built around it: WordPress and most PHP frameworks, the Rails/Laravel
  hosting defaults, or a sharding layer such as Vitess.
- Operationally simple asynchronous [replication](/concept/replication) for read replicas
  and cross-region copies is the main scaling story, and you are comfortable with it.
- The team already knows MySQL's quirks (`sql_mode`, InnoDB locking) and there is no
  feature pulling you elsewhere.

## When PostgreSQL

- The schema needs semi-structured data queried and indexed (JSONB with GIN indexes)
  alongside relational tables, or arrays, ranges and custom types.
- Complex queries: reporting, analytics, recursive CTEs, window functions, lateral joins —
  the planner and feature set are more mature.
- You want strictness: invalid data should fail loudly rather than be coerced or truncated.
- Extensions matter — PostGIS for geospatial, pgvector for embeddings, TimescaleDB for
  time series, logical replication for change-data-capture into [Kafka](/technology/kafka).
- Concurrency correctness matters and you want true `SERIALIZABLE` isolation or
  transactional DDL (schema migrations that roll back).

## Deep Dive

**Row storage.** InnoDB stores a table *as* its primary-key B-tree: the leaf pages contain
the rows, in key order. Secondary indexes store the primary key, so a secondary lookup is
two B-tree descents, and a wide or random primary key (UUIDv4) bloats every index and
scatters inserts across pages. PostgreSQL stores rows in a heap in insertion order; every
index, including the primary key, points at a physical location (ctid). Secondary lookups
are one descent plus a heap fetch, and the primary key's shape does not affect other
indexes — but an update that changes any indexed column, or one not covered by a HOT
update, writes to every index.

**MVCC and cleanup.** Both give readers a consistent snapshot without blocking writers,
but they keep old versions differently. InnoDB writes the previous version into an undo
log and purges it in the background; the table itself stays compact. PostgreSQL leaves the
old tuple in the table marked dead and relies on autovacuum to reclaim it and to prevent
transaction-id wraparound. Under heavy update churn a mistuned autovacuum causes table
bloat and slow scans — the single most common PostgreSQL operational problem, and one
MySQL simply does not have. In exchange PostgreSQL rollbacks are instant (nothing to undo)
and long-running transactions do not fill an undo tablespace.

**Isolation.** MySQL's default is `REPEATABLE READ`, implemented with next-key (gap)
locks that can block inserts into ranges other transactions merely read — a frequent
source of unexpected [deadlocks](/concept/deadlock). PostgreSQL defaults to `READ
COMMITTED` and offers `SERIALIZABLE` via snapshot isolation with conflict detection:
no gap locks, but a transaction may be aborted at commit and must be retried by the
application. See [Transaction](/concept/transaction).

**Replication.** MySQL replicates by shipping the binary log — either statement or row
events — to replicas that re-apply it; it is easy to set up, easy to make multi-source,
and the basis of most MySQL scale-out stories. PostgreSQL streams its write-ahead log
byte-for-byte to physical replicas (identical copies, read-only), and since version 10
offers logical replication of selected tables, which is what feeds CDC pipelines. Failover
tooling is external in both cases (Orchestrator/MHA vs Patroni), and neither does
automatic [sharding](/concept/sharding) — that is Vitess or Citus territory.

**Connections.** A MySQL connection is a thread; thousands are fine. A PostgreSQL
connection is a forked process with its own memory, so a few hundred is the practical
ceiling and applications with many workers need PgBouncer or a built-in pooler. This
matters most for serverless and for frameworks that open a connection per request.

**JSON.** MySQL's `JSON` type validates and stores documents in a binary form and can
index generated columns extracted from them. PostgreSQL's `JSONB` goes further: GIN indexes
over the whole document, containment and path operators, and JSON functions that compose
with the rest of SQL. If "relational core plus a flexible document column" describes your
model, this is often the deciding feature — compare [PostgreSQL vs MongoDB](/compare/postgresql-vs-mongodb).

## Related

- [SQL](/concept/sql) — the language both speak, with dialect differences
- [Transaction](/concept/transaction) and [ACID](/concept/acid) — isolation behaviour differs in practice
- [Replication](/concept/replication) — binlog vs WAL streaming
- [Database](/concept/database) — where relational stores fit among alternatives
- [PostgreSQL vs MongoDB](/compare/postgresql-vs-mongodb) — the relational vs document question
