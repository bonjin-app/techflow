---
id: sql
name: SQL
tagline: The declarative language for defining, querying and changing relational data
category: data
tags: [Data, Query Language, Fundamentals]
difficulty: 2
prerequisites: [database]
learningPath:
  - database
  - sql
  - transaction
  - acid
  - postgresql
related:
  - { to: database, rel: REQUIRES }
  - { to: postgresql, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: acid, rel: RELATED_TO }
  - { to: mongodb, rel: RELATED_TO }
  - { to: sharding, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

SQL (Structured Query Language) is how applications talk to relational databases
such as [PostgreSQL](/technology/postgresql). It is **declarative**: you describe the
result you want — which rows, joined how, aggregated by what — and the database's
planner decides how to compute it. The same language creates tables and indexes
(DDL), reads and writes rows (DML) and delimits [Transactions](/concept/transaction).
Almost every backend engineer reads SQL daily, even behind an ORM.

## Why it matters

The database does the heavy lifting in most systems, and SQL is the only lever you
have over it. A query that asks for exactly the rows it needs, hits an index and
lets the database join and aggregate will be a hundred times faster than one that
pulls everything into application memory and filters there. Conversely the worst
performance problems in web backends — N+1 queries, missing indexes, full scans on
large tables — are SQL problems wearing an ORM costume. Understanding how a
statement is executed turns "the database is slow" into a fixable diagnosis.

## Visual

```steps
title: Logical order in which a SELECT is evaluated
FROM / JOIN | which tables, how rows are combined
WHERE | filter individual rows (indexes are used here)
GROUP BY | collapse rows into groups
HAVING | filter groups
SELECT | compute output columns and aggregates
ORDER BY | sort the result
LIMIT / OFFSET | keep a slice
```

```sequence
title: From text to rows
participants: App [backend], Parser, Planner, Executor, Storage [database]
App -> Parser: SELECT u.name, count(*) FROM users u JOIN orders o ON … GROUP BY u.name
Parser -> Planner: syntax tree, resolved tables and columns
Planner -> Planner: choose index scan vs seq scan, join order, hash vs nested loop
Planner -> Executor: execution plan
Executor -> Storage: read index on orders(user_id), fetch pages
Storage --> Executor: tuples
Executor -> Executor: hash aggregate by name
Executor --> App: result rows
```

## How it works

**Three sub-languages.**

- *DDL* — `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`. Defines schema and
  constraints (`PRIMARY KEY`, `UNIQUE`, `FOREIGN KEY`, `CHECK`, `NOT NULL`).
  Constraints are the cheapest correctness tool you own: the database enforces them
  under concurrency so application code does not have to.
- *DML* — `SELECT`, `INSERT`, `UPDATE`, `DELETE`. `INSERT … ON CONFLICT` (upsert) and
  `RETURNING` remove common round trips.
- *TCL* — `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`. Groups statements into an
  atomic unit; see [ACID](/concept/acid).

**Joins** combine rows from two tables on a condition. `INNER JOIN` keeps matches
only; `LEFT JOIN` keeps every left row, filling missing right columns with `NULL`.
Joining in the database is almost always cheaper than fetching two result sets and
matching them in code.

**Indexes and the planner.** `WHERE email = $1` uses an index on `email`; `WHERE
lower(email) = $1` does not unless the index is on `lower(email)`. `EXPLAIN ANALYZE`
shows the plan the database actually chose and the real row counts. A "Seq Scan" on
a large table in a hot query is the usual smoking gun.

**Parameters, not string concatenation.** `WHERE id = $1` with a bound value is safe;
`"WHERE id = " + input` is SQL injection. Every driver and ORM supports parameters;
there is no reason to build query strings from user input.

```sql
-- Upsert with a returned id: one round trip, no race between SELECT and INSERT
INSERT INTO users (email, name)
VALUES ($1, $2)
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
RETURNING id;
```

## Deep Dive

**Declarative means the plan can change.** The planner picks a strategy from table
statistics. When data grows or its distribution shifts, the same query may flip from
an index scan to a sequential scan overnight. Monitor slow queries, keep statistics
fresh (`ANALYZE`), and avoid patterns that defeat indexes: leading wildcards
(`LIKE '%x'`), functions on indexed columns, implicit type casts.

**N+1.** Loading a list of 100 orders and then running one query per order for its
customer produces 101 round trips. Fix with a join or a single `WHERE id IN (…)`.
ORMs make this easy to cause and easy to miss; log query counts per request.

**Pagination.** `OFFSET 100000` still reads and discards 100,000 rows. Keyset
pagination (`WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC
LIMIT 50`) stays fast at any depth.

**Locking semantics.** `SELECT … FOR UPDATE` locks the returned rows until the
transaction ends, serialising concurrent updaters and preventing a
[Race Condition](/concept/race-condition). Held too long or acquired in inconsistent
order, the same locks produce a [Deadlock](/concept/deadlock).

**Dialects.** The SQL standard is large and every engine deviates: `RETURNING`,
`ON CONFLICT`, JSON operators, window function details and `LIMIT` syntax differ
between PostgreSQL, MySQL and SQL Server. Portable SQL is a goal, not a guarantee.

**Beyond relational.** Document databases such as [MongoDB](/technology/mongodb) use
their own query APIs, and analytics engines such as
[Elasticsearch](/technology/elasticsearch) use JSON DSLs; many of them have grown SQL
front-ends because the language is so widely known. With [Sharding](/concept/sharding)
the SQL model itself is strained: joins and transactions across shards are either
unsupported or expensive, which is why sharded schemas are designed around a shard
key. See [PostgreSQL vs MongoDB](/compare/postgresql-vs-mongodb) for the modelling
trade-off.
