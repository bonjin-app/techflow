---
id: indexing
name: Database Indexing
tagline: A sorted side structure that turns a full table scan into a targeted lookup
category: data
tags: [Database, Performance, SQL]
difficulty: 3
prerequisites: [database, sql]
learningPath:
  - database
  - sql
  - indexing
  - transaction
  - partitioning
related:
  - { to: postgresql, rel: RELATED_TO }
  - { to: mysql, rel: RELATED_TO }
  - { to: sql, rel: REQUIRES }
  - { to: database, rel: REQUIRES }
  - { to: partitioning, rel: RELATED_TO }
  - { to: sharding, rel: RELATED_TO }
  - { to: mongodb, rel: RELATED_TO }
  - { to: elasticsearch, rel: RELATED_TO }
  - { to: search-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

An index is a separate, ordered data structure — usually a B-tree — that maps column
values to row locations, so the database can jump to the matching rows instead of reading
every one. It changes lookup cost from *O(n)* to roughly *O(log n)*, which is the
difference between 400 ms and 0.2 ms on a million-row table. Indexes are not free: each
one must be updated on every write, consumes storage, and only helps queries whose shape
matches its columns and order.

## Why it matters

Most "the database is slow" incidents are a missing or unusable index, not insufficient
hardware. The pathology is predictable: a query is fine at 10,000 rows during
development, and at 10 million rows in production the same sequential scan saturates disk
and CPU, holds connections from the pool longer, and drags every other query with it.
Indexing is also the cheapest optimisation available — a single `CREATE INDEX` can remove
the need for a cache, a read replica, or a rewrite.

## Visual

```steps
title: Sequential scan vs index lookup — SELECT * FROM orders WHERE customer_id = 4711
Seq scan: read every page | 2,000,000 rows across ~18 GB, filter each row in memory
Seq scan: cost | ~9 s cold, saturates disk I/O, evicts other data from the buffer pool
Seq scan: result | 12 matching rows returned after touching 2,000,000
Index: descend the B-tree | root → internal → leaf, 3–4 page reads, mostly cached in RAM
Index: read the leaf entries | 12 index entries for customer_id = 4711, already sorted
Index: fetch the heap rows | 12 random reads by row pointer (skipped if the index covers it)
Index: cost | ~0.2 ms, ~16 page reads total
Covering index wins more | INDEX (customer_id, created_at, status) answers from the index alone
Wrong index is ignored | INDEX (created_at) cannot answer this predicate — planner scans anyway
```

## How it works

**B-tree.** The default index type: a balanced tree whose leaves hold sorted key values
plus pointers to rows. Depth grows logarithmically — even a billion rows is 4–5 levels —
and the upper levels stay cached. Because the leaves are ordered and linked, one
structure serves equality (`=`), ranges (`<`, `BETWEEN`), prefix matching
(`LIKE 'abc%'`), `ORDER BY` and `MIN`/`MAX`.

**Composite indexes and the leftmost rule.** An index on `(tenant_id, created_at)` can
serve predicates on `tenant_id`, and on `tenant_id` + `created_at` together, but not on
`created_at` alone. Order the columns: equality predicates first, then the range or sort
column. This is the single most common indexing mistake, and it is why three
single-column indexes are usually worse than one well-ordered composite index.

**Covering indexes and index-only scans.** If every column a query needs is in the index,
the database never touches the table — a large win for wide tables. Add non-searchable
columns as included payload where the engine supports it.

**Clustered versus secondary.** In [MySQL](/technology/mysql)'s InnoDB the table *is* the
primary-key B-tree, and secondary indexes store the primary key, so every secondary
lookup costs a second descent — which is why a large random primary key hurts twice.
[PostgreSQL](/technology/postgresql) keeps rows in a separate heap and all indexes are
secondary, trading that double lookup for visibility-check work instead.

**Other index types.** Hash (equality only), GIN/inverted (arrays, JSON, full-text),
GiST/R-tree (geometry, ranges), BRIN (huge, naturally ordered tables — tiny index,
coarse filtering), and bitmap indexes in analytical stores. Partial indexes
(`WHERE status = 'pending'`) index only the interesting subset, staying small and hot.
Unique indexes are also a *correctness* tool: the cheapest way to enforce
[Idempotency](/concept/idempotency) keys.

## Deep Dive

**Read `EXPLAIN ANALYZE`, not intuition.** It shows the chosen plan, estimated versus
actual rows, and where the time went. Large estimate/actual divergence means stale
statistics or a correlation the planner cannot see — analyse the table, raise the
statistics target, or restate the query. A sequential scan is not automatically wrong: for
a predicate matching 40% of a table it is genuinely faster than millions of random
fetches.

**Predicates that disable an index.** Wrapping the column in a function
(`WHERE lower(email) = …`) unless a matching expression index exists; leading wildcards
(`LIKE '%foo'`); implicit type casts between a `text` column and a number; `OR` across
different columns; and low selectivity — an index on a boolean with a 50/50 split is
rarely usable. Also beware pagination with large `OFFSET`, which walks and discards rows;
prefer keyset pagination on the indexed sort key.

**Write amplification.** Every `INSERT`, `DELETE` and `UPDATE` of an indexed column must
maintain each affected index, so a table with twelve indexes writes thirteen structures.
Random-key indexes (UUIDv4) scatter writes across the whole tree, hurting cache hit rates
and inflating page splits; time-ordered keys (UUIDv7, snowflake ids) append to the right
edge instead. Bulk loads are often fastest with indexes dropped and rebuilt afterwards.

**Bloat and maintenance.** Updates and deletes leave dead entries; indexes grow and lose
locality over time. Periodic rebuilds (concurrently, to avoid blocking writes) restore
performance. Build indexes on large production tables with the non-blocking variant —
`CREATE INDEX CONCURRENTLY` or an online DDL path — because the naive form takes a write
lock for the duration.

**Unused and duplicate indexes.** Check the engine's index usage statistics: unused
indexes cost writes and storage for nothing, and an index on `(a)` is redundant when
`(a, b)` exists. Drop with care — an index used only by a monthly report still matters,
and dropping a unique index removes a constraint.

**Know when an index is not the answer.** Full-text relevance ranking and faceted search
belong in [Elasticsearch](/technology/elasticsearch); wide analytical aggregations belong
in a columnar store; extreme write rates with predictable access may prefer an LSM-tree
engine, which trades read amplification for write throughput. And once a single table's
index no longer fits in memory, the next tools are
[Partitioning](/concept/partitioning) and [Sharding](/concept/sharding), not another
index.
